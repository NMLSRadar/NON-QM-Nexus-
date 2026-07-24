"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { getAiProvider, parseStructured } from "@/lib/ai/provider";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt, extractionResultSchema } from "@/domain/validation/programExtractionSchema";

export interface UploadState {
  error?: string;
  success?: boolean;
  extractionError?: string;
  programsFound?: number;
}

const BUCKET = "lender-documents";

export async function uploadLenderDocument(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const { supabase, userId } = await requirePlatformAdmin();

  const file = formData.get("file");
  const existingLenderId = formData.get("lenderId");
  const newLenderName = formData.get("newLenderName");
  const newLenderTier = formData.get("newLenderTier");

  if (!(file instanceof File)) {
    return { error: "Choose a PDF file to upload." };
  }
  if (file.type !== "application/pdf") {
    return { error: "Only PDF files are supported." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { error: "File is too large (max 20 MB)." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) return { error: membershipError.message };
  if (!membership) return { error: "Your admin account has no organization to import into." };
  const organizationId = membership.organization_id as string;

  // Resolve (or create) the lender this document belongs to.
  let lenderId: string;
  if (typeof existingLenderId === "string" && existingLenderId) {
    lenderId = existingLenderId;
  } else if (typeof newLenderName === "string" && newLenderName.trim()) {
    const tier = Number(newLenderTier) || 3;
    const { data: created, error: createError } = await supabase
      .from("lenders")
      .insert({
        organization_id: organizationId,
        name: newLenderName.trim(),
        tier_level: tier,
        is_sample_data: false,
        active: true,
        created_by: userId,
      })
      .select("id")
      .single();
    if (createError) return { error: `Failed to create lender: ${createError.message}` };
    lenderId = created!.id as string;
  } else {
    return { error: "Pick an existing lender or enter a name for a new one." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const storagePath = `${lenderId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { data: document, error: docError } = await supabase
    .from("documents")
    .insert({
      organization_id: organizationId,
      lender_id: lenderId,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: "application/pdf",
      size_bytes: file.size,
      classification: "lender_guideline",
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (docError) return { error: `Document record failed: ${docError.message}` };
  const documentId = document!.id as string;

  // Run extraction. A failure here doesn't undo the upload — the document
  // stays on record and an admin can still enter programs manually or via
  // CSV; we just report the extraction problem separately.
  try {
    const base64 = Buffer.from(bytes).toString("base64");
    const provider = getAiProvider();
    const raw = await provider.completeWithDocument({
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt: buildExtractionUserPrompt(),
      documentBase64: base64,
      maxTokens: 4000,
    });
    const result = parseStructured(raw, extractionResultSchema);

    const { error: extractionError } = await supabase.from("document_extractions").insert({
      organization_id: organizationId,
      document_id: documentId,
      extractor: `ai:${provider.name}`,
      fields: result,
    });
    if (extractionError) {
      return { success: true, extractionError: `Saved the document but failed to store the extraction: ${extractionError.message}` };
    }

    revalidatePath("/admin/documents");
    return { success: true, programsFound: result.programs.length };
  } catch (err) {
    revalidatePath("/admin/documents");
    return {
      success: true,
      extractionError: `Document uploaded, but AI extraction failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
