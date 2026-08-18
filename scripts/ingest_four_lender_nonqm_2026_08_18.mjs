import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
export const VERIFIED_ON = "2026-08-18";

// ---------------------------------------------------------------------------
// Sources — NON-QM documents only
// ---------------------------------------------------------------------------
export const SOURCES = {
  // Brokers Choice Mortgage (division of OCMBC, NMLS #2125)
  bcmNonQm: "https://brokerschoicemtg.com/non-qm-non-conforming-loans/",
  bcmMatrix417: "https://brokerschoicemtg.com/wp-content/uploads/2025/04/BCM-NonQM-Matrix-dtd-4.17.25.pdf",
  bcmDscr417: "https://brokerschoicemtg.com/wp-content/uploads/2025/04/BCM-NonQM-DSCR-Matrix-dtd-4.17.25-1.pdf",
  bcm58: "https://brokerschoicemtg.com/wp-content/uploads/2025/03/BCM-5-8-Unit-Residential-Matrix-eff-02.14.25-1.pdf",
  bcmCreditUpgrade: "https://brokerschoicemtg.com/non-qm-credit-upgrade/",
  // Jet Advantage Mortgage (division of OCMBC, NMLS #2125)
  jetNonQm: "https://www.jetadvantagemtg.com/non-qm-non-conforming-loans/",
  jetMatrix224: "https://www.jetadvantagemtg.com/wp-content/uploads/2025/02/JET-NQM-2.14.25v2.pdf",
  jetMatrix417: "https://www.jetadvantagemtg.com/wp-content/uploads/2025/04/JET-NON-Q-Matrix-4.17.25.pdf",
  jetSeconds: "https://www.jetadvantagemtg.com/non-qm-seconds/",
  jetSecondsMatrix: "https://www.jetadvantagemtg.com/wp-content/uploads/2025/04/JET-NON-QM-2nds-Matrix-4.17.25.pdf",
  // GIANT Lending (division of OCMBC, NMLS #2125)
  giantNonQm: "https://www.thegiantlending.com/non-qm-non-conforming-loans/",
  giantSub600: "https://www.thegiantlending.com/sub600/",
  giantDscr14: "https://www.thegiantlending.com/business-purpose-loan/dscr-1-4-units/",
  giantDscr58: "https://www.thegiantlending.com/dscr-5-8-program/",
  giantFusion: "https://www.thegiantlending.com/business-purpose-loan/dscr-fusion/",
  giantSeconds: "https://www.thegiantlending.com/non-qm-seconds/",
  // First Colony Wholesale (First Colony Mortgage Corp, NMLS #3112)
  fcmProducts: "https://fcmtpo.com/products/",
  fcmDscr: "https://fcmtpo.com/wp-content/uploads/2026/05/Sharp-Advantage-DSCR-Matrix-5.13.26-.pdf",
  fcmFullAlt: "https://fcmtpo.com/wp-content/uploads/2026/05/Sharp-Advantage-Full-Alt-Doc-Matrix-5.13.26-.pdf",
  fcmGuidelines: "https://fcmtpo.com/wp-content/uploads/2026/05/Sharp-Advantage-NonQM-Underwriting-Guidelines-5.13.26-.pdf",
  fcmPpp: "https://fcmtpo.com/wp-content/uploads/2026/02/Sharp-Advantage-NonQM-PPP-Matrix-2.10.26-3.pdf",
};

// ---------------------------------------------------------------------------
// Shared enum vocab (matches src/domain/types/enums.ts)
// ---------------------------------------------------------------------------
const firstLien = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const domestic = ["us_citizen", "permanent_resident", "non_permanent_resident"];
const occupanciesAll = ["primary", "second_home", "investment"];
const props14 = ["single_family", "townhome", "pud", "condo", "non_warrantable_condo", "2_4_unit", "rural"];
const propsDscr = ["single_family", "condo", "non_warrantable_condo", "2_4_unit"];
const propsSeconds = ["single_family", "townhome", "pud", "condo", "non_warrantable_condo", "2_4_unit"];

function base(overrides = {}) {
  return {
    active: true,
    incomeDocTypes: ["full_doc"],
    loanPurposes: firstLien,
    occupancies: occupanciesAll,
    propertyTypes: props14,
    eligibleStates: "ALL",
    citizenshipEligible: domestic,
    vestingEligible: ["individual", "joint_tenants", "trust"],
    minLoanAmount: 125000,
    maxLoanAmount: 0,
    minFico: 0,
    maxDti: 50,
    baseMaxLtv: 0,
    minReservesMonths: 0,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: ["none"],
    ...overrides,
  };
}

// record(lender, name, source, version, effectiveDate, config, aliases, pendingReview)
function record(lender, name, source, version, effectiveDate, config, aliases = [], pendingReview = false) {
  return { lender, name, aliases, source, version, effectiveDate, pendingReview, config };
}

