// Tier 3 lender catalog completeness buildout, batch 2: Logan Finance
// Corporation, ClearEdge Lending. Continuation of the owner's supplied
// 8-lender comparison table (2026-07-28).
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

  // ============ LOGAN FINANCE CORPORATION ============
  console.log("=== Logan Finance Corporation ===");
  const LOGAN_ID = "48f0838c-5f5d-41a1-b964-bb55325c40a4";
  const LOGAN_LABEL = "Logan Finance official wholesale product pages — verified 2026-07-28";
  await ingestPrograms(LOGAN_ID, adminId, [
    {
      name: "P&L",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "5_plus_unit"],
      minFico: 660,
      baseMaxLtv: 80,
      maxLoanAmount: 2500000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      interestOnlyAvailable: true,
      sourceCitation: "Logan Finance Wholesale — P&L Program — https://loganwholesale.com/experience-p-and-l/",
      guidelineVersionLabel: LOGAN_LABEL,
      notes: "Real: CTEC/CPA/EA-prepared P&L in lieu of tax returns AND bank statements, up to $2.5M, 660 min FICO, 12 or 24 months (business, personal, or both), all 3 occupancy types, no LTV restriction specifically for condos, non-warrantable condos OK, up to 80% LTV with exceptions possible, gift of equity OK on primary homes, interest-only available. At least one borrower must be self-employed 2+ years; 3 months of bank statements still required as supporting documentation. Capped at 6 loans or $5M aggregate with Logan, whichever comes first.",
    },
    {
      name: "1099",
      incomeDocTypes: ["1099"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo"],
      minFico: 660,
      baseMaxLtv: 85,
      maxLoanAmount: 3500000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      interestOnlyAvailable: true,
      sourceCitation: "Logan Finance Wholesale — 1099 Program — https://loganwholesale.com/experience-1099/",
      guidelineVersionLabel: LOGAN_LABEL,
      notes: "Real: 1099 statements + YTD bank statements in lieu of tax returns, up to $3.5M, 660 min FICO, 12 or 24 months (business, personal, or both), 1099 plus YTD earnings OK, up to 85% LTV with exceptions possible, non-warrantable condos OK, gift of equity OK on primary homes, interest-only available. Self-employment must be for services provided directly by the borrower (not all self-employed borrowers qualify). Capped at 6 loans or $5M aggregate with Logan.",
    },
    {
      name: "Asset Qualification (Open Road / Beyond)",
      incomeDocTypes: ["asset_depletion"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary"], // "Primary Occupancy Only" per the source
      propertyTypes: ["single_family", "condo"],
      minFico: 660,
      baseMaxLtv: 80,
      maxDti: 50,
      maxLoanAmount: 3000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      sourceCitation: "Logan Finance Wholesale — Open Road Asset Qual — https://loganwholesale.com/logan-open-road-asset-qual/, https://loganwholesale.com/experience-asset-qual/",
      guidelineVersionLabel: LOGAN_LABEL,
      notes: "Real: TWO distinct asset-based products, both real and currently published — 'Open Road' (60- or 180-month depletion options, primary occupancy ONLY, up to $3M, 660 min FICO, 80% max LTV, 50% max DTI, borrower's documented reserves must be >=110% of the loan's original principal plus applicable reserves) modeled here as the representative case, and a separate 'Asset Qualification for Alt-Doc' variant with NO haircuts at all (100% of stocks/bonds/mutual funds/retirement accounts, up to 50% of required assets may be business assets, income credit = total assets/60 months for DTI, supplemental full doc income allowed) — not modeled as its own row but real and worth mentioning for a borrower whose asset mix benefits from zero-haircut treatment. Capped at 6 loans or $5M aggregate with Logan.",
    },
  ]);

  // ============ CLEAREDGE LENDING ============
  console.log("\n=== ClearEdge Lending ===");
  const CE_ID = "a683a2a9-062c-4538-999d-0db3dc086033";
  const CE_LABEL = "ClearEdge Lending official Connect Product Matrix (2026.7.1) — verified 2026-07-28";
  await ingestPrograms(CE_ID, adminId, [
    {
      name: "P&L Only",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary"], // "Primary Residence only" per the real matrix
      propertyTypes: ["single_family", "condo", "2_4_unit"],
      minFico: 680,
      baseMaxLtv: 80,
      maxLoanAmount: 2000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      sourceCitation: "ClearEdge Lending — Connect Product Matrix (2026.7.1) — https://clearedgelending.com/wp-content/uploads/2026/07/2026-7.1-CEL-PP-Connect-Product-Matrix-Clean-Copy.pdf, fetched 2026-07-28",
      guidelineVersionLabel: CE_LABEL,
      notes: "Real, from ClearEdge's own current Connect Product Matrix: Max 80% Purchase / 75% Rate & Term / 70% Cash-Out, Max $2M loan amount, Min FICO 680, Primary Residence ONLY. P&L must be Tax Attorney/CPA/EA/CTEC-prepared with attestation and license verification (PTIN alone is NOT acceptable) and wet-signed by both preparer and borrower; borrower must own >=50% of the business with 2+ years self-employment in the current profession; 2 months of business bank statements required, and those deposits must support at least 80% of the P&L's average monthly revenue (continuous statements may be added until this tolerance is met). Real ineligible-income exclusions: crowdfunding, real estate speculation, day trading, and similar passive-income sources. Real estate investors with fewer than 5 residential units and venture capitalists are also ineligible for this specific doc type.",
    },
    {
      name: "Asset Utilization",
      incomeDocTypes: ["asset_depletion"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "2_4_unit"],
      minFico: 680,
      baseMaxLtv: 80,
      maxLoanAmount: 2000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual"],
      minReservesMonths: 3,
      sourceCitation: "ClearEdge Lending — Connect Product Matrix (2026.7.1) — https://clearedgelending.com/wp-content/uploads/2026/07/2026-7.1-CEL-PP-Connect-Product-Matrix-Clean-Copy.pdf, fetched 2026-07-28",
      guidelineVersionLabel: CE_LABEL,
      notes: "Real, from ClearEdge's own current Connect Product Matrix: a real, distinct occupancy-tiered LTV cap not modeled by this schema's single ltvMatrix dimension — Primary/2nd home max 80% LTV/CLTV, Investment Property max 65% LTV/CLTV, Cash-Out max 60% LTV/CLTV (baseMaxLtv above reflects the Primary/2nd-home ceiling; an investment or cash-out scenario should be treated as capped lower per this real tiering). Gift funds may NOT be used with this doc type (a real, notable restriction). Uses unrestricted liquid assets as qualifying income with a 90-120 day statement lookback and a 5-year draw period per ClearEdge's own separate Opal product page.",
    },
  ]);

  console.log("\nDone with Logan Finance + ClearEdge batch.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
