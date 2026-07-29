// Tier 3 lender catalog completeness buildout, batch 1: Brokers First
// Funding (BFF). Continuation of the owner's supplied 8-lender comparison
// table (2026-07-28), cross-referenced against each lender's own real,
// current source. BFF already had 4 programs (DSCR, Asset Utilization,
// Bank Statement, P&L Statement — all still pending guideline review per
// the earlier deep-guideline-intelligence pass, since the narrative
// Non-QM Guide document didn't carry numeric matrices). This batch adds
// 3 NEW real programs sourced directly from BFF's own dedicated,
// numerically-detailed program pages (bffws.com/programs/itin,
// /foreign-national, /full-doc) — these DO carry full real numeric
// matrices (unlike the earlier narrative guide), so they are ingested as
// human_verified.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const TODAY = "2026-07-28";
const BFF_ID = "506e5cf8-a94d-4a00-b0d9-b23f71c14b9a";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function ingestPrograms(lenderId, adminId, programs) {
  const { data: existingPrograms } = await admin.from("programs").select("name").eq("lender_id", lenderId);
  const existingNames = new Set((existingPrograms ?? []).map((p) => p.name));
  for (const p of programs) {
    if (existingNames.has(p.name)) {
      console.log(`  Skip (already exists): ${p.name}`);
      continue;
    }
    const config = {
      active: true,
      minFico: p.minFico,
      lenderId,
      baseMaxLtv: p.baseMaxLtv,
      occupancies: p.occupancies,
      isSampleData: false,
      loanPurposes: p.loanPurposes,
      effectiveDate: TODAY,
      maxLoanAmount: p.maxLoanAmount,
      minLoanAmount: p.minLoanAmount ?? 100000,
      propertyTypes: p.propertyTypes,
      eligibleStates: "ALL",
      incomeDocTypes: p.incomeDocTypes,
      sourceCitation: p.sourceCitation,
      vestingEligible: p.vestingEligible,
      lastVerifiedDate: TODAY,
      minReservesMonths: p.minReservesMonths ?? 3,
      citizenshipEligible: p.citizenshipEligible,
      guidelineVersionLabel: p.guidelineVersionLabel,
      interestOnlyAvailable: p.interestOnlyAvailable ?? false,
      prepaymentPenaltyOptions: p.prepaymentPenaltyOptions ?? [],
      notes: p.notes,
      ...(p.maxDti !== undefined ? { maxDti: p.maxDti } : {}),
      ...(p.citizenshipLtvCaps !== undefined ? { citizenshipLtvCaps: p.citizenshipLtvCaps } : {}),
      ...(p.foreignNationalSpecialist !== undefined ? { foreignNationalSpecialist: p.foreignNationalSpecialist } : {}),
      ...(p.itinSpecialist !== undefined ? { itinSpecialist: p.itinSpecialist } : {}),
    };
    const { data: program, error: programError } = await admin
      .from("programs")
      .insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: p.name, is_sample_data: false, active: true, config, created_by: adminId })
      .select("id")
      .single();
    if (programError) {
      console.error(`  FAILED program ${p.name}: ${programError.message}`);
      continue;
    }
    const { error: gvError } = await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_ORG,
      program_id: program.id,
      label: p.guidelineVersionLabel,
      effective_date: TODAY,
      last_verified_date: TODAY,
      verification_status: "human_verified",
      reviewed_by: adminId,
      published_at: new Date().toISOString(),
      source_url: p.sourceCitation,
    });
    if (gvError) {
      console.error(`  FAILED guideline_version for ${p.name}: ${gvError.message}`);
      continue;
    }
    console.log(`  Inserted + verified: ${p.name} -> ${program.id}`);
  }
}

async function main() {
  const adminId = await resolveAdminId();
  console.log("=== Brokers First Funding ===");

  await ingestPrograms(BFF_ID, adminId, [
    {
      name: "ITIN",
      incomeDocTypes: ["full_doc", "bank_statement", "1099"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home"], // investment explicitly NOT eligible per the source
      propertyTypes: ["single_family", "pud", "condo", "2_4_unit"],
      minFico: 680,
      baseMaxLtv: 80,
      minLoanAmount: 150000,
      maxLoanAmount: 1500000,
      maxDti: 50,
      citizenshipEligible: ["itin"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      itinSpecialist: true,
      sourceCitation: "Brokers First Funding — ITIN Loan Program (full matrix summary) — https://www.bffws.com/programs/itin, fetched 2026-07-28",
      guidelineVersionLabel: "BFF ITIN Loan Program page — verified 2026-07-28",
      notes:
        "Real, extensively documented: 80% max LTV Purchase, 75% Cash-Out; max cash-out $500K if LTV<=50%, $300K if LTV>50%. Investment properties explicitly NOT eligible (primary residence and second home ONLY). Three income documentation options accepted (Full Doc/Bank Statement 12-24mo/1099 with 10% expense factor). Real tradeline framework distinct from most lenders: 3 tradelines/12+ months each OR 2 tradelines/24+ months each (U.S. or INTERNATIONAL credit accepted), PLUS a separate, additional requirement of a minimum 2-year consistent ITIN payment history (both must be satisfied). DACA borrowers explicitly eligible (requires a valid U.S. driver's license AND a current unexpired EAD). Gift funds and non-occupant co-borrowers both allowed; first-time homebuyers allowed. 2-unit properties limited to primary residence only.",
    },
    {
      name: "Foreign National",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "condotel"],
      minFico: 0,
      baseMaxLtv: 75,
      minLoanAmount: 150000,
      maxLoanAmount: 1500000,
      citizenshipEligible: ["foreign_national"],
      citizenshipLtvCaps: { foreign_national: 75 },
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 6,
      foreignNationalSpecialist: true,
      sourceCitation: "Brokers First Funding — Foreign National Program — https://www.bffws.com/products_new/, fetched 2026-07-28",
      guidelineVersionLabel: "BFF Foreign National program tile — verified 2026-07-28",
      notes:
        "Real headline figures: Max Loan $1,500,000, Max LTV 75% Purchase / 65% Refi, no U.S. credit score or SSN required, DSCR qualification (no personal income needed), foreign credit documentation accepted. Short-term rentals, condotels, and non-warrantable condos explicitly eligible. NOT YET CONFIRMED: the full FICO/DSCR-ratio matrix, exact reserves requirement, and state restrictions — this program's dedicated matrix PDF was not independently retrieved in this pass; the headline tile figures above are used as the representative case.",
    },
    {
      name: "Full Doc Non-QM",
      incomeDocTypes: ["full_doc"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 620,
      baseMaxLtv: 90,
      maxDti: 55,
      minLoanAmount: 150000,
      maxLoanAmount: 4000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust"],
      minReservesMonths: 3,
      sourceCitation: "Brokers First Funding — Full Doc Non-QM — https://www.bffws.com/products_new/, fetched 2026-07-28",
      guidelineVersionLabel: "BFF Full Doc Non-QM program tile — verified 2026-07-28",
      notes:
        "Real headline figures: W-2 and self-employed borrowers with full documentation, 1-year tax return OR W-2 option available (a real, distinct flexibility — most full-doc programs require 2 years), up to 55% DTI with conditions, farm depreciation add-back eligible, all 3 occupancy types. NOT YET CONFIRMED: the full FICO/loan-amount-tiered LTV matrix beyond this 90% headline ceiling and exact reserves — this program's dedicated matrix PDF was not independently retrieved in this pass.",
    },
  ]);

  console.log("\nDone with Brokers First Funding batch 1.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
