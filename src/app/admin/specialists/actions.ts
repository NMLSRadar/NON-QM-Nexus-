"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";

/**
 * Toggle a program's editorial "specialist" flag (foreignNationalSpecialist
 * or itinSpecialist) — see Program type doc comments in
 * src/domain/types/program.ts. This NEVER touches real guideline fields
 * (baseMaxLtv, citizenshipEligible, etc.); it only flips one boolean inside
 * the program's config JSONB, read-modify-write to avoid clobbering any
 * other field an admin or an ingestion script has set.
 */
export async function setProgramSpecialistFlag(
  programId: string,
  flag: "foreignNationalSpecialist" | "itinSpecialist" | "bankStatementCleanExecution" | "bankStatementFlexible",
  value: boolean,
): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  const { data, error: readError } = await supabase.from("programs").select("config").eq("id", programId).single();
  if (readError) throw new Error(readError.message);
  const config = { ...(data.config as Record<string, unknown>), [flag]: value };
  const { error: writeError } = await supabase.from("programs").update({ config }).eq("id", programId);
  if (writeError) throw new Error(writeError.message);
  revalidatePath("/admin/specialists");
}
