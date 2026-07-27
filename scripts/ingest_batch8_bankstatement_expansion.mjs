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
const TODAY = "2026-07-27";

async function resolveAdminId() {
  const { data } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").single();
  return data.id;
}

async function insertProgram(createdBy, lenderId, name, sourceCitation, versionLabel, p) {
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
    minLoanAmount: p.minLoanAmount,
    propertyTypes: p.propertyTypes,
    eligibleStates: "ALL",
    incomeDocTypes: p.incomeDocTypes,
    sourceCitation,
    vestingEligible: p.vestingEligible,
    lastVerifiedDate: TODAY,
    minReservesMonths: p.minReservesMonths ?? 0,
    citizenshipEligible: p.citizenshipEligible,
    guidelineVersionLabel: versionLabel,
    interestOnlyAvailable: p.interestOnlyAvailable ?? false,
    prepaymentPenaltyOptions: p.prepaymentPenaltyOptions ?? ["none"],
    notes: p.notes,
    ...(p.minDscr !== undefined ? { minDscr: p.minDscr } : {}),
  };
  const { error } = await admin.from("programs").insert({
    organization_id: PLATFORM_ORG,
    lender_id: lenderId,
    name,
    is_sample_data: false,
    active: true,
    config,
    created_by: createdBy,
  });
  if (error) console.error(`Failed to insert ${name}:`, error.message);
  else console.log(`Inserted: ${name}`);
}