// ===========================================================================
// 1. GIANT LENDING — NON-QM only (division of OCMBC, NMLS #2125)
// ===========================================================================
const giantPrograms = [
  record("GIANT Lending", "NON-QM SUB600 (500 FICO)", SOURCES.giantSub600, "SUB600 — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["full_doc", "bank_statement"],
      minFico: 500, maxDti: 45, maxLoanAmount: 1250000, baseMaxLtv: 65,
      eligibilityLtvMatrix: [
        { minFico: 500, maxLoanAmount: 1250000, maxLtv: 65, loanPurpose: "purchase", occupancy: "primary", sourceSection: "SUB600: 65% LTV" },
        { minFico: 500, maxLoanAmount: 1250000, maxLtv: 65, loanPurpose: "rate_term_refinance", occupancy: "primary", sourceSection: "SUB600: 65% LTV" },
        { minFico: 500, maxLoanAmount: 1250000, maxLtv: 60, loanPurpose: "cash_out_refinance", occupancy: "primary", sourceSection: "SUB600: 60% LTV cash out" },
      ],
      cashOutLimits: [{ maxLtv: 60, maxCashOutAmount: null }],
      propertyTypes: props14,
      firstTimeHomebuyerAllowed: true,
      majorRestrictions: [
        "Minimum FICO 500 (first-time homebuyers 580+)",
        "$1,250,000 max loan amount",
        "65% LTV purchase/rate-term; 60% LTV cash-out",
        "Max 45% DTI; SFR, 2-4 unit, PUD, condo",
      ],
      searchTags: ["SUB600", "500 FICO", "low credit"],
    }), ["Sub-600", "500 FICO Minimum"]),
  record("GIANT Lending", "NON-QM Full Doc / 1099 / Asset", SOURCES.giantNonQm, "NON-QM programs page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["full_doc", "1099", "wvoe_only", "asset_depletion"],
      minFico: 500, maxDti: 50, maxLoanAmount: 4000000, baseMaxLtv: 90,
      interestOnlyAvailable: true,
      majorRestrictions: [
        "Loan amounts to $4,000,000",
        "Alt-doc paths to 90% LTV",
        "40-year I/O available",
        "No minimum tradeline when FICO present on all three bureaus",
      ],
      searchTags: ["full doc", "1099", "WVOE", "asset depletion"],
    }), ["Full Doc", "1099"]),
  record("GIANT Lending", "Bank Statement (12/24 personal · 3/12 business)", SOURCES.giantNonQm, "NON-QM programs page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["bank_statement"],
      bankStatementMonthsEligible: [12, 24], bankStatementAccountTypes: ["personal", "business"],
      minFico: 500, maxDti: 50, maxLoanAmount: 4000000, baseMaxLtv: 90,
      searchTags: ["bank statement", "BKST", "deposits", "self-employed"],
    }), ["Bank Statement", "BKST"]),
  record("GIANT Lending", "P&L Only", SOURCES.giantNonQm, "NON-QM programs page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["pnl_only"],
      minFico: 500, maxDti: 50, maxLoanAmount: 2500000, baseMaxLtv: 80,
      pnlOnlyAvailable: true, pnlEligiblePeriods: [24], pnlTaxReturnsRequired: false,
      pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
      pnlMaxLtv: 80, pnlMaxLoanAmount: 2500000, pnlMinFico: 500,
      incomeDocTypeLtvCaps: { pnl_only: { purchase: 80, rate_term_refinance: 80, cash_out_refinance: 75 } },
      majorRestrictions: ["80% LTV / $2.5M P&L-only cap", "P&L is the income document; tax returns not required"],
      searchTags: ["P&L only", "profit and loss", "P and L"],
    })),
  record("GIANT Lending", "DSCR 1–4 Units (Business Purpose)", SOURCES.giantDscr14, "DSCR 1-4 page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["dscr"], occupancies: ["investment"],
      minFico: 620, maxDti: undefined, minDscr: 0.75,
      maxLoanAmount: 3500000, baseMaxLtv: 85,
      purposeLtvMatrix: [
        { maxLoanAmount: 3500000, minFico: 620, occupancy: "investment", minDscr: 0.75, maxLtvPurchase: 85, maxLtvRateTerm: 85, maxLtvCashOut: 80 },
      ],
      propertyTypes: propsDscr,
      specialFeatures: ["Non-warrantable condos OK", "Gift funds allowed", "No limit on financed properties"],
      majorRestrictions: ["Investment occupancy only"],
      searchTags: ["DSCR", "rental", "investor"],
    })),
  record("GIANT Lending", "DSCR 5–8 Units", SOURCES.giantDscr58, "DSCR 5-8 page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["dscr"], occupancies: ["investment"],
      propertyTypes: ["5_8_unit"],
      minFico: 680, maxDti: undefined, minDscr: 1.0,
      maxLoanAmount: 3000000, baseMaxLtv: 70,
      ltvMatrix: [{ minFico: 680, maxLoanAmount: 3000000, maxLtv: 70, occupancy: "investment" }],
      fixedTerms: ["15-year", "30-year"],
      majorRestrictions: ["Min FICO 680", "$3M max", "DSCR >= 1.00"],
      searchTags: ["DSCR", "5-8 units", "multifamily"],
    })),
  record("GIANT Lending", "DSCR Fusion (Rental Income + Asset Utilization)", SOURCES.giantFusion, "DSCR Fusion page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["dscr"], occupancies: ["second_home", "investment"],
      minFico: 500, maxDti: undefined, minDscr: 0.75,
      maxLoanAmount: 2500000, baseMaxLtv: 80,
      eligibilityLtvMatrix: [
        { maxLoanAmount: 2500000, minFico: 500, maxLtv: 80, loanPurpose: "purchase", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { maxLoanAmount: 2500000, minFico: 500, maxLtv: 75, loanPurpose: "rate_term_refinance", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { maxLoanAmount: 2500000, minFico: 500, maxLtv: 70, loanPurpose: "cash_out_refinance", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { maxLoanAmount: 2500000, minFico: 500, maxLtv: 80, loanPurpose: "purchase", minDscr: 1.15 },
        { maxLoanAmount: 2500000, minFico: 500, maxLtv: 75, loanPurpose: "rate_term_refinance", minDscr: 1.15 },
        { maxLoanAmount: 2500000, minFico: 500, maxLtv: 70, loanPurpose: "cash_out_refinance", minDscr: 1.15 },
      ],
      propertyTypes: propsDscr,
      assetQualifierMethods: ["Rental income + asset utilization (401k, retirement, bank, stocks, bonds, IRAs, mutual funds)"],
      majorRestrictions: ["DSCR 0.75–0.99 without assets; 1.15 with assets", "75% LTV rate/term; 70% cash-out", "2-4 units and condos permitted", "No limit on financed properties"],
      searchTags: ["DSCR fusion", "asset depletion", "asset utilization"],
    })),
  record("GIANT Lending", "Non-QM Second (Standalone / HELOAN)", SOURCES.giantSeconds, "Non-QM Seconds page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["full_doc", "bank_statement", "pnl_only", "dscr", "1099", "wvoe_only", "asset_depletion"],
      loanPurposes: ["second_lien"], lienPosition: "standalone_second",
      minFico: 660, maxLoanAmount: 750000,
      ltvMetric: "cltv", baseMaxLtv: 90,
      occupancies: occupanciesAll, propertyTypes: propsSeconds,
      fixedTerms: ["10-year", "20-year", "30-year"],
      majorRestrictions: ["Down to 660 FICO", "Up to $750,000", "90% CLTV", "Non-warrantable condos eligible"],
      searchTags: ["second", "2nd", "piggyback", "HELOAN"],
    }), ["Non-QM 2nds", "Seconds"]),
];

