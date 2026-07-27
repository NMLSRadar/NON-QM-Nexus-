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

  /* ===================== USER-FLAGGED CORRECTIONS ===================== */

  // 1) GreenBox ITIN – Full Doc: user (a licensed originator who reviewed
  // GreenBox's actual current guideline) says this product goes up to 89%
  // LTV. GreenBox's own public marketing page (greenboxloans.com/gbl-programs/)
  // currently displays 75% for this tile — a real, disclosed discrepancy
  // between the public marketing page and what the user says the live
  // internal guideline actually allows. Recording the user's correction as
  // authoritative (broker-level guideline access outranks a public teaser
  // page) while flagging the conflict transparently rather than silently
  // picking one number.
  const { data: itinFullDoc } = await admin
    .from("programs")
    .select("id, config")
    .eq("lender_id", "666d06dc-b7d3-4a8a-ad83-390bd803f55c")
    .eq("name", "ITIN – Full Doc")
    .single();
  await admin
    .from("programs")
    .update({
      config: {
        ...itinFullDoc.config,
        baseMaxLtv: 89,
        lastVerifiedDate: TODAY,
        notes:
          (itinFullDoc.config.notes ? itinFullDoc.config.notes + " " : "") +
          "UPDATED 2026-07-27: corrected to 89% max LTV per direct confirmation from a licensed originator who reviewed GreenBox's current internal guideline for this product. Note: GreenBox's own public marketing page (greenboxloans.com/gbl-programs/) still displays 75% for this tile as of this same date — a real discrepancy between the public teaser page and the actual current guideline. Recommend re-verifying directly with a GreenBox account executive before quoting 89% to a borrower, and flagging to GreenBox that their public page appears out of date.",
      },
    })
    .eq("id", itinFullDoc.id);
  console.log("Corrected GreenBox ITIN – Full Doc to 89% max LTV per user's direct guideline confirmation.");

  // 2) GreenBox real "Elite – 1-Year 1099" program (user specifically asked
  // for this) — confirmed live on greenboxloans.com/gbl-programs/: Max LTV
  // 90%, Min FICO 660, Doc Type "1YR 1099 Only", Max Loan $4.0M.
  await insertProgram(
    createdBy,
    "666d06dc-b7d3-4a8a-ad83-390bd803f55c",
    "Elite – 1-Year 1099",
    "GreenBox Loans GBL Programs matrix — https://greenboxloans.com/gbl-programs/",
    "GBL Programs matrix — verified 2026-07-27",
    {
      incomeDocTypes: ["1099"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "pud"],
      minFico: 660,
      baseMaxLtv: 90,
      minLoanAmount: 100000,
      maxLoanAmount: 4000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust"],
      notes: "Qualifies borrowers using just 1 year of 1099 income (vs. the more typical 2-year requirement) — marketed for independent contractors and gig workers. Minimum loan amount not explicitly published; $100,000 assumed consistent with GreenBox's other published minimums.",
    }
  );

  // 3) Champions Funding's real CDFI-certified "Ally" No Ratio program —
  // genuinely missing from the batch-8 additions (only Activator/
  // Accelerator/Ambassador/Super Jumbo/ITIN products were added; Ally was
  // overlooked). Champions is CDFI-certified per the U.S. Treasury
  // (Certification #171CE014596) — confirmed on champstpo.com/what-is-ally
  // and the Ally No Ratio Guidelines PDF.
  await insertProgram(
    createdBy,
    "889c2c33-7b7e-458c-8fae-3cc1cb23e312",
    "Ally — No Ratio (CDFI)",
    "Champions Funding — What is Ally? / Ally Product Overview — https://www.champstpo.com/what-is-ally",
    "Champions Funding Ally No Ratio Guidelines — verified 2026-07-27",
    {
      incomeDocTypes: ["dscr"], // closest existing enum value for a no-income/no-employment-verification doc type; see note
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home"],
      propertyTypes: ["single_family", "condo", "pud", "2_4_unit"],
      minFico: 660,
      baseMaxLtv: 80,
      minLoanAmount: 100000,
      maxLoanAmount: 2000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust"],
      notes:
        "Champions Funding is CDFI-certified (U.S. Treasury Certification #171CE014596) and this CDFI-eligible 'Ally' product requires NO income and NO employment verification for consumer-purpose primary residence and second-home loans — this is a distinct 'no ratio' doc type, not truly DSCR; recorded as 'dscr' only because the platform schema has no dedicated no-ratio-consumer doc-type value yet (flag for a future schema addition). First-time homebuyers welcome. Properties up to 20 acres. Eligible property types include 1-4 unit residential and Fannie-Mae-warrantable condos (Florida condos require a full condo review) and owner-occupied mixed-use. Cash-out proceeds may be used as reserves at or below 50% LTV; above 50% LTV, 2 months of the borrower's own funds are required, with cash-out proceeds usable toward any remaining reserve requirement. CDFI-eligible borrowers receive rate/pricing improvements across all Champions products.",
    }
  );

  // 4) Change Wholesale's real CDFI-certified "Community Mortgage" No Ratio
  // program — genuinely the only other lender (besides Champions) in this
  // catalog confirmed CDFI-certified (via parent The Change Company CDFI
  // LLC, NMLS #2486868). Confirmed on changewholesale.com/community-mortgage
  // and the company's own underwriting-guidelines document.
  await insertProgram(
    createdBy,
    "2604d206-a39b-4a89-99f7-e4835d6654ef",
    "Community Mortgage — No Ratio (CDFI)",
    "Change Wholesale — Community Mortgage — https://www.changewholesale.com/community-mortgage",
    "Change Wholesale Community Mortgage Underwriting Guidelines — verified 2026-07-27",
    {
      incomeDocTypes: ["dscr"], // see note — no dedicated no-ratio-consumer doc type in schema yet
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary"],
      propertyTypes: ["single_family"],
      minFico: 640,
      baseMaxLtv: 80,
      minLoanAmount: 100000,
      maxLoanAmount: 2500000,
      minReservesMonths: 6,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust"],
      notes:
        "Change Lending, LLC dba Change Wholesale originates this CDFI product through its parent, The Change Company CDFI LLC (NMLS #2486868). Income and employment are NOT stated on the application — qualification is based solely on FICO, reserves, and LTV. Primary residence ONLY (not eligible for second homes or investment). Change's own product page states 'FICO beginning at 640'; a separate Change Wholesale explainer page states a minimum 680 FICO specifically for skipping income/employment documentation entirely — both figures are disclosed here since the two published sources do not fully agree; 640 is used as this program's floor pending direct confirmation of which threshold applies to a specific scenario. Reserves as low as 6 months; asset seasoning 30 days. Cash-out may be used to satisfy reserves. Debt-consolidation cash-out may be treated/priced as rate-term. Recorded as doc type 'dscr' only because the platform schema has no dedicated no-ratio-consumer doc-type value yet (flag for a future schema addition, same as Champions' Ally program).",
    }
  );

  console.log("User-flagged corrections complete.");

  /* ===================== NEXT 5 REMAINING DSCR-ONLY LENDERS ===================== */

  // --- A&D Mortgage: real 12/24 Month Bank Statement program from
  // admortgage.com/programs/bank_statement/ and its own published Non-QM
  // Loan Eligibility Guidelines PDF (July 2026 edition).
  await insertProgram(
    createdBy,
    "9df656ab-6e3d-40a1-97be-6cc6ee91ac75",
    "12/24 Month Bank Statement",
    "A&D Mortgage — 12/24 Month Bank Statement — https://admortgage.com/programs/bank_statement/",
    "A&D Mortgage Non-QM Loan Eligibility Guidelines (July 1, 2026) — verified 2026-07-27",
    {
      incomeDocTypes: ["bank_statement"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "townhome", "condotel", "2_4_unit", "pud", "rural"],
      minFico: 620,
      baseMaxLtv: 90,
      minLoanAmount: 100000,
      maxLoanAmount: 4000000,
      minReservesMonths: 3,
      citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "itin"],
      vestingEligible: ["individual", "llc", "corporation"],
      notes:
        "12 or 24 months personal, business, or combined bank statements; qualifying income from 100% of personal deposits or a 50% standard business expense ratio (reducible via third-party Business Expense Letter or P&L). No score / FICO 620 accepted, though I/O requires min FICO 680 and first-time homebuyers are not allowed on I/O. Up to 90% CLTV on purchase, up to 80% CLTV on cash-out; purchase up to $4M, cash-out up to $3M. Max DTI 55%. Min 3 months reserves. Available on A&D's Prime, Super Prime, and Apex Prime tiers. A&D's guidelines also list Asset Utilization and Profit & Loss Statement as separate published doc-type programs (guideline PDF sections 6.6.9-6.6.10) not yet added here as distinct program rows — their specific LTV/FICO figures were not captured in this pass and are a flagged follow-up.",
    }
  );

  // --- Acra Lending: real 12-Month Bank Statement program from
  // acralending.com/12-month/ (Acra's DSCR product was already ingested
  // earlier this session with condotel/ITIN/foreign-national coverage).
  await insertProgram(
    createdBy,
    "778a789b-4a08-46c2-bbf9-199e396486eb",
    "12-Month Bank Statement",
    "Acra Lending — 12-Month Bank Statement — https://acralending.com/12-month/",
    "Acra Lending Bank Statement Loan Program — verified 2026-07-27",
    {
      incomeDocTypes: ["bank_statement", "1099"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 600,
      baseMaxLtv: 90,
      minLoanAmount: 100000,
      maxLoanAmount: 4000000,
      minReservesMonths: 0,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      notes:
        "12 months personal or business bank statements (Acra's own submission checklist confirms a 12/24-month version of this program exists; only the 12-month figures were captured with confidence in this pass). Personal statements qualify at 100% of deposits/12; business statements qualify at 50% of deposits/12 (assumes ~50% overhead). Max 90% LTV on purchase, 80% LTV on cash-out. No 4506-T, K-1s, or P&Ls required. No mortgage insurance. No reserves required at or below 75% LTV (reserves required above that threshold, exact amount not captured in this pass). Acra's checklist also references an Assets-for-Depletion (ATR-in-full) option not added as a separate program row here — flagged as a follow-up.",
    }
  );

  // --- American Heritage Lending: real Bank Statement + Asset Qualifier
  // programs from ahlendtpo.com.
  await insertProgram(
    createdBy,
    "43c1732a-1f8d-4451-adb3-affc70c7be3f",
    "Bank Statement Loans",
    "American Heritage Lending — Bank Statement Loans — https://ahlendtpo.com/bank-statement-loans/",
    "American Heritage Lending program page — verified 2026-07-27",
    {
      incomeDocTypes: ["bank_statement"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 0,
      baseMaxLtv: 0,
      minLoanAmount: 75000,
      maxLoanAmount: 3000000,
      interestOnlyAvailable: true,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust", "corporation"],
      notes:
        "For self-employed borrowers (25%+ business ownership) and 1099 earners; qualifying income is the borrower's 12- or 24-month average bank-statement deposits. 30-year fixed with interest-only available. Available to individuals, trusts, corporations, and limited partnerships. American Heritage's public page did not publish a specific minimum FICO or maximum LTV for this product (unlike its Asset Qualifier product, which does publish its methodology) — minFico/baseMaxLtv are intentionally left at 0/unset here rather than guessed; contact an American Heritage AE for current rate-sheet figures before quoting to a borrower.",
    }
  );
  await insertProgram(
    createdBy,
    "43c1732a-1f8d-4451-adb3-affc70c7be3f",
    "Asset Qualifier Loans",
    "American Heritage Lending — Asset Qualifier Calculator — https://ahlendtpo.com/asset-qualifier-calculator/",
    "American Heritage Lending Asset Qualifier Calculator — verified 2026-07-27",
    {
      incomeDocTypes: ["asset_depletion"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      minFico: 0,
      baseMaxLtv: 0,
      minLoanAmount: 75000,
      maxLoanAmount: 3000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "trust"],
      notes:
        "Qualifying monthly income is calculated as Adjusted Total Assets (after any down-payment deduction) divided by 60 months. Published asset-type adjustment percentages: Checking/Savings/Money Market/Annuities/Cash Value Life Insurance at 100%; Stocks/Bonds/Mutual Funds at 75%; Retirement Assets (age 59.5+) at 75%; Retirement Assets (under 59.5) at 70%. Minimum assets required = (Loan + Down Payment + Costs + Reserves) x 110%. American Heritage's calculator page does not publish a headline minimum FICO or maximum LTV figure — minFico/baseMaxLtv intentionally left at 0/unset rather than guessed; confirm current thresholds with an American Heritage AE before quoting to a borrower. American Heritage also separately publishes a real Foreign National program (for non-permanent residents purchasing/refinancing an investment property or second home) not yet added here as its own program row — flagged as a follow-up.",
    }
  );

  // --- AmWest Funding Corp.: real "AmWest Advantage" (Alt-Doc) and
  // "AmWest Investor Advantage" (foreign-national-eligible) matrices.
  await insertProgram(
    createdBy,
    "90fd66ed-4b58-4857-b4ac-cb1de087fa25",
    "AmWest Advantage",
    "AmWest Funding Corp. — AmWest Advantage Program Matrix Guidelines — https://amwestfunding.com/docs/Matrix%20Guideline/AmWest%20Advantage%20Program%20-%20MATRIX-GUIDELINES%20-%20October%2012,%202023.pdf",
    "AmWest Advantage Program Matrix (October 12, 2023) — verified 2026-07-27",
    {
      incomeDocTypes: ["bank_statement", "1099", "full_doc"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit"],
      minFico: 700,
      baseMaxLtv: 80,
      minLoanAmount: 100000,
      maxLoanAmount: 3000000,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      notes:
        "Alternative documentation program (bank statement, 1099, or reduced-doc/full-doc paths) — no 4506-C or tax returns required for the alt-doc paths. Max DTI 49%. 100% gift funds allowed on primary and second home. Business funds allowed for borrowers who own <=100% of the business/account. Non-warrantable condos further restricted (subject to AmWest pre-approval). Owner-occupied/second-home purchase-or-rate-term is more permissive than the figures recorded here (the matrix PDF's owner-occupied grid did not extract as cleanly as the investment-property grid); investment-property purchase/rate-term is 70% LTV at 1 unit / 60% at 2-4 units, min FICO 720, cash-out 60%/50% at min FICO 720 — baseMaxLtv above (80%) reflects the more permissive owner-occupied tier referenced in a third-party summary and should be re-verified directly against the PDF matrix by loan tier before quoting. Foreign Nationals are NOT allowed on this product (see AmWest Investor Advantage below for AmWest's foreign-national-eligible product).",
    }
  );
  await insertProgram(
    createdBy,
    "90fd66ed-4b58-4857-b4ac-cb1de087fa25",
    "AmWest Investor Advantage",
    "AmWest Funding Corp. — AmWest Investor Advantage Matrix Guidelines — https://amwestfunding.com/docs/Matrix%20Guideline/AmWest%20Investor%20Advantage%20-%20MATRIX%20GUIDELINES%20-%20October%2026,%202023.pdf",
    "AmWest Investor Advantage Matrix (October 26, 2023) — verified 2026-07-27",
    {
      incomeDocTypes: ["dscr", "bank_statement"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "2_4_unit"],
      minFico: 700,
      baseMaxLtv: 80,
      minLoanAmount: 100000,
      maxLoanAmount: 1500000,
      citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
      vestingEligible: ["individual", "llc"],
      notes:
        "Alternative documentation for purchase, rate-term refinance, and cash-out — income/employment not listed on the 1003, no 4506-C or tax returns required. Max 80% LTV up to $1,500,000 with minimum 700 FICO on purchase/rate-term. Eligible borrowers explicitly include U.S. Citizens, Permanent Residents, Non-Permanent Resident Aliens, and Foreign Nationals (Foreign Nationals eligible for purchase, rate-term refinance, AND cash-out). First-time homebuyer/investor allowed per guidelines.",
    }
  );

  // --- ARDRI: real Bank Statements and Foreign National programs, both
  // unusually well-documented on ardri.ai / ardri.com.
  await insertProgram(
    createdBy,
    "9e507925-fc0a-4ed4-97e8-83136c88e6a5",
    "Bank Statements Loan Program",
    "ARDRI — Bank Statements Loan Program — https://ardri.ai/bank-statements/",
    "ARDRI program page — verified 2026-07-27",
    {
      incomeDocTypes: ["bank_statement"],
      loanPurposes: ["purchase", "cash_out_refinance", "rate_term_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit", "pud", "rural", "manufactured"],
      minFico: 600,
      baseMaxLtv: 90,
      minLoanAmount: 100000,
      maxLoanAmount: 4000000,
      minReservesMonths: 0,
      interestOnlyAvailable: true,
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      notes:
        "12 or 24 months personal or business bank statements. Personal deposits qualify at 100%; business deposits qualify at 50%+ (expense factors below 50% available with a third-party-prepared expense statement). Up to 90% LTV purchase, up to 80% LTV cash-out. No 4506-T / K-1s / P&Ls. No mortgage insurance. No reserve options. 30-year and 40-year interest-only terms available (fixed or ARM). Eligible property types explicitly include log homes, hobby farms, rural properties, modular and tiny homes in addition to standard types.",
    }
  );
  await insertProgram(
    createdBy,
    "9e507925-fc0a-4ed4-97e8-83136c88e6a5",
    "Foreign National Loan Program",
    "ARDRI — Foreign National Loan Program — https://ardri.ai/foreign-national/",
    "ARDRI Foreign National Loan Program — verified 2026-07-27",
    {
      incomeDocTypes: ["dscr", "full_doc"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit", "pud"],
      minFico: 0,
      baseMaxLtv: 75,
      minLoanAmount: 100000,
      maxLoanAmount: 2000000,
      citizenshipEligible: ["foreign_national"],
      vestingEligible: ["individual", "llc"],
      notes:
        "For foreign nationals with no U.S. Social Security Number or credit history — no American or foreign credit report is required; borrowers qualify as if they had a 680 FICO score. Up to 75% LTV purchase, up to 70% LTV rate-term refi (ARDRI's main program page) or 65% (a separate ARDRI flyer PDF states 65% for rate-term — the two ARDRI-published sources disagree slightly and both are disclosed here), up to 65% LTV cash-out. Loan amounts up to $2M. Covers both consumer-purpose primary-residence loans and business-purpose DSCR/No-Ratio/Bridge loans — recorded here as dscr+full_doc as the closest schema fit for that dual consumer/business-purpose structure; re-verify the exact doc-type classification directly with ARDRI for a specific scenario. No mortgage insurance, no reserve options. Eligible property types: SFR, 2-4 units, condos (including non-warrantable), PUD.",
    }
  );

  console.log("Batch 9 complete.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
