"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";

/**
 * The chatbot-precision structured fields (Part 1 §5) an admin can edit on a
 * program. Every field is optional = "not populated"; the chatbot says so
 * plainly rather than inferring. Written read-modify-write into programs.config
 * so no other field is clobbered.
 */
export interface StructuredFieldInput {
  mortgage_late_tolerance?: { maxLates30?: number; maxLates60?: number; maxLates90?: number; lookbackMonths?: number; ltvOrFicoAdjustment?: string } | null;
  credit_event_seasoning?: Record<string, number> | null;
  exception_policy?: "none" | "case_by_case" | "documented_program" | null;
  exception_notes?: string | null;
  estimated_turn_times?: { clearance?: string; ctc?: string; lastUpdated?: string } | null;
  borrower_eligibility?: { itin?: boolean; foreignNational?: boolean; nonPermanentResident?: boolean; vestingOptions?: string[] } | null;
  property_eligibility?: { nonWarrantableCondo?: boolean; condotel?: boolean; rural?: boolean; str?: boolean; mixedUse?: boolean } | null;
  first_time_investor_treatment?: { ltvAdjustment?: number; ficoAdjustment?: number } | null;
  first_time_homebuyer_treatment?: { ltvAdjustment?: number; ficoAdjustment?: number } | null;
}

export async function updateProgramStructuredFields(programId: string, input: StructuredFieldInput): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  const { data, error: readError } = await supabase.from("programs").select("config").eq("id", programId).single();
  if (readError) throw new Error(readError.message);
  const config = { ...(data.config as Record<string, unknown>) };

  // Only set keys the admin actually edited; null clears the field.
  const setOrClear = (key: string, value: unknown) => {
    if (value === null) delete config[key];
    else config[key] = value;
  };
  setOrClear("mortgageLateTolerance", input.mortgage_late_tolerance);
  setOrClear("creditEventSeasoning", input.credit_event_seasoning);
  setOrClear("exceptionPolicy", input.exception_policy);
  setOrClear("exceptionNotes", input.exception_notes);
  setOrClear("estimatedTurnTimes", input.estimated_turn_times);
  setOrClear("borrowerEligibility", input.borrower_eligibility);
  setOrClear("propertyEligibility", input.property_eligibility);
  setOrClear("firstTimeInvestorTreatment", input.first_time_investor_treatment);
  setOrClear("firstTimeHomebuyerTreatment", input.first_time_homebuyer_treatment);

  const { error: writeError } = await supabase.from("programs").update({ config }).eq("id", programId);
  if (writeError) throw new Error(writeError.message);
  revalidatePath("/admin/program-fields");
}