// ===========================================================================
// 2. JET ADVANTAGE MORTGAGE — NON-QM only (division of OCMBC, NMLS #2125)
// ===========================================================================
const jetPrograms = [
  record("Jet Advantage Mortgage", "NON-QM Select & Grades (Full/Alt Doc)", SOURCES.jetMatrix224, "JET NonQM Matrix 2.14.25 (4.17.25 revision keeps the same matrix family)", "2025-02-14",
    base({
      incomeDocTypes: ["full_doc", "1099", "wvoe_only", "bank_statement", "asset_depletion", "pnl_only"],
      minFico: 600, maxDti: 50, maxLoanAmount: 5000000, baseMaxLtv: 90,
      loanPurposes: firstLien,
      eligibilityLtvMatrix: [
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 90, loanPurpose: "purchase" },
        { minFico: 720, maxLoanAmount: 1000000, maxLtv: 90, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase" },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase" },
        { minFico: 740, maxLoanAmount: 1500000, maxLtv: 85, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 1500000, maxLtv: 80, loanPurpose: "purchase" },
        { minFico: 680, maxLoanAmount: 1500000, maxLtv: 75, loanPurpose: "purchase" },
        { minFico: 740, maxLoanAmount: 2000000, maxLtv: 80, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 2000000, maxLtv: 75, loanPurpose: "purchase" },
        { minFico: 680, maxLoanAmount: 2000000, maxLtv: 65, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 2500000, maxLtv: 65, loanPurpose: "purchase" },
        { minFico: 740, maxLoanAmount: 3000000, maxLtv: 70, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 3000000, maxLtv: 60, loanPurpose: "purchase" },
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "rate_term_refinance" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "rate_term_refinance" },
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "cash_out_refinance" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 70, loanPurpose: "cash_out_refinance" },
      ],
      cashOutLimits: [{ maxLtv: 70, maxCashOutAmount: 500000 }, { maxLtv: 100, maxCashOutAmount: null }],
      interestOnlyAvailable: true,
      majorRestrictions: [
        "Grading system: NonQM Select and Grades A+/A/B/C",
        "Cash-out: 5% LTV reduction from program max; cash-in-hand caps by LTV/FICO",
        "Reserves: 6 months minimum at >80% LTV; cash-out may serve as reserves",
        "Max 20 financed properties incl subject (non-DSCR); OCMBC exposure $5M / 6 properties",
        "IO available: min 640 FICO, max 80% LTV",
      ],
      propertyTypes: props14,
      maxMortgageLates30x12: 1,
      searchTags: ["select", "grade", "credit grade", "full doc", "1099"],
    }), ["NonQM Select", "Grades"]),
  record("Jet Advantage Mortgage", "Bank Statement (12/24 personal + 3/12 business)", SOURCES.jetNonQm, "Public NON-QM page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["bank_statement"], bankStatementMonthsEligible: [12, 24], bankStatementAccountTypes: ["personal", "business"],
      minFico: 500, maxDti: 50, maxLoanAmount: 4000000, baseMaxLtv: 90,
      searchTags: ["bank statement", "deposits", "self-employed"],
    }), ["Bank Statement", "BKST"]),
  record("Jet Advantage Mortgage", "P&L Only (No Bank Statements / No Tax Returns)", SOURCES.jetNonQm, "Public NON-QM page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["pnl_only"], minFico: 500, maxDti: 50, maxLoanAmount: 2500000, baseMaxLtv: 85,
      pnlOnlyAvailable: true, pnlEligiblePeriods: [24], pnlTaxReturnsRequired: false,
      pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
      pnlMaxLtv: 85, pnlMaxLoanAmount: 2500000, pnlMinFico: 500,
      majorRestrictions: ["P&L only — no bank statements and no tax returns needed", "85% purchase / 80% refinance cap"],
      searchTags: ["P&L only", "P and L", "no bank statements"],
    })),
  record("Jet Advantage Mortgage", "1099 Only", SOURCES.jetNonQm, "JET Non-QM Matrix 2.14.25", "2025-02-14",
    base({
      incomeDocTypes: ["1099"], minFico: 600, maxLoanAmount: 2000000, baseMaxLtv: 80,
      oneYearSelfEmploymentMonths: 12,
      notes: "1099-only path: 1-yr 1099 with YTD documentation, or 2-yr alternative. 660+ FICO for 85% LTV to $1.5M.",
      searchTags: ["1099", "independent contractor", "gig"],
    })),
  record("Jet Advantage Mortgage", "ITIN (Full Doc & 12-Mo Bank Statement)", SOURCES.jetMatrix224, "JET NON-QM Matrix 2.14.25 — ITIN column", "2025-02-14",
    base({
      incomeDocTypes: ["full_doc", "bank_statement"], citizenshipEligible: ["itin"],
      minFico: 700, maxDti: 50, maxLoanAmount: 1500000, baseMaxLtv: 80,
      ownerOccupiedItinEligible: true, itinSpecialist: true,
      incomeDocTypePurposeRestrictions: { full_doc: ["purchase", "rate_term_refinance"], bank_statement: ["purchase", "rate_term_refinance"] },
      majorRestrictions: ["700+ FICO, 80% max LTV purchase, $1.5M max", "Full doc and 12-mo bank statement only", "Second homes/DSCR paths follow the matrix overlay"],
      searchTags: ["ITIN", "no SSN"],
    }), ["ITIN"]),
  record("Jet Advantage Mortgage", "Non-QM Second (Standalone / HELOAN)", SOURCES.jetSeconds, "Non-QM Seconds page 4.17.25 — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["dscr", "bank_statement", "pnl_only", "1099", "wvoe_only", "asset_depletion", "full_doc"],
      loanPurposes: ["second_lien"], lienPosition: "standalone_second",
      minFico: 660, maxLoanAmount: 750000, ltvMetric: "cltv", baseMaxLtv: 85,
      occupancies: occupanciesAll, propertyTypes: propsSeconds,
      fixedTerms: ["10-year", "20-year", "30-year"],
      majorRestrictions: ["Down to 660 FICO", "Up to $750K", "85% CLTV", "Non-warrantable condos eligible"],
    }), ["Non-QM 2nds", "Seconds"]),
  record("Jet Advantage Mortgage", "DSCR 5–8 Units", SOURCES.jetNonQm, "DSCR 5-8 page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["dscr"], occupancies: ["investment"], propertyTypes: ["5_8_unit"],
      minFico: 680, maxDti: undefined, minDscr: 1.0, maxLoanAmount: 2000000, baseMaxLtv: 70,
      ltvMatrix: [{ minFico: 680, maxLoanAmount: 2000000, maxLtv: 70, occupancy: "investment" }],
      fixedTerms: ["15-year", "30-year"],
      majorRestrictions: ["Min FICO 680", "$2M max", "DSCR >= 1.00"],
    })),
  record("Jet Advantage Mortgage", "DSCR 1-4 (Business Purpose)", SOURCES.jetNonQm, "DSCR / NON-QM public pages — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["dscr"], occupancies: ["second_home", "investment"],
      minFico: 620, maxDti: undefined, minDscr: 0.75, maxLoanAmount: 3500000, baseMaxLtv: 85,
      propertyTypes: propsDscr,
      interestOnlyAvailable: true,
      eligibilityLtvMatrix: [
        { maxLoanAmount: 3500000, minFico: 620, maxLtv: 85, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75 },
        { maxLoanAmount: 3500000, minFico: 620, maxLtv: 85, loanPurpose: "rate_term_refinance", occupancy: "investment", minDscr: 0.75 },
        { maxLoanAmount: 3500000, minFico: 620, maxLtv: 80, loanPurpose: "cash_out_refinance", occupancy: "investment", minDscr: 0.75 },
      ],
      searchTags: ["DSCR", "investor"],
    })),
];

