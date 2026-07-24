"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { extractedProgramSchema } from "@/domain/validation/programExtractionSchema";

export interface ReviewActionResult {
  error?: string;
  success?: boolean;
}

/**
 * Approves one proposed program from an extraction: validates the
 * (possibly admin-edited) JSON against the same strict schema the AI
 * output was checked against, then creates a real Program + its
 * guideline_version. The guideline_version is marked human_verified
 * because an admin has now reviewed and approved it — matching
 * docs/architecture.md's rule that AI-extracted content never
 * auto-activates.
 */
export async function approveExtractedProgram(
  extractionId: string,
  programIndex: number,
  editedProgramJson: string
): Promise<ReviewActionResult> {
  const { supabase, userId } = await requirePlatformAdmin();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(editedProgramJson);
  } catch {
    return { error: "That's not valid JSON — fix the syntax and try again." };
  }
  const result = extractedProgramSchema.safeParse(parsedJson);
  if (!result.success) {
    return { error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const program = result.data;

  const { data: extraction, error: extractionError } = await supabase
    .from("document_extractions")
    .select("id, organization_id, document_id, fields, confirmed_at, documents(lender_id)")
    .eq("id", extractionId)
    .single();
  if (extractionError) return { error: extractionError.message };

  const lenderId = (Array.isArray(extraction.documents) ? extraction.documents[0] : extraction.documents)?.lender_id as
    | string
    | undefined;
  if (!lenderId) return { error: "This extraction is not linked to a lender." };

  const config = {
    lenderId,
    isSampleData: false,
    active: true,
    incomeDocTypes: program.incomeDocTypes,
    loanPurposes: program.loanPurposes,
    occupancies: program.occupancies,
    propertyTypes: program.propertyTypes,
    eligibleStates: program.eligibleStates,
    citizenshipEligible: program.citizenshipEligible,
    vestingEligible: program.vestingEligible,
    minLoanAmount: program.minLoanAmount,
    maxLoanAmount: program.maxLoanAmount,
    minFico: program.minFico,
    maxDti: program.maxDti ?? undefined,
    minDscr: program.minDscr ?? undefined,
    baseMaxLtv: program.baseMaxLtv,
    minReservesMonths: program.minReservesMonths,
    interestOnlyAvailable: program.interestOnlyAvailable,
    prepaymentPenaltyOptions: program.prepaymentPenaltyOptions,
    guidelineVersionLabel: program.guidelineVersionLabel,
    effectiveDate: program.effectiveDate,
    lastVerifiedDate: program.lastVerifiedDate ?? undefined,
    sourceCitation: program.sourceCitation,
    notes: program.notes ?? undefined,
  };

  const { data: createdProgram, error: programError } = await supabase
    .from("programs")
    .insert({
      organization_id: extraction.organization_id,
      lender_id: lenderId,
      name: program.name,
      is_sample_data: false,
      active: true,
      config,
      created_by: userId,
    })
    .select("id")
    .single();
  if (programError) return { error: `Failed to create program: ${programError.message}` };

  const { error: gvError } = await supabase.from("guideline_versions").insert({
    organization_id: extraction.organization_id,
    program_id: createdProgram!.id,
    label: program.guidelineVersionLabel,
    effective_date: program.effectiveDate,
    last_verified_date: program.lastVerifiedDate ?? null,
    verification_status: "human_verified",
    reviewed_by: userId,
    published_at: new Date().toISOString(),
  });
  if (gvError) return { error: `Program created, but its guideline version failed: ${gvError.message}` };

  // Remove this program from the extraction's pending list (rather than
  // marking the whole extraction confirmed, since other programs in the
  // same document may still be pending review).
  const fields = extraction.fields as { lenderNameFound?: string | null; programs: unknown[] };
  const remaining = fields.programs.filter((_, i) => i !== programIndex);
  const { error: updateError } = await supabase
    .from("document_extractions")
    .update({ fields: { ...fields, programs: remaining }, confirmed_by: userId, confirmed_at: new Date().toISOString() })
    .eq("id", extractionId);
  if (updateError) return { error: `Program created, but updating the extraction record failed: ${updateError.message}` };

  revalidatePath("/admin/documents");
  revalidatePath("/admin/lenders");
  return { success: true };
}

/** Discards one proposed program from an extraction without creating anything. */
export async function rejectExtractedProgram(extractionId: string, programIndex: number): Promise<ReviewActionResult> {
  const { supabase, userId } = await requirePlatformAdmin();

  const { data: extraction, error } = await supabase
    .from("document_extractions")
    .select("id, fields")
    .eq("id", extractionId)
    .single();
  if (error) return { error: error.message };

  const fields = extraction.fields as { lenderNameFound?: string | null; programs: unknown[] };
  const remaining = fields.programs.filter((_, i) => i !== programIndex);
  const { error: updateError } = await supabase
    .from("document_extractions")
    .update({ fields: { ...fields, programs: remaining }, confirmed_by: userId, confirmed_at: new Date().toISOString() })
    .eq("id", extractionId);
  if (updateError) return { error: updateError.message };

  revalidatePath("/admin/documents");
  return { success: true };
}
