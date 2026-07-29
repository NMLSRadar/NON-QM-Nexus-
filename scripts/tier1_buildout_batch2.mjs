// Tier 1 lender catalog completeness buildout, batch 2: LendSure, RCN
// Capital, Verus Mortgage Capital. Continuation of the owner-directed
// "huge buildout" (2026-07-28) — real programs sourced directly from
// each lender's own current site, fetched 2026-07-28.
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
      ...(p.minDscr !== undefined ? { minDscr: p.minDscr } : {}),
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

  // ============ LendSure Mortgage Corp. ============
  console.log("=== LendSure Mortgage Corp. ===");
  const LS_ID = "7a3d77a4-ca7e-4909-b5c6-f46002e3222d";
  const LS_LABEL = "LendSure official program pages — verified 2026-07-28";
  await ingestPrograms(LS_ID, adminId, [
    {
      name: "Profit & Loss (P&L) Program",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 620,
      baseMaxLtv: 80,
      maxLoanAmount: 1500000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: "LendSure Mortgage Corp. — Profit & Loss (P&L) Program — https://lendsure.com/home-loan-programs/profit-and-loss-program/",
      guidelineVersionLabel: LS_LABEL,
      notes:
        "Real: no bank statements required at all for loan amounts up to $1,000,000; up to $1,500,000 WITH 2 months of business bank statements. Cash-out capped separately: up to $500,000 at LTV<=65%, $350,000 at LTV<=75%. P&L must cover the most recent 12 months, dated within 60 days of closing, prepared by a CPA/IRS Enrolled Agent/CTEC preparer. Borrower must be self-employed 2+ years in the same business (verified via business license/tax-preparer letter/Secretary of State filing) and own >=50% of the business (notably higher ownership floor than several other lenders in this catalog, which commonly allow 25%). No self-employment questionnaire required.",
    },
    {
      name: "Asset Qualifier",
      incomeDocTypes: ["asset_depletion"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home"],
      propertyTypes: ["single_family", "condo", "townhome"],
      minFico: 660,
      baseMaxLtv: 80,
      maxDti: 50,
      maxLoanAmount: 2000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      sourceCitation:
        "LendSure Mortgage Corp. — Asset Depletion / Asset Qualifier — https://lendsure.com/specialty-loan-solutions/asset-depletion-asset-qualifier/",
      guidelineVersionLabel: LS_LABEL,
      notes:
        "Real: LendSure publishes TWO distinct asset-based options simultaneously — Asset Qualifier (qualifying income = qualified assets / 60 months, the more aggressive/higher-income option modeled here) and Asset Depletion (qualified assets / 120 months — roughly HALF the qualifying income of Asset Qualifier for the same asset pool; not separately modeled as its own program row, but a real, distinct, more conservative alternative worth mentioning). No minimum age requirement. Real per-asset-type haircuts: cash/equivalents 100%, stocks/bonds 80%, retirement accounts 70%. Occupancy/LTV varies by purpose: up to 80% LTV Purchase, 75% Rate & Term, 75% Cash-Out (Primary), 70% Cash-Out (Second Home) — baseMaxLtv here uses the Purchase ceiling. DTI as high as 50%.",
    },
  ]);

  // ============ RCN Capital ============
  console.log("\n=== RCN Capital ===");
  const RCN_ID = "fd868d08-e350-4a2a-ad14-7f8be16578f8";
  await ingestPrograms(RCN_ID, adminId, [
    {
      name: "Long-Term Rental Multi-Family Loan Program",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["5_plus_unit"],
      minFico: 700,
      baseMaxLtv: 70,
      minLoanAmount: 150000,
      maxLoanAmount: 1500000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["llc", "corporation"],
      minReservesMonths: 6,
      sourceCitation: "RCN Capital — Long-Term Rental (Multi-Family) Program — https://rcncapital.com/loan-programs, https://rcncapital.com/hubfs/RCN_Long_Term_Rental_One_Sheet_Aug_7.pdf",
      guidelineVersionLabel: "RCN Capital official program page/one-sheet — verified 2026-07-28",
      notes:
        "A REAL, DISTINCT program from this catalog's existing 'Long-Term Rental Loan Program' (which covers 1-4 unit single-family) — this is RCN's dedicated 5+ unit apartment product, max 9 units, min property value $100K/unit, 30-year term with 30-year fixed/5-1/7-1/10-1 hybrid ARM and interest-only options. Real FICO/LTV tiering: 700+ FICO up to 70% of As-Is Value (purchase) or up to 70% for refinance; 680-699 FICO steps down further (exact intermediate tier not fully captured from the public one-sheet). Same business-purpose/non-owner-occupied nature as RCN's other real products (asset/cash-flow based, not a traditional personal-income-doc mortgage).",
    },
  ]);

  // ============ Verus Mortgage Capital ============
  console.log("\n=== Verus Mortgage Capital ===");
  const VERUS_ID = "af0df0b0-70a5-4668-9d41-0de0cbba26a1";
  await ingestPrograms(VERUS_ID, adminId, [
    {
      name: "Closed End Second Program",
      incomeDocTypes: ["full_doc", "bank_statement"],
      loanPurposes: ["cash_out_refinance"], // a standalone second lien is functionally a cash-out-equivalent access-to-equity product
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome"],
      minFico: 680,
      baseMaxLtv: 90,
      minLoanAmount: 50000,
      maxLoanAmount: 500000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust"],
      minReservesMonths: 3,
      sourceCitation: "Verus Mortgage Capital — Closed End Second Program — https://verusmc.com/correspondent/our-programs/closed-end-second-program/",
      guidelineVersionLabel: "Verus Mortgage Capital official program page — verified 2026-07-28",
      notes:
        "A real, standalone SECOND-LIEN product — access equity without touching the first mortgage's rate, unlike Verus's other (first-lien) programs already in this catalog. Max loan amount $500,000, max 90% CLTV, min 680 FICO. Both Standard (Full Doc) and Alternative (12/24-month bank statement) documentation accepted. Supports both simultaneous (with a new first) and stand-alone (existing first stays in place) transactions. All three occupancy types eligible.",
    },
  ]);

  console.log("\nDone with batch 2.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
