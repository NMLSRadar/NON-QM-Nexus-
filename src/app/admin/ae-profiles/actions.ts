"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { aeProfileImportRowSchema, REQUIRED_AE_CSV_COLUMNS, type AeProfileImportRow } from "@/domain/validation/aeProfileImportSchema";

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportPreview {
  totalRows: number;
  validRows: AeProfileImportRow[];
  errors: RowError[];
}

export interface PreviewState {
  preview?: ImportPreview;
  csvText?: string;
  error?: string;
}

export async function previewAeImport(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requirePlatformAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a CSV file to upload." };
  if (file.size > 5 * 1024 * 1024) return { error: "File is too large (max 5 MB)." };

  const csvText = await file.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    return { error: `Could not parse CSV: ${parsed.errors[0]?.message ?? "unknown error"} (row ${(parsed.errors[0]?.row ?? 0) + 2})` };
  }

  const headers = parsed.meta.fields ?? [];
  const missingColumns = REQUIRED_AE_CSV_COLUMNS.filter((c) => !headers.includes(c));
  if (missingColumns.length > 0) return { error: `Missing required columns: ${missingColumns.join(", ")}` };

  const errors: RowError[] = [];
  const validRows: AeProfileImportRow[] = [];
  parsed.data.forEach((raw, i) => {
    const rowNumber = i + 2;
    const result = aeProfileImportRowSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) errors.push({ row: rowNumber, field: issue.path.join("."), message: issue.message });
    } else {
      validRows.push(result.data);
    }
  });

  return { preview: { totalRows: parsed.data.length, validRows, errors }, csvText };
}

export async function commitAeImport(csvText: string): Promise<{ created: number; error?: string }> {
  const { supabase } = await requirePlatformAdmin();

  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const rows: AeProfileImportRow[] = [];
  for (const raw of parsed.data) {
    const result = aeProfileImportRowSchema.safeParse(raw);
    if (result.success) rows.push(result.data);
  }
  if (rows.length === 0) return { created: 0, error: "No valid rows to import." };

  const lenderNames = [...new Set(rows.map((r) => r.lender_name.trim().toLowerCase()))];
  const { data: lenders, error: lenderError } = await supabase.from("lenders").select("id, name");
  if (lenderError) return { created: 0, error: lenderError.message };
  const lenderIdByName = new Map((lenders ?? []).map((l) => [(l.name as string).trim().toLowerCase(), l.id as string]));

  const missingLenders = lenderNames.filter((n) => !lenderIdByName.has(n));
  if (missingLenders.length > 0) {
    return { created: 0, error: `Unknown lender(s) — create the lender first: ${missingLenders.join(", ")}` };
  }

  const insertRows = rows.map((r) => ({
    lender_id: lenderIdByName.get(r.lender_name.trim().toLowerCase()),
    name: r.name,
    title: r.title || null,
    email: r.email,
    phone: r.phone || null,
    nmls_id: r.nmls_id || null,
    states: r.states,
    status: "unclaimed",
  }));

  const { error: insertError } = await supabase.from("ae_profiles").insert(insertRows);
  if (insertError) return { created: 0, error: insertError.message };

  revalidatePath("/admin/ae-profiles");
  return { created: insertRows.length };
}

export async function createAeProfile(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin();
  const lenderId = formData.get("lenderId") as string;
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  if (!lenderId || !name || !email) return { error: "Lender, name, and email are required." };

  const { error } = await supabase.from("ae_profiles").insert({
    lender_id: lenderId,
    name,
    title: (formData.get("title") as string) || null,
    email,
    phone: (formData.get("phone") as string) || null,
    nmls_id: (formData.get("nmlsId") as string) || null,
    states: ((formData.get("states") as string) || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    status: "unclaimed",
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/ae-profiles");
  return {};
}

export async function updateAeProfileStatus(profileId: string, status: "unclaimed" | "claimed" | "hidden"): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.from("ae_profiles").update({ status }).eq("id", profileId);
  if (error) return { error: error.message };
  revalidatePath("/admin/ae-profiles");
  return {};
}

export async function deleteAeProfile(profileId: string): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.from("ae_profiles").delete().eq("id", profileId);
  if (error) return { error: error.message };
  revalidatePath("/admin/ae-profiles");
  return {};
}

export async function setLenderEmailDomain(lenderId: string, emailDomain: string): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.from("lenders").update({ email_domain: emailDomain.trim().toLowerCase() || null }).eq("id", lenderId);
  if (error) return { error: error.message };
  revalidatePath("/admin/ae-profiles");
  return {};
}
