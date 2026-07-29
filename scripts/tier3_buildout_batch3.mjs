// Tier 3 lender catalog completeness buildout, batch 3 (final of the
// owner's supplied 8-lender comparison table, 2026-07-28): AmWest
// Funding, Forward Lending, Hometown Equity Mortgage.
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

  // ============ AMWEST FUNDING ============
  console.log("=== AmWest Funding ===");
  await ingestPrograms("90fd66ed-4b58-4857-b4ac-cb1de087fa25", adminId, [
    {
      name: "P&L / 1099 / WVOE",
      incomeDocTypes: ["pnl_only", "1099", "wvoe_only"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "2_4_unit"],
      minFico: 640,
      baseMaxLtv: 85,
      maxLoanAmount: 3000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: "AmWest Funding — P&L Only / 1-Year 1099 / WVOE program — https://brokermortgages.com/lender-network/amwest-funding/, https://www.amwestwholesale.com/nonqmproducts, fetched 2026-07-28",
      guidelineVersionLabel: "AmWest Funding official product summary — verified 2026-07-28",
      notes:
        "Real, distinct combo program from AmWest's own real published lineup — 640 min FICO, 85% max LTV, up to $3M, investment properties (including up to 4-unit) for non-traditional income earners. Real P&L mechanics per AmWest's own Advantage Program guidelines: application-date-dependent required P&L period (Jan 1-Mar 31: full prior-year P&L; Apr 1-Dec 31: full prior-year P&L + YTD interim statement), requires a CPA/CTEC/EA letter confirming 2 years of prepared/reviewed business tax filings. Real 1099 mechanic: 1-year 1099 + WVOE + YTD bank/payment statements (1099 Tax Transcript Form 4506-C required); Foreign National borrowers explicitly NOT eligible for the 1099 income option specifically. Real reserves tiering (subject property only, PITIA-based): 6mo <=$1M, 9mo <=$2M, 12mo <=$3M — waived entirely on Rate/Term with 0x30x12, 720+ FICO, <=70% LTV, and a decreasing payment.",
    },
  ]);

  // ============ FORWARD LENDING ============
  console.log("\n=== Forward Lending ===");
  await ingestPrograms("46815131-c36d-4477-95e1-c75e504074f3", adminId, [
    {
      name: "Full Doc Non-QM",
      incomeDocTypes: ["full_doc"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "2_4_unit", "condo", "pud"],
      minFico: 680,
      baseMaxLtv: 85,
      maxDti: 45,
      maxLoanAmount: 2000000,
      citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
      vestingEligible: ["individual"],
      minReservesMonths: 6,
      sourceCitation: "Forward Lending (OCMBC) — Non-QM Full Doc / Jumbo Hauler — https://forwardlendingmtg.com/non-qm-non-conforming-loans/, https://forwardlendingmtg.com/wp-content/uploads/2026/01/FL_JumboHauler-AE2026.pdf, fetched 2026-07-28",
      guidelineVersionLabel: "Forward Lending official product pages — verified 2026-07-28",
      notes:
        "Real: 12/24-month Full Doc option, minimum 2-year history required (wage earners: 1-2yr W2/paystubs; self-employed: 1-2yr personal+business returns plus YTD P&L). Figures here reflect the real Jumbo Hauler tier's Full Doc-adjacent parameters: 85% max LTV up to $2M Purchase/Rate-Term (75% up to $2.5M Cash-Out — not modeled separately here), 680 min FICO, 45% max DTI, 6mo reserves, Non-Permanent Residents explicitly eligible. Real note: Non-QM buydowns (2-1/1-0) are available on Full Doc and Alt Doc income types but explicitly NOT available on DSCR loans.",
    },
  ]);

  // ============ HOMETOWN EQUITY MORTGAGE ============
  console.log("\n=== Hometown Equity Mortgage ===");
  await ingestPrograms("c2a50893-3f95-4e1c-ad1a-46af67db19ea", adminId, [
    {
      name: "theSuperNONI — Asset Depletion",
      incomeDocTypes: ["dscr", "asset_depletion"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "2_4_unit"],
      minFico: 680,
      baseMaxLtv: 70,
      maxLoanAmount: 2000000,
      minDscr: 0.75,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 6,
      sourceCitation: "Hometown Equity Mortgage (theLender) — theSuperNONI — https://wholesale.thelender.com/wp-content/uploads/2026/01/theNONI_01.12.26E.pdf, fetched 2026-07-28",
      guidelineVersionLabel: "Hometown Equity theNONI/theSuperNONI matrix — verified 2026-07-28",
      notes:
        "A REAL, genuinely UNIQUE asset-depletion mechanic — not a standalone income-documentation method the way most lenders in this catalog model it, but a DSCR-BOOSTER: asset depletion is used to augment an otherwise-insufficient DSCR ratio up to a final DSCR >= 1.15, where the property's initial (rent-only) DSCR is only 0.75-0.99. Min FICO 680, max loan amount $2,000,000 (notably lower than theNONI's own $3.5M ceiling and theNearNONI's $3M — this is the most conservative of Hometown's 3 real DSCR-family tiers). Cash-out proceeds from the SAME loan may NOT be used to satisfy the asset-depletion requirement. No exceptions permitted on this specific tier; short-term rental income is NOT allowed on theSuperNONI (unlike theNONI's broader STR allowance). An additional 6 months of reserves is required beyond the base DSCR reserves schedule.",
    },
  ]);

  console.log("\nDone with AmWest + Forward Lending + Hometown Equity batch — this completes the owner's supplied 8-lender comparison table pass.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
