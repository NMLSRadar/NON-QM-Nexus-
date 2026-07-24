"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { programImportRowSchema, type ProgramImportRow } from "@/domain/validation/programImportSchema";

export interface CommitResult {
  error?: string;
  success?: boolean;
  lendersCreated?: number;
  programsCreated?: number;
}

/**
 * Re-parses and re-validates the CSV server-side (never trusts the
 * client-side preview alone) and creates lenders (reusing one by
 * case-insensitive name if it already exists) + a program + its
 * guideline_version for every valid row.
 *
 * Imported lenders/programs land in the ADMIN'S OWN organization — the
 * catalog today is still seeded per-organization (see
 * docs/membership.md), so this is the one concrete org available to write
 * into. Other organizations' users won't automatically see this imported
 * data; sharing one real catalog across every organization is a separate,
 * bigger architectural change not covered by this import feature.
 */
export async function commitImport(csvText: string): Promise<CommitResult> {
  const { supabase, userId } = await requirePlatformAdmin();

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

  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const validRows: ProgramImportRow[] = [];
  for (const raw of parsed.data) {
    const result = programImportRowSchema.safeParse(raw);
    if (result.success) validRows.push(result.data);
  }
  if (validRows.length === 0) {
    return { error: "No valid rows to import." };
  }

  const lenderIdByName = new Map<string, string>();
  let lendersCreated = 0;
  let programsCreated = 0;

  for (const row of validRows) {
    const key = row.lender_name.trim().toLowerCase();
    let lenderId = lenderIdByName.get(key);

    if (!lenderId) {
      const { data: existing, error: findError } = await supabase
        .from("lenders")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("name", row.lender_name.trim())
        .is("deleted_at", null)
        .maybeSingle();
      if (findError) return { error: `Failed to look up lender "${row.lender_name}": ${findError.message}` };

      if (existing) {
        lenderId = existing.id as string;
      } else {
        const { data: created, error: createError } = await supabase
          .from("lenders")
          .insert({
            organization_id: organizationId,
            name: row.lender_name.trim(),
            tier_level: row.lender_tier,
            is_sample_data: false,
            active: true,
            created_by: userId,
          })
          .select("id")
          .single();
        if (createError) return { error: `Failed to create lender "${row.lender_name}": ${createError.message}` };
        lenderId = created!.id as string;
        lendersCreated += 1;
      }
      lenderIdByName.set(key, lenderId);
    }

    const programConfig = {
      lenderId,
      isSampleData: false,
      active: row.active,
      incomeDocTypes: row.income_doc_types,
      loanPurposes: row.loan_purposes,
      occupancies: row.occupancies,
      propertyTypes: row.property_types,
      eligibleStates: row.eligible_states,
      citizenshipEligible: row.citizenship_eligible,
      vestingEligible: row.vesting_eligible,
      minLoanAmount: row.min_loan_amount,
      maxLoanAmount: row.max_loan_amount,
      minFico: row.min_fico,
      maxDti: row.max_dti,
      minDscr: row.min_dscr,
      baseMaxLtv: row.base_max_ltv,
      minReservesMonths: row.min_reserves_months,
      interestOnlyAvailable: row.interest_only_available,
      prepaymentPenaltyOptions: row.prepayment_penalty_options,
      guidelineVersionLabel: row.guideline_version_label,
      effectiveDate: row.effective_date,
      lastVerifiedDate: row.last_verified_date || undefined,
      sourceCitation: row.source_citation,
      notes: row.notes || undefined,
    };

    const { data: program, error: programError } = await supabase
      .from("programs")
      .insert({
        organization_id: organizationId,
        lender_id: lenderId,
        name: row.program_name.trim(),
        is_sample_data: false,
        active: row.active,
        config: programConfig,
        created_by: userId,
      })
      .select("id")
      .single();
    if (programError) {
      return { error: `Failed to create program "${row.program_name}" (lender "${row.lender_name}"): ${programError.message}` };
    }

    const { error: gvError } = await supabase.from("guideline_versions").insert({
      organization_id: organizationId,
      program_id: program!.id,
      label: row.guideline_version_label,
      effective_date: row.effective_date,
      last_verified_date: row.last_verified_date || null,
      verification_status: "imported_pending_review",
    });
    if (gvError) {
      return { error: `Program "${row.program_name}" created, but its guideline version failed: ${gvError.message}` };
    }

    programsCreated += 1;
  }

  revalidatePath("/admin/lenders");
  return { success: true, lendersCreated, programsCreated };
}
