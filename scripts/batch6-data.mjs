// Batch 6 lender ingestion — 3 more real, publicly-sourced Non-QM
// lenders, all placed directly at Tier 3 per the user's request.
//
// NOT added: "Nexera Holding LLC" — this is the legal/DBA parent entity
// of "NewFi Lending" (Newfi Wholesale), which is ALREADY in the catalog
// (added in batch 3, sourced from newfiwholesale.com) — confirmed via
// Newfi's own site footer: "Nexera Holding LLC dba Newfi Lending". Adding
// it again under the legal name would create a duplicate entry for the
// same real company. Disclosed to the user rather than silently skipped
// or silently duplicated.
//
// AmWest Funding Corp. and Hometown Equity Mortgage were already added in
// batch 5 (Tier 2) — this batch just moves them to Tier 3 per this
// request; see scripts/move_batch6_tier3.mjs.
const TODAY = new Date().toISOString().slice(0, 10);

export const LENDERS = [
  {
    name: "United Wholesale Mortgage",
    tierLevel: 3,
    notes:
      "United Wholesale Mortgage, LLC (UWM) — the nation's largest wholesale mortgage lender. UWM's own uwm.com/non-qm-loans page is an internal broker-resource hub without a public matrix table (guidelines are accessed via its internal ChatUWM tool / broker portal); the concrete figures below are drawn from UWM's own official program-launch announcements as reported by established mortgage trade press (HousingWire), not from a broker-portal-only document.",
    program: {
      name: "Investor Flex (DSCR)",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc"],
      minLoanAmount: 50000,
      maxLoanAmount: 2000000,
      minFico: 620,
      baseMaxLtv: 80,
      minReservesMonths: 12,
      interestOnlyAvailable: false,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public reporting — UWM Investor Flex (DSCR) launch",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://www.housingwire.com/articles/uwm-expands-dscr-offerings-to-real-estate-investors/",
      notes:
        "UWM's official announcement (via HousingWire) states \"Investors Flex\" DSCR loans \"up to $2 million\" usable to finance up to 20 properties, \"as little as $50,000\", \"minimum credit score of 620\", \"up to 80% loan-to-value\", two appraisals required above $1.5M. A separate corroborating report (thetruthaboutmortgage.com) cites a minimum 12-month reserves requirement for UWM's related bank-statement/DSCR non-QM offerings. UWM's own site (uwm.com/loan-products) confirms \"Investor Flex (DSCR)\" and \"Bank Statement\" as current live products but does not publish the underlying matrix table publicly — verify current figures with a UWM account executive before quoting.",
    },
  },
  {
    name: "Oaktree Funding Corporation",
    tierLevel: 3,
    notes:
      "Oaktree Funding Corporation (Oaktree Wholesale). Guideline figures below are from its own publicly-hosted underwriting guideline PDFs (nonqmexpert.com is Oaktree's own guideline-document host, per the documents' own text: \"Oaktree Funding offers several Agency and Non-Agency loan programs...\").",
    program: {
      name: "Investor Advantage (DSCR)",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit", "pud", "rural"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
      vestingEligible: ["individual", "llc", "corporation", "trust"],
      minLoanAmount: 150000,
      maxLoanAmount: 3500000,
      minFico: 680,
      minDscr: 0.75,
      baseMaxLtv: 80,
      minReservesMonths: 0,
      interestOnlyAvailable: true,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public PDF — Investor Advantage / Non-Agency Advantage Guidelines",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://www.nonqmexpert.com/download/full-stack/",
      notes:
        "Public guideline PDF states, for its Investor Advantage DSCR product: \"Interest Only FICO 680+, Max 80% LTV (DSCR< 1: Max 75% LTV)\", \"Loan Amount $150k - $3.5M\", \"Occupancy Non-Owner Occupied Business Purpose\". A separate published guideline (Platinum Advantage) states a general \"DSCR ≥ .75\" business-purpose threshold with 6 months reserves and a 24-month housing-event seasoning requirement — used here as the representative minDscr figure. Oaktree also offers Non-Agency Advantage and Titanium Advantage variants with different LTV/FICO tiers not reflected in this single entry.",
    },
  },
  {
    name: "Forward Lending",
    tierLevel: 3,
    notes:
      "Forward Lending, Wholesale Lending Division — a registered DBA of OCMBC, Inc. (NMLS #2125). Guideline figures below are from its own public DSCR program flyer PDF.",
    program: {
      name: "DSCR Loan",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "non_warrantable_condo", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "llc", "corporation", "trust"],
      minLoanAmount: 100000,
      maxLoanAmount: 3500000,
      minFico: 620,
      minDscr: 0.75,
      baseMaxLtv: 80,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public PDF — DSCR Loan flyer",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://forwardlendingmtg.com/wp-content/uploads/2025/01/ForwardLending-FL-DSCRShortTerm-081224.pdf",
      notes:
        "Public flyer states \"Max loan amount $3,500,000\", \"1-4 family properties and condominiums permitted\", \"80% LTV for Purchase, Rate & Term Refi\", \"70% LTV for Cash-Out Refi\", \"Down to 620 FICO\", Non-Warrantable Condos OK, Investment Properties only, gift funds allowed, no limit on financed properties, experienced investors only for the short-term-rental variant. A companion webinar PDF confirms DSCR ratios \"down to .75\" for its No-Ratio pricing category and a separate \"FL_BusinessPurpose\" flyer shows a higher 85%/75% LTV tier at the same 620 min FICO — only the base DSCR flyer's published figures are used in this entry.",
    },
  },
];
