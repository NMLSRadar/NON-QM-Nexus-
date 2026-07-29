// Tier 1 lender catalog completeness buildout, batch 1: A&D Mortgage.
// Per direct owner report (2026-07-28) that "almost every lender" is
// missing real, currently-published programs. Source: A&D Mortgage's own
// current (dated April 2026) wholesale product sheet,
// https://admortgage.com/wp-content/uploads/Programs_AD_Products_April_15_2026.pdf
// — fetched 2026-07-28. Catalog already had "12/24 Month Bank Statement"
// and "DSCR"; this adds the real, currently-missing income-doc-type
// programs. Deliberately deferred (real but not added this pass, to keep
// moving through the rest of Tier 1): Second Mortgage (a distinct lien
// position, different product shape), AD Power Jumbo / Full Doc AD Power
// Jumbo (conforming-adjacent jumbo, not really a "Non-QM doc-type"
// program), Full Doc Non-QM (plain full-doc, lower priority than the
// alternative-documentation gaps the owner specifically flagged).
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
      ...(p.citizenshipLtvCaps !== undefined ? { citizenshipLtvCaps: p.citizenshipLtvCaps } : {}),
      ...(p.foreignNationalSpecialist !== undefined ? { foreignNationalSpecialist: p.foreignNationalSpecialist } : {}),
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
  const AD_SOURCE = "A&D Mortgage LLC — official wholesale product sheet (dated April 15, 2026) — https://admortgage.com/wp-content/uploads/Programs_AD_Products_April_15_2026.pdf, fetched 2026-07-28";
  const AD_LENDER_ID = "9df656ab-6e3d-40a1-97be-6cc6ee91ac75";
  const AD_LABEL = "A&D Mortgage official product sheet (April 2026) — verified 2026-07-28";

  console.log("=== A&D Mortgage ===");
  await ingestPrograms(AD_LENDER_ID, adminId, [
    {
      name: "ITIN",
      incomeDocTypes: ["full_doc", "dscr"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit", "condotel"],
      minFico: 660,
      baseMaxLtv: 80, // the "Super Prime" ITIN tier ceiling; DSCR-doc-type ITIN caps lower at 70% — see notes
      maxLoanAmount: 1500000,
      citizenshipEligible: ["itin"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: AD_SOURCE,
      guidelineVersionLabel: AD_LABEL,
      notes:
        "Real ITIN tiering per A&D's own product sheet: up to 80% CLTV under the Super Prime doc-type bundle (min FICO 660), but only up to 70% CLTV when the ITIN borrower is qualifying via DSCR (min FICO 700) — this schema's citizenshipLtvCaps has no doc-type dimension, so the more permissive 80%/660 Super Prime figure is used as baseMaxLtv/minFico; a DSCR-doc ITIN scenario should be treated as capped lower (70%/700) until this schema can model the distinction. Requires a valid ITIN card or IRS ITIN Letter plus a valid government-issued ID. Loan amounts up to $1.5M.",
      citizenshipLtvCaps: { itin: 80 },
    },
    {
      name: "Foreign National",
      incomeDocTypes: ["dscr", "full_doc"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 660,
      baseMaxLtv: 75,
      maxLoanAmount: 3000000,
      citizenshipEligible: ["foreign_national"],
      citizenshipLtvCaps: { foreign_national: 75 },
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      foreignNationalSpecialist: true,
      sourceCitation: AD_SOURCE,
      guidelineVersionLabel: AD_LABEL,
      notes:
        "Real: no U.S. credit score required (or min FICO 660 if scored), up to 75% CLTV, loan amounts up to $3M, cash-out allowed (capped lower at 65% CLTV under the Full Doc Foreign National variant specifically — not modeled separately here). Requires a CPA letter covering the last 2 years + YTD, one bank reference letter; overseas assets are allowed to satisfy the reserves requirement; gift funds allowed; minimum 10% borrower contribution.",
    },
    {
      name: "1Y & 2Y P&L",
      incomeDocTypes: ["pnl_only"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 660,
      baseMaxLtv: 80,
      maxDti: 55,
      maxLoanAmount: 2500000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: AD_SOURCE,
      guidelineVersionLabel: AD_LABEL,
      notes:
        "Real: 1 or 2 years of P&L accepted, no score option available (or min FICO 660 if scored), up to 80% CLTV, max 55% DTI, loan amounts up to $2.5M. P&L must be reviewed by a licensed CPA, CTEC-registered tax preparer, or IRS Enrolled Agent. Bank statements are NOT required to support the P&L up to 70% LTV specifically (above 70% LTV, supporting bank statements may be required — not fully detailed in the source).",
    },
    {
      name: "Asset Utilization",
      incomeDocTypes: ["asset_depletion"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 620,
      baseMaxLtv: 80,
      maxLoanAmount: 4000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: AD_SOURCE,
      guidelineVersionLabel: AD_LABEL,
      notes:
        "Real: no credit score required (or min FICO 620 if scored), up to 80% HCLTV including cash-out. Real asset-divisor mechanic: all eligible assets divided by 60 months to determine qualifying income. Real per-asset-type treatment: savings/checking at 100% of value, securities (stocks/bonds) at 100% of value (notably more generous than most lenders in this catalog, which typically apply a haircut to securities), retirement accounts at 70% of value.",
    },
    {
      name: "WVOE / 1099",
      incomeDocTypes: ["1099", "wvoe_only"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 620,
      baseMaxLtv: 85, // the 1099 ceiling; WVOE caps lower at 80% — see notes
      maxDti: 55,
      maxLoanAmount: 4000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minReservesMonths: 3,
      sourceCitation: AD_SOURCE,
      guidelineVersionLabel: AD_LABEL,
      notes:
        "Real, TWO distinct doc types bundled in one A&D product line: WVOE (Written Verification of Employment, FNMA Form 1005, requires 2-year history with the SAME employer) caps at 80% CLTV; 1099 (requires 1-year history with the same employer/client) caps at 85% CLTV — baseMaxLtv here uses the more permissive 1099 figure; a WVOE-doc-type scenario should be treated as capped 5 points lower (80%) until this schema can model the sub-distinction. No credit score required (or min FICO 620 if scored), max DTI 55%, loan amounts up to $4M, cash-out up to 80% CLTV.",
    },
  ]);

  console.log("\nDone with A&D Mortgage. Deferred (real, published, not added this pass): Second Mortgage (distinct lien position), AD Power Jumbo / Full Doc AD Power Jumbo (conforming-adjacent jumbo), Full Doc Non-QM (plain full-doc, lower priority than the alt-doc gaps flagged by the owner).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