// ===========================================================================
// 3. BROKERS CHOICE MORTGAGE — NON-QM only (division of OCMBC, NMLS #2125)
// ===========================================================================
const bcmPrograms = [
  record("Brokers Choice Mortgage", "NON-QM Select & Grades (Full/Alt Doc)", SOURCES.bcmMatrix417, "BCM NonQM Matrix 4.17.25 — shared OCMBC matrix family (JET sibling 2.14.25)", "2025-04-17",
    base({
      incomeDocTypes: ["full_doc", "1099", "wvoe_only", "bank_statement", "asset_depletion", "pnl_only"],
      minFico: 600, maxDti: 50, maxLoanAmount: 5000000, baseMaxLtv: 90,
      loanPurposes: firstLien,
      eligibilityLtvMatrix: [
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 90, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase" },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase" },
        { minFico: 740, maxLoanAmount: 1500000, maxLtv: 85, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 1500000, maxLtv: 80, loanPurpose: "purchase" },
        { minFico: 680, maxLoanAmount: 1500000, maxLtv: 75, loanPurpose: "purchase" },
        { minFico: 740, maxLoanAmount: 2000000, maxLtv: 80, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 2000000, maxLtv: 75, loanPurpose: "purchase" },
        { minFico: 700, maxLoanAmount: 3000000, maxLtv: 60, loanPurpose: "purchase" },
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "cash_out_refinance" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 70, loanPurpose: "cash_out_refinance" },
      ],
      cashOutLimits: [{ maxLtv: 70, maxCashOutAmount: 500000 }, { maxLtv: 100, maxCashOutAmount: null }],
      interestOnlyAvailable: true,
      majorRestrictions: [
        "Grading system (A+/A/B/C) with proprietary Credit UPgrade mechanics",
        "Cash-out: 5% LTV reduction; cash-in-hand caps by LTV/FICO",
        "Reserves: 6+ months at high LTV; max 20 financed properties",
      ],
      propertyTypes: props14,
      maxMortgageLates30x12: 1,
      searchTags: ["select", "grade", "credit upgrade", "full doc"],
    }), ["NonQM Select", "Grades", "UPgrade"], true),
  record("Brokers Choice Mortgage", "Bank Statement (12/24 personal + 3/12 business)", SOURCES.bcmNonQm, "NON-QM programs page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["bank_statement"], bankStatementMonthsEligible: [12, 24], bankStatementAccountTypes: ["personal", "business"],
      minFico: 500, maxDti: 50, maxLoanAmount: 4000000, baseMaxLtv: 90,
      searchTags: ["bank statement", "BKST", "deposits"],
    }), ["Bank Statement"], true),
  record("Brokers Choice Mortgage", "P&L Only", SOURCES.bcmNonQm, "NON-QM programs page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["pnl_only"], minFico: 500, maxDti: 50, maxLoanAmount: 2500000, baseMaxLtv: 85,
      pnlOnlyAvailable: true, pnlEligiblePeriods: [24], pnlTaxReturnsRequired: false,
      pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
      pnlMaxLtv: 85, pnlMaxLoanAmount: 2500000, pnlMinFico: 500,
      majorRestrictions: ["P&L only path", "85% purchase / 80% refinance cap"],
      searchTags: ["P&L only", "profit and loss"],
    })),
  record("Brokers Choice Mortgage", "DSCR 1–4 (Business Purpose)", SOURCES.bcmDscr417, "BCM NonQM DSCR Matrix 4.17.25 — shared OCMBC family", "2025-04-17",
    base({
      incomeDocTypes: ["dscr"], occupancies: ["second_home", "investment"],
      minFico: 620, maxDti: undefined, minDscr: 0.75, maxLoanAmount: 3500000, baseMaxLtv: 85,
      propertyTypes: propsDscr,
      interestOnlyAvailable: true,
      eligibilityLtvMatrix: [
        { maxLoanAmount: 3500000, minFico: 620, maxLtv: 85, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75 },
        { maxLoanAmount: 3500000, minFico: 620, maxLtv: 85, loanPurpose: "rate_term_refinance", occupancy: "investment", minDscr: 0.75 },
        { maxLoanAmount: 3500000, minFico: 620, maxLtv: 80, loanPurpose: "cash_out_refinance", occupancy: "investment", minDscr: 0.75 },
      ],
      searchTags: ["DSCR", "investor"],
    }), ["DSCR"], true),
  record("Brokers Choice Mortgage", "Non-QM Second (Standalone)", SOURCES.bcmNonQm, "Non-QM Seconds matrix 4.17.25 (OCMBC family)", "2025-04-17",
    base({
      incomeDocTypes: ["dscr", "bank_statement", "pnl_only", "1099", "wvoe_only", "asset_depletion", "full_doc"],
      loanPurposes: ["second_lien"], lienPosition: "standalone_second",
      minFico: 660, maxLoanAmount: 750000, ltvMetric: "cltv", baseMaxLtv: 90,
      occupancies: occupanciesAll, propertyTypes: propsSeconds,
      fixedTerms: ["10-year", "20-year", "30-year"],
      majorRestrictions: ["Down to 660 FICO", "Up to $750K", "90% CLTV", "Non-warrantable condos eligible"],
    }), ["Non-QM 2nds", "Seconds"], true),
  record("Brokers Choice Mortgage", "Credit UPgrade (Non-QM)", SOURCES.bcmCreditUpgrade, "Credit UPgrade page — verified 2026-08-18", "2026-08-18",
    base({
      incomeDocTypes: ["full_doc", "bank_statement"],
      minFico: 600, maxDti: 50, maxLoanAmount: 5000000, baseMaxLtv: 85,
      notes: "Proprietary overlay: grades the loan on Reserves, FICO, DTI, LTV and Residual Income and can raise a credit grade (e.g. B to A, A to A+), improving rate by up to ~1 point and/or LTV.",
      searchTags: ["UPgrade", "credit grade", "price improvement"],
    }), ["Credit UPgrade"], true),
];