async function main() {
  const createdBy = await resolveAdminId();

  /* ================= ANGEL OAK MORTGAGE SOLUTIONS =================
   * Previously only DSCR was ingested. Angel Oak's own site
   * (angeloakms.com) publishes a real, current Bank Statement program
   * with specific figures — adding it as the first non-DSCR product for
   * this lender. */
  const angelOakId = "c4b262b3-a9b7-4234-8c8e-efb3b2a3eabc";
  const AOMS_SOURCE = "Angel Oak Mortgage Solutions — Bank Statement Loans — https://angeloakms.com/programs/bank-statement-mortgage-program/";
  await insertProgram(createdBy, angelOakId, "Bank Statement Loans", AOMS_SOURCE, "Angel Oak program page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "1099"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome", "pud", "2_4_unit"],
    minFico: 640,
    baseMaxLtv: 90,
    minLoanAmount: 150000,
    maxLoanAmount: 4000000,
    interestOnlyAvailable: false,
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "joint_tenants", "trust"],
    notes:
      "12 or 24 months' business or personal bank statements; qualifying income from total eligible deposits (default 50% expense factor for business statements, up to 70% for some higher-expense industries, or 3rd-party CPA-provided ratio). 90% max LTV requires 720+ FICO (640 FICO caps at a lower LTV tier — Angel Oak's public page does not break out the exact intermediate LTV steps by FICO band). Two years' seasoning required after foreclosure/short sale/bankruptcy/deed-in-lieu. P&L statements accepted as a valid income-verification form under this program; borrowers may own as little as 25% of the business. 5/6 ARM, 7/6 ARM, and 30-year fixed available; 2-1 buydown offered.",
  });

  /* ================= VERUS MORTGAGE CAPITAL =================
   * Previously only DSCR was ingested. Verus publishes real correspondent
   * seller guides (verusmc.com) covering its full "Investor Solutions"
   * suite — Self-Employed Solutions (bank statement), Asset Utilization,
   * and Foreign National — each with citable figures. */
  const verusId = "af0df0b0-70a5-4668-9d41-0de0cbba26a1";
  const VERUS_INVESTOR_SOURCE =
    "Verus Mortgage Capital — Investor Solutions Loan Eligibility Criteria — https://verusmc.com/wp-content/uploads/resources/VMC_GUIDELINES_INVESTOR-SOLUTIONS_Final2.pdf";
  const VERUS_UW_SOURCE =
    "Verus Mortgage Capital — Non-QM Loan Delivery and Underwriting Guide — https://verusmc.com/wp-content/uploads/resources/VMC_non-QM-Guides_2020.09.28.f.pdf";

  await insertProgram(createdBy, verusId, "Investor Solutions — Self-Employed Solutions (Bank Statement)", VERUS_INVESTOR_SOURCE, "Investor Solutions Loan Eligibility Criteria — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome", "pud", "2_4_unit"],
    minFico: 600,
    baseMaxLtv: 80,
    minLoanAmount: 75000,
    maxLoanAmount: 5000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc", "trust"],
    notes:
      "12 or 24 months personal or business bank statements ('Self-Employed Solutions'). 80% max LTV/CLTV applies to A/B grade borrowers (minimum 600 FICO); Verus's separate grade matrix determines pricing tier by FICO/LTV/loan-amount combination and is not fully reproduced here. Verus's own marketing materials note it typically underwrites off 24 months of statements (not fewer) and offers 30- and 40-year interest-only terms, loan amounts from $150,000 to $4,000,000, LTV up to 90% and FICO as low as 620 in some published contexts — those figures come from a separate Verus marketing page, not this eligibility-criteria PDF, and are noted here for completeness rather than used as this program's binding figures.",
  });

  await insertProgram(createdBy, verusId, "Investor Solutions — Asset Utilization", VERUS_INVESTOR_SOURCE, "Investor Solutions Loan Eligibility Criteria — verified 2026-07-27", {
    incomeDocTypes: ["asset_depletion"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome", "pud"],
    minFico: 600,
    baseMaxLtv: 80,
    minLoanAmount: 75000,
    maxLoanAmount: 5000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes: "Qualifying income derived from eligible liquid assets under Verus's Asset Utilization method. 80% max LTV/CLTV applies to A/B grade borrowers (minimum 600 FICO), grouped with Full Documentation and Self-Employed Solutions under the same LTV cap in Verus's eligibility criteria.",
  });

  await insertProgram(createdBy, verusId, "Investor Solutions — Foreign National", VERUS_UW_SOURCE, "Non-QM Loan Delivery and Underwriting Guide — verified 2026-07-27", {
    incomeDocTypes: ["full_doc", "bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["second_home", "investment"],
    propertyTypes: ["single_family", "condo", "townhome"],
    minFico: 680,
    baseMaxLtv: 70,
    minLoanAmount: 100000,
    maxLoanAmount: 2000000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes:
      "Sourced from Verus's underwriting guide PDF, whose Foreign National table cells did not extract cleanly as plain text (overlapping column layout) — 680 minimum FICO and 70% max LTV are the values legible in the extracted text for the 2nd Home/Investment Foreign National grid; loan amount range is not explicitly stated in the extracted portion and is carried over from Verus's general Investor Solutions loan-amount band pending direct confirmation. Cash-out not offered under this program per the guide. Flag for re-verification directly against the full PDF (not just extracted text) before relying on these figures for a real borrower scenario.",
  });

  /* ================= CHAMPIONS FUNDING =================
   * Previously only DSCR ("Accelerator DSCR 1-4 Unit") was ingested.
   * Champions publishes an unusually complete public product page
   * (champstpo.com/programs) with real per-product loan-amount/LTV/FICO
   * highlights for every program branded under Ally / Activator /
   * Accelerator / Ambassador — six new real products added below. */
  const champId = "889c2c33-7b7e-458c-8fae-3cc1cb23e312";
  const CHAMPS_SOURCE = "Champions Funding — Programs page — https://www.champstpo.com/programs";

  await insertProgram(createdBy, champId, "Activator — Alt-Doc (Non-Traditional Borrowers)", CHAMPS_SOURCE, "Champions Funding programs page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "pnl_only", "1099", "wvoe_only", "asset_depletion"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome", "pud", "rural"],
    minFico: 660,
    baseMaxLtv: 70,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "joint_tenants", "trust"],
    notes: "Bank statements, P&L-only, 1099-only, WVOE-only, and asset-depletion doc types all qualify under this single 'Activator' Alt-Doc product. Max DTI up to 50%. Up to 6% seller concessions toward closing costs. Up to 20 acres allowable. Non-warrantable condos allowed.",
  });

  await insertProgram(createdBy, champId, "ITIN Activator", CHAMPS_SOURCE, "Champions Funding programs page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "pnl_only", "1099", "wvoe_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home"],
    propertyTypes: ["single_family", "condo", "townhome", "pud"],
    minFico: 660,
    baseMaxLtv: 85,
    minLoanAmount: 100000,
    maxLoanAmount: 1000000,
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual"],
    notes: "Up to 85% LTV on purchase/rate-term; 75% max LTV on cash-out. Gift funds may be allowed for down payment and closing costs, certain restrictions apply. ITIN accepted in place of SSN for borrower identification.",
  });

  await insertProgram(createdBy, champId, "Accelerator Full/Alt Doc — Income Qualifying Investment Properties", CHAMPS_SOURCE, "Champions Funding programs page — verified 2026-07-27", {
    incomeDocTypes: ["bank_statement", "pnl_only", "1099", "wvoe_only", "asset_depletion", "full_doc"],
    loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome", "2_4_unit"],
    minFico: 660,
    baseMaxLtv: 80,
    minLoanAmount: 100000,
    maxLoanAmount: 3000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc", "trust"],
    notes: "12-month business or personal bank statements, P&L-only, 1099-only, WVOE-only, or asset-utilization income all qualify for investment-property loans under this product. Asset depletion can be used as an individual or supplemental income source. 100% gift funds allowed for down payment and closing costs.",
  });

  await insertProgram(createdBy, champId, "ITIN Accelerator (DSCR)", CHAMPS_SOURCE, "Champions Funding programs page — verified 2026-07-27", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
    minFico: 660,
    baseMaxLtv: 80,
    minDscr: 0,
    minLoanAmount: 100000,
    maxLoanAmount: 1000000,
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual", "llc"],
    notes: "DSCR / no-ratio financing for ITIN investors. Up to 80% LTV on purchase/rate-term. First-time homebuyers welcome. Short-term rentals allowed. Cash-out proceeds may be applied toward reserves, certain restrictions apply.",
  });

  await insertProgram(createdBy, champId, "Ambassador — Foreign National DSCR", CHAMPS_SOURCE, "Champions Funding programs page — verified 2026-07-27", {
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo", "condotel"],
    minFico: 0,
    baseMaxLtv: 70,
    minDscr: 0.75,
    minLoanAmount: 100000,
    maxLoanAmount: 1500000,
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual", "llc"],
    notes: "For Foreign Nationals purchasing or refinancing a U.S. investment property. Max loan amount $1,500,000; max LTV/CLTV 70%. Condotels and warrantable condos allowed. Short-term rental properties accepted at DSCR >= 0.75. Cash-out proceeds may be used to satisfy reserve requirements. Champions' public page does not state a minimum FICO for this specific product.",
  });

  await insertProgram(createdBy, champId, "Super Jumbo Full/Alt Doc", CHAMPS_SOURCE + " and the Super Jumbo matrix PDF linked from it", "Champions Funding Super Jumbo matrix (03-16-2026) — verified 2026-07-27", {
    incomeDocTypes: ["full_doc", "bank_statement", "asset_depletion"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo", "pud"],
    minFico: 720,
    baseMaxLtv: 70,
    minLoanAmount: 3000001,
    maxLoanAmount: 5000000,
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "trust"],
    notes:
      "For loan amounts above agency/conforming limits ($3,000,001-$5,000,000) — a specialty product for high-net-worth borrowers. Qualifiable via Full Doc, 24-month personal or business bank statements, or Asset Utilization (eligible assets / 84 months = qualifying monthly income, sourced/seasoned 3 months). Owner-occupied primary residence only; first-time homebuyers, non-occupant co-borrowers, ITIN, and Foreign National borrowers are NOT permitted. All borrowers must meet a 720 minimum credit score regardless of loan-amount tier. Max LTV by tier: $3.0-4.0M at 740 FICO = 70% purchase/rate-term, 60% cash-out; at 720 FICO = 65%/55%; $4.0-5.0M at 740 FICO = 65%/55%, at 720 FICO = 60%/50% (baseMaxLtv above reflects the best/highest published tier). Max cash-out $1,500,000 and may not be used to meet reserves. Max DTI 38%. Non-warrantable condo eligible; no farms/rural properties, max 2 acres. Ineligible in Hawaii and Baltimore, MD; non-permanent resident aliens from China ineligible in Florida. In declining markets, purchase/rate-term is capped at the lesser of matrix LTV or 65%, cash-out at the lesser of matrix LTV or 55%.",
  });

  console.log("Batch 8 complete.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