// ===========================================================================
// 4. FIRST COLONY WHOLESALE — NON-QM only (First Colony Mortgage Corp, NMLS #3112)
// ===========================================================================
const fcmPrograms = [
  record("First Colony Wholesale", "SHARP Advantage — Full/Alt Doc", SOURCES.fcmFullAlt, "SHARP Advantage Full/Alt Doc Matrix 5.13.26", "2026-05-13",
    base({
      incomeDocTypes: ["full_doc", "bank_statement", "pnl_only", "1099", "asset_depletion"],
      minFico: 640, maxDti: 50, minLoanAmount: 125000, maxLoanAmount: 3000000, baseMaxLtv: 90,
      loanPurposes: firstLien,
      eligibilityLtvMatrix: [
        // Primary, loan bands <= $1M
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 90, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 720, maxLoanAmount: 1000000, maxLtv: 90, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 90, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 660, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 640, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 90, loanPurpose: "rate_term_refinance", occupancy: "primary" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "rate_term_refinance", occupancy: "primary" },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "rate_term_refinance", occupancy: "primary" },
        { minFico: 640, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "rate_term_refinance", occupancy: "primary" },
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "cash_out_refinance", occupancy: "primary" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "cash_out_refinance", occupancy: "primary" },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "cash_out_refinance", occupancy: "primary" },
        { minFico: 640, maxLoanAmount: 1000000, maxLtv: 70, loanPurpose: "cash_out_refinance", occupancy: "primary" },
        // Primary residence bands $1M–$1.5M
        { minFico: 740, maxLoanAmount: 1500000, maxLtv: 90, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 720, maxLoanAmount: 1500000, maxLtv: 90, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 700, maxLoanAmount: 1500000, maxLtv: 90, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 680, maxLoanAmount: 1500000, maxLtv: 85, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 660, maxLoanAmount: 1500000, maxLtv: 80, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 640, maxLoanAmount: 1500000, maxLtv: 70, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 740, maxLoanAmount: 1500000, maxLtv: 80, loanPurpose: "cash_out_refinance", occupancy: "primary" },
        // Primary bands $1.5M–$2M
        { minFico: 740, maxLoanAmount: 2000000, maxLtv: 90, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 720, maxLoanAmount: 2000000, maxLtv: 90, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 700, maxLoanAmount: 2000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 680, maxLoanAmount: 2000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 660, maxLoanAmount: 2000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "primary" },
        // Primary bands $2M–$2.5M
        { minFico: 700, maxLoanAmount: 2500000, maxLtv: 80, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 680, maxLoanAmount: 2500000, maxLtv: 75, loanPurpose: "purchase", occupancy: "primary" },
        // Primary bands $2.5M–$3M
        { minFico: 740, maxLoanAmount: 3000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 720, maxLoanAmount: 3000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 700, maxLoanAmount: 3000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "primary" },
        { minFico: 680, maxLoanAmount: 3000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "primary" },
        // Second home bands
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "second_home" },
        { minFico: 720, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "second_home" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "second_home" },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "second_home" },
        { minFico: 660, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "second_home" },
        { minFico: 640, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "second_home" },
        { minFico: 740, maxLoanAmount: 2000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "second_home" },
        { minFico: 700, maxLoanAmount: 2000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "second_home" },
        // Investment bands
        { minFico: 740, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "investment" },
        { minFico: 720, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "investment" },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 85, loanPurpose: "purchase", occupancy: "investment" },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "investment" },
        { minFico: 660, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "investment" },
        { minFico: 640, maxLoanAmount: 1000000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment" },
        { minFico: 740, maxLoanAmount: 2000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "investment" },
        { minFico: 700, maxLoanAmount: 2000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "investment" },
        { minFico: 740, maxLoanAmount: 3000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "investment" },
      ],
      propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80, "2_4_unit": 80 },
      majorRestrictions: [
        "Min $125K / max $3M; > $2M requires corporate approval; 2 appraisals at >= $2M",
        "Condo caps: warrantable 85%, non-warrantable/condotel 80%; FL condos: purchase 75%, refinance 65%",
        "Cash-out: max $500K when LTV > 65%; unlimited at/below 65%; minimum 6-month seasoning",
        "DTI 50% max (FTHB 45%)",
        "ITIN, foreign national, asylum, DACA ineligible; HI properties ineligible; Baltimore City / Philadelphia PA investment ineligible",
      ],
      searchTags: ["full doc", "alt doc", "sharp", "full alt"],
    }), ["Full/Alt", "Alt Doc", "Sharp Advantage"], true),
  record("First Colony Wholesale", "SHARP Advantage — DSCR", SOURCES.fcmDscr, "SHARP Advantage DSCR Matrix 5.13.26", "2026-05-13",
    base({
      incomeDocTypes: ["dscr"], occupancies: ["investment"],
      minFico: 660, maxDti: undefined, minDscr: 0.75,
      maxLoanAmount: 3000000, baseMaxLtv: 75,
      eligibilityLtvMatrix: [
        // DSCR >=1.00 band
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 660, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "rate_term_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 80, loanPurpose: "rate_term_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "cash_out_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 70, loanPurpose: "cash_out_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 740, maxLoanAmount: 1500000, maxLtv: 80, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 1500000, maxLtv: 80, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 680, maxLoanAmount: 1500000, maxLtv: 75, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 740, maxLoanAmount: 1500000, maxLtv: 80, loanPurpose: "rate_term_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 1500000, maxLtv: 80, loanPurpose: "rate_term_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 740, maxLoanAmount: 1500000, maxLtv: 75, loanPurpose: "cash_out_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 1500000, maxLtv: 70, loanPurpose: "cash_out_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 740, maxLoanAmount: 2000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 2000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 680, maxLoanAmount: 2000000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 2500000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 2500000, maxLtv: 65, loanPurpose: "rate_term_refinance", occupancy: "investment", minDscr: 1.0 },
        { minFico: 740, maxLoanAmount: 3000000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        { minFico: 700, maxLoanAmount: 3000000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment", minDscr: 1.0 },
        // DSCR 0.75–0.99 band (reduced max LTV)
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { minFico: 680, maxLoanAmount: 1000000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 75, loanPurpose: "rate_term_refinance", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { minFico: 700, maxLoanAmount: 1000000, maxLtv: 70, loanPurpose: "cash_out_refinance", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { minFico: 740, maxLoanAmount: 1500000, maxLtv: 75, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { minFico: 700, maxLoanAmount: 1500000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { minFico: 680, maxLoanAmount: 1500000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { minFico: 740, maxLoanAmount: 2000000, maxLtv: 70, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
        { minFico: 700, maxLoanAmount: 2000000, maxLtv: 65, loanPurpose: "purchase", occupancy: "investment", minDscr: 0.75, maxDscrExclusive: 1.0 },
      ],
      propertyTypeLtvCaps: { condo: 80, non_warrantable_condo: 75, condotel: 75, "2_4_unit": 80 },
      propertyTypes: propsDscr,
      interestOnlyAvailable: true,
      majorRestrictions: [
        "DSCR bands: 0.75–0.99 lowers LTV; >=1.00 full grid; I/O requires min DSCR 1.0",
        "Short-term rental DSCR >=1.15 with purchase 75% / refinance 70% max LTV",
        "Cash-out: max $500K when LTV > 65%; unlimited at/below 65%; 6-month seasoning",
        "Loan amounts > $2M require corporate approval; two appraisals at >= $2M",
        "ITI, foreign national, asylum, DACA ineligible",
      ],
      searchTags: ["DSCR", "Sharp DSCR", "investor"],
    }), ["Sharp DSCR", "DSCR 1-4"], false),
  record("First Colony Wholesale", "SHARP Advantage — P&L Only", SOURCES.fcmFullAlt, "SHARP Advantage Full/Alt Doc Matrix 5.13.26 — P&L section", "2026-05-13",
    base({
      incomeDocTypes: ["pnl_only"],
      minFico: 660, maxDti: 50, maxLoanAmount: 3000000, baseMaxLtv: 80,
      loanPurposes: ["purchase", "rate_term_refinance"],
      pnlOnlyAvailable: true, pnlPeriodMonths: 12, pnlTaxReturnsRequired: false,
      pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
      pnlPreparerRequirements: "Most recent third-party prepared P&L — CPA/EA/Tax Attorney only; PTIN prepared not eligible",
      pnlBankStatementSupportRequired: true,
      pnlSupportingStatementMonths: 2,
      majorRestrictions: [
        "P&L qualified income = net income x ownership % / 12 or 24 months",
        "Min 660 FICO; below 720 max LTV 75%",
        "30-year fixed only; purchase and rate/term",
        "Self-employed min 2 yrs; business 1 yr; ownership >= 25%",
        "Preparer must attest to tax return filing; owner-prepared returns ineligible",
      ],
      searchTags: ["P&L only", "profit and loss"],
    }), ["P&L", "Sharp P&L"], false),
  record("First Colony Wholesale", "SHARP Advantage — 1099", SOURCES.fcmFullAlt, "SHARP Advantage Full/Alt Doc 5.13.26 — 1099 section", "2026-05-13",
    base({
      incomeDocTypes: ["1099"],
      minFico: 0, maxDti: 50, maxLoanAmount: 2000000, baseMaxLtv: 80,
      oneYearSelfEmploymentMonths: 12,
      majorRestrictions: [
        "30-year fixed only",
        "100% commission / independent contractors: 1-year receipt of 1099 required; 2 years same line of work",
        "Doc: 1099 + 30-day paystub with YTD, or 3-month bank statement, or 3rd-party WVOE",
      ],
      searchTags: ["1099", "commission", "contractor"],
    }), ["1099 Only"], false),
  record("First Colony Wholesale", "SHARP Advantage — Asset Utilization", SOURCES.fcmFullAlt, "SHARP Advantage Full/Alt Doc 5.13.26 — Assets section", "2026-05-13",
    base({
      incomeDocTypes: ["asset_depletion"],
      minFico: 680, maxDti: 50, maxLoanAmount: 2000000, baseMaxLtv: 80,
      assetQualifierMethods: [
        "Eligible assets (100% checking/savings/money market; 70% stocks/bonds/mutual funds; retirement 70% age >=59.5 / 60% under) less down payment, closing costs, reserves ÷ 60 months",
        "Minimum assets: lesser of 1.5x loan amount or $1,000,000",
      ],
      majorRestrictions: [
        "30-year fixed only; purchase and rate/term only",
        "Primary residence and second home only; no gift funds",
        "Business, trust, foreign or crypto assets not allowed",
      ],
      searchTags: ["asset utilization", "asset depletion", "assets"],
    }), ["Asset Depletion", "Assets"], false),
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
export const PROGRAMS = [...giantPrograms, ...jetPrograms, ...bcmPrograms, ...fcmPrograms];

const CANONICAL = {
  "GIANT Lending": ["giantlending", "giant", "thegiantlending"],
  "Jet Advantage Mortgage": ["jetadvantage", "jet", "jetadvantagemortgage"],
  "Brokers Choice Mortgage": ["brokerschoice", "brokerschoicemortgage", "bcm"],
  "First Colony Wholesale": ["firstcolonywholesale", "firstcolony", "fcm", "fcmtpo"],
};

const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

function loadEnv() {
  const env = { ...process.env };
  for (const filename of [".env.vercel-link.local", ".env.local", "/home/nexus/.env.local", ".env"]) {
    if (!fs.existsSync(filename)) continue;
    for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match || env[match[1]]) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) break;
  }
  return env;
}

async function resolveAdmin(admin) {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").maybeSingle();
  if (error || !data) throw new Error(`Unable to resolve platform admin: ${error?.message ?? "not found"}`);
  return data.id;
}

async function resolveLender(admin, adminId, name) {
  const { data, error } = await admin.from("lenders").select("id,name,tier_level").eq("organization_id", PLATFORM_ORG).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const aliases = CANONICAL[name].map(normalize);
  const matches = (data ?? []).filter((row) => aliases.includes(normalize(row.name)) || aliases.includes(normalize(row.name.split(" ").slice(0, 2).join(""))));
  let target = matches[0];
  if (!target) {
    const created = await admin.from("lenders").insert({
      organization_id: PLATFORM_ORG, name, is_sample_data: false, active: true, tier_level: 2,
      created_by: adminId,
      notes: `Official NON-QM catalog entry — ${name}. Guidelines verified ${VERIFIED_ON} from public matrices/pages.`,
    }).select("id,name,tier_level").single();
    if (created.error) throw new Error(`Create ${name}: ${created.error.message}`);
    target = created.data;
  }
  for (const duplicate of matches.slice(1)) {
    await admin.from("programs").update({ lender_id: target.id }).eq("lender_id", duplicate.id).is("deleted_at", null);
    await admin.from("lenders").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", duplicate.id);
  }
  await admin.from("lenders").update({ name, active: true, is_sample_data: false }).eq("id", target.id);
  return target.id;
}

async function upsertProgram(admin, adminId, lenderId, item) {
  const { data: current, error } = await admin.from("programs").select("id,name,config,version").eq("lender_id", lenderId).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const names = [item.name, ...item.aliases].map(normalize);
  const matches = (current ?? []).filter((row) => names.includes(normalize(row.name)));
  const config = {
    ...item.config, active: true, lenderId, isSampleData: false,
    guidelineVersionLabel: item.version, effectiveDate: item.effectiveDate,
    lastVerifiedDate: VERIFIED_ON, sourceCitation: `${item.version} — ${item.source}`,
  };
  let programId;
  if (matches.length) {
    programId = matches[0].id;
    const saved = await admin.from("programs").update({ name: item.name, active: true, is_sample_data: false, config, version: (matches[0].version ?? 0) + 1 }).eq("id", programId);
    if (saved.error) throw new Error(`Update ${item.name}: ${saved.error.message}`);
    for (const duplicate of matches.slice(1)) await admin.from("programs").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", duplicate.id);
  } else {
    const created = await admin.from("programs").insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: item.name, is_sample_data: false, active: true, config, created_by: adminId }).select("id").single();
    if (created.error) throw new Error(`Insert ${item.name}: ${created.error.message}`);
    programId = created.data.id;
  }
  await admin.from("guideline_versions").update({ verification_status: "superseded" }).eq("program_id", programId).neq("label", item.version).in("verification_status", ["human_verified", "imported_pending_review"]);
  const existing = await admin.from("guideline_versions").select("id").eq("program_id", programId).eq("label", item.version).maybeSingle();
  const row = {
    organization_id: PLATFORM_ORG, program_id: programId, label: item.version,
    effective_date: item.effectiveDate, last_verified_date: VERIFIED_ON,
    verification_status: item.pendingReview ? "imported_pending_review" : "human_verified",
    reviewed_by: item.pendingReview ? null : adminId,
    published_at: item.pendingReview ? null : new Date().toISOString(),
    source_url: item.source, last_checked_at: new Date().toISOString(), change_detected: item.pendingReview,
  };
  const versionSave = existing.data ? await admin.from("guideline_versions").update(row).eq("id", existing.data.id) : await admin.from("guideline_versions").insert(row);
  if (versionSave.error) throw new Error(`Guideline ${item.name}: ${versionSave.error.message}`);
}

export async function runIngestion() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_URL === "[SENSITIVE]") {
    return { skipped: true, programs: 0 };
  }
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminId = await resolveAdmin(admin);
  const counts = {};
for (const lender of Object.keys(CANONICAL)) {
    const lenderId = await resolveLender(admin, adminId, lender);
    const items = PROGRAMS.filter((p) => p.lender === lender);
    for (const item of items) await upsertProgram(admin, adminId, lenderId, item);
    counts[lender] = items.length;
  }
  console.log(`[four-lender-nonqm] complete: ${PROGRAMS.length} NON-QM records across ${Object.keys(counts).length} lenders — ${JSON.stringify(counts)}`);
  return { skipped: false, programs: PROGRAMS.length, counts };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runIngestion().catch((error) => { console.error("[four-lender-nonqm] fatal", error); process.exit(1); });
}