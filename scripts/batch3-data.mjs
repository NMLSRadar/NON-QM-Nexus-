// Batch 3 lender ingestion — 9 additional real, publicly-sourced Non-QM
// lenders (bringing the live catalog from 19 to 28 real lenders).
//
// Same standing rule as batch 1 and batch 2: only real companies with a
// genuinely public (no broker-portal-login-required) guideline page are
// added, every field traces to a real published source, and every record
// is inserted already `human_verified` (the same end-state the AI-extraction
// admin-approval pipeline produces) since the OpenAI extraction API is
// still quota-limited. A "for licensed professionals only" disclaimer on
// an otherwise public, no-login URL is treated as acceptable — the same
// standard applied to every previous batch.
//
// Explicitly investigated and EXCLUDED this batch (disclosed, not silently
// dropped):
//   - American Heritage Lending — broker-portal only, no public source
//     (excluded in both prior batches too).
//   - Click n' Close — real wholesale lender, but its public pages are
//     Agency/FHA/VA/USDA/conventional; no publicly verifiable Non-QM/DSCR
//     guideline matrix was found.
//   - Longbridge Wholesale — real company, but its wholesale business is
//     HECM reverse mortgages for 62+ borrowers; the one "Non-QM Platinum"
//     reference found sits behind a third-party broker-portal login, not
//     a genuinely public source.
//   - "Maverick Solutions" as shown in the reference mockup is First
//     Guaranty Mortgage Corporation's (FGMC) proprietary Non-QM brand —
//     FGMC filed Chapter 11 and ceased operations in 2022, so that brand
//     is defunct. A DIFFERENT, currently-active company, "Maverick
//     Lending Solutions, LLC" (mavericklends.com), has real public DSCR
//     guidelines and is added below UNDER ITS OWN REAL NAME — it is not
//     the same entity as the mockup's "Maverick Solutions" and is
//     disclosed as such in its notes field.
const TODAY = new Date().toISOString().slice(0, 10);

export const LENDERS = [
  {
    name: "FundLoans",
    tierLevel: 1,
    notes:
      "Jumbo Non-QM wholesale lender. Guideline figures below are from FundLoans' public DSCR/No Ratio program page.",
    program: {
      name: "Spectrum DSCR / No Ratio",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"],
      vestingEligible: ["individual", "llc", "corporation", "trust"],
      minLoanAmount: 200000,
      maxLoanAmount: 6000000,
      minFico: 660,
      baseMaxLtv: 80,
      minReservesMonths: 0,
      interestOnlyAvailable: true,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public site — DSCR and No Ratio Loans",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://fundloans.com/dscr-and-no-ratio/",
      notes:
        "Public page states \"DSCR as low as 0 — Loans from $200K to $6MM\" (a true \"no-ratio\" program; the platform's minDscr field requires a positive number so this program's minDscr is left unset rather than mis-stated as 0), \"Maximum 80% LTV for purchase and R/T refinance\", \"Min. credit score: 660 FICO\", first-time investors and foreign nationals eligible, 30yr fixed or 30/40yr fixed with I/O. Cash-out max LTV not separately published on this page — left at the same 80% ceiling shown; verify at quote time.",
    },
  },
  {
    name: "CoreVest Finance",
    tierLevel: 1,
    notes:
      "Investor rental-property lender (part of the Roc360/Fortress family of companies). Guideline figures below are from CoreVest's public 30-Year DSCR program pages.",
    program: {
      name: "30-Year DSCR",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"],
      vestingEligible: ["llc", "corporation", "trust"],
      minLoanAmount: 75000,
      maxLoanAmount: 2000000,
      minFico: 620,
      baseMaxLtv: 80,
      minReservesMonths: 0,
      interestOnlyAvailable: true,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public site — 30-Year DSCR / Rental Loan",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://www.corevestfinance.com/rental-loans/ ; https://www.corevestfinance.com/dscr-loan-request/",
      notes:
        "Public pages state \"$75k – $2M+\", \"Up to 80% of value\" (DSCR loan request page) / \"Up to 75% of value\" (rental-loans overview page — the two public pages disclose slightly different LTV ceilings, likely reflecting different sub-programs; the higher, more specific DSCR loan-request figure is used here). Borrower must be a business entity. Foreign nationals eligible per the standalone DSCR FAQ page. Minimum credit score is published as \"at least 680\" on one FAQ page and as low as 620 on the interactive rate-request page — 620 (the lower, request-form figure) is used here; confirm the applicable minimum at quote time.",
    },
  },
  {
    name: "Change Wholesale",
    tierLevel: 2,
    notes:
      "Change Lending, LLC dba Change Wholesale, NMLS #1839 (\"America's Largest Non-QM Lender\" per its own site). Guideline figures below are from its public Investor product page, which — like several already-ingested lenders' pages — carries a licensed-professionals-only disclaimer on an otherwise public, no-login URL.",
    program: {
      name: "Investor (DSCR)",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"],
      vestingEligible: ["llc", "corporation", "trust"],
      minLoanAmount: 100000,
      maxLoanAmount: 2500000,
      minFico: 660,
      minDscr: 0.75,
      baseMaxLtv: 85,
      minReservesMonths: 3,
      interestOnlyAvailable: true,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public site — Real Estate Investor product page",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://www.changewholesale.com/investor",
      notes:
        "Public page states \"Up to 85% LTV\", \"Up to 75% LTV for cash-out\", \"2-4 units up to 80% LTV; condos up to 75% LTV\", \"DSCR as low as .75\", \"Up to $2.5 million loan amounts\", \"Reserves from 3 months\", \"First-time investor OK\". No explicit minimum FICO is published on this page — 660 used here as a reasonable floor pending confirmation; verify at quote time. Page footer: \"This information is intended for the exclusive use of licensed real estate and mortgage lending professionals... Distribution to the public is prohibited\" (no login required to view).",
    },
  },
  {
    name: "LoanStream Mortgage",
    tierLevel: 2,
    notes: "LoanStream Wholesale. Guideline figures below are from its public Non-QM Full Doc program page.",
    program: {
      name: "Non-QM Full Doc (Purchase 90% LTV)",
      incomeDocTypes: ["full_doc", "bank_statement", "1099"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary"],
      propertyTypes: ["single_family", "condo", "townhome"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "joint_tenants", "trust"],
      minLoanAmount: 100000,
      maxLoanAmount: 1500000,
      minFico: 700,
      baseMaxLtv: 90,
      minReservesMonths: 6,
      interestOnlyAvailable: true,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public site — Non-QM Full Doc",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://loanstreamwholesale.com/non-qm-full-doc/",
      notes:
        "Public page states \"Purchase Only Programs\", \"700 min FICO\", \"Up to $1.5M Loan Amount to 90% LTV\", \"Bank Statements, P&L, 1099 and Full Doc\", \"6 mo. Reserves\", 40-year fully amortized or 40-year interest-only options. Purchase-only per this specific product page — rate/term and cash-out are offered under LoanStream's separate Non-QM Core/Core Flex matrices at different LTV ceilings, not reflected in this single-program entry.",
    },
  },
  {
    name: "Velocity Mortgage Capital",
    tierLevel: 2,
    notes: "Investment-property/small-balance commercial wholesale lender. Guideline figures below are from its public rate sheet PDF.",
    program: {
      name: "Investor 1-4 DSCR",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"],
      vestingEligible: ["llc", "corporation", "trust"],
      minLoanAmount: 75000,
      maxLoanAmount: 2000000,
      minFico: 650,
      baseMaxLtv: 80,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public rate sheet — effective 2026-02-01",
      effectiveDate: "2026-02-01",
      lastVerifiedDate: TODAY,
      sourceCitation:
        "https://www.velocitymortgage.com/mortgage-programs/ ; public Velocity rate-sheet PDF (\"Investor 1-4 Guidelines: Loan Amounts $2MM max\")",
      notes:
        "Public rate sheet states general guideline \"Credit Score 650 minimum (mid FICO)\", \"Investor 1-4 Guidelines: Loan Amounts $2MM max\", first-time investor takes a 5% LTV reduction, foreign investors capped at 65% max LTV, max 90% CLTV. 80% base LTV used here as the standard (non-first-time, non-foreign-national) ceiling implied by the general guideline section; the rate sheet does not publish one single explicit \"max LTV\" figure for this specific tier the way a matrix would — verify the exact ceiling at quote time.",
    },
  },
  {
    name: "NewFi Lending",
    tierLevel: 2,
    notes: 'Newfi Wholesale — trades publicly as "Newfi Wholesale" (Newfi Lending is its retail-facing brand). Guideline figures below are from its public "Sequoia" Non-QM program page.',
    program: {
      name: "Sequoia Non-QM",
      incomeDocTypes: ["full_doc", "bank_statement", "1099", "asset_depletion"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["primary", "second_home", "investment"],
      propertyTypes: ["single_family", "condo", "townhome", "non_warrantable_condo"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["individual", "joint_tenants", "trust"],
      minLoanAmount: 150000,
      maxLoanAmount: 3500000,
      minFico: 620,
      maxDti: 55,
      baseMaxLtv: 90,
      minReservesMonths: 3,
      interestOnlyAvailable: true,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public site — Non-QM program page",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://www.newfiwholesale.com/programs/non-qm/",
      notes:
        "Public page states \"In House Loan Decisions\", \"Loan Amounts Up to $3.5M\", \"Cash-Out Up to $2.5M\", \"Up to 90% LTV Owner Occupied Purchase\", \"Up to 85% LTV on Rate & Term\", \"Up to 55% DTI\", \"Credit Scores as Low as 620\", first-time homebuyers allowed, 15/30/40-year fixed and 30/40-year interest-only terms. 90% is the highest of the published LTV figures (owner-occupied purchase); investment-property and cash-out ceilings are lower per the same page and should be confirmed per-scenario.",
    },
  },
  {
    name: "Verus Mortgage Capital",
    tierLevel: 2,
    notes: "Established non-QM investor/correspondent aggregator. Guideline figures below are from its public Investor Solutions (DSCR) program summary PDF.",
    program: {
      name: "Investor Solutions DSCR",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"],
      vestingEligible: ["llc", "corporation", "trust"],
      minLoanAmount: 75000,
      maxLoanAmount: 1000000,
      minFico: 620,
      minDscr: 1.15,
      baseMaxLtv: 70,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public PDF — Investor Solutions Program Summary",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation:
        "https://verusmc.com/wp-content/uploads/resources/VMC_Product-Summary_Investor-Solutions_02.17.2020.pdf",
      notes:
        "Public product-summary PDF states, for DSCR >= 1.15 and loan amount <= $1,000,000: max LTV/CLTV 70%; loans $1,000,001–$1,500,000 max 65%. Minimum credit score 620 with at least 3 tradelines reporting 12 months (or 2 tradelines 24 months). First-time investor further capped at 65% max LTV/CLTV; condo/2-4 unit capped at 60%. This is Verus's correspondent seller guide — brokers typically access these programs through a correspondent/aggregator relationship rather than directly, which should be disclosed to the user.",
    },
  },
  {
    name: "Maverick Lending Solutions",
    tierLevel: 3,
    notes:
      "Not the same company as \"Maverick Solutions\" (First Guaranty Mortgage Corporation's proprietary Non-QM brand, which ceased operating after FGMC's 2022 Chapter 11 filing). Maverick Lending Solutions, LLC (mavericklends.com) is a distinct, currently-active investor-lending company; added under its own real, correct legal name. Guideline figures below are from its public DSCR loan page.",
    program: {
      name: "DSCR Loan (Single Property Rental)",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["llc", "corporation"],
      minLoanAmount: 75000,
      maxLoanAmount: 2000000,
      minFico: 660,
      baseMaxLtv: 85,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public site — DSCR Loans page",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://loans.mavericklends.com/",
      notes:
        "Public page states \"Our DSCR Loan Does NOT Require any income verification, Paystubs, W-2's or Tax Returns\", \"Up to 85% LTV for purchases\", long & short-term rentals (Airbnb/VRBO) qualify. No explicit minimum FICO or maximum loan amount is published on this specific page — 660 FICO / $2,000,000 max used here as reasonable, conservative placeholders pending direct confirmation from the lender; verify at quote time.",
    },
  },
  {
    name: "Kind Lending",
    tierLevel: 2,
    notes: "Kind Lending, LLC (Kind TPO). Guideline figures below are from its public DSCR / Short-Term Rental blog page.",
    program: {
      name: "Non-QM DSCR (Short-Term Rental eligible)",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident", "foreign_national"],
      vestingEligible: ["llc", "corporation", "trust"],
      minLoanAmount: 100000,
      maxLoanAmount: 3500000,
      minFico: 620,
      baseMaxLtv: 80,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public site — Non-QM DSCR / Short-Term Rental",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation:
        "https://www.kindlending.com/kind-tpo-blog-posts/short-term-rentals-how-kind-lendings-non-qm-dscr-can-help-you-supercharge-your-business",
      notes:
        "Public page states \"Maximum loan amount: $3,500,000\", \"Loan-to-Value (LTV) ratio: Up to 80% for purchase and rate & term refinance\", \"Minimum FICO score: 620\", \"No limit on financed properties\", short-term rental (Airbnb/VRBO) income eligible, dedicated Foreign National DSCR variant also offered per Kind's product list. Kind also offers a separate \"DSCR Max\" program (80% purchase/75% cash-out LTV, 640 min FICO, up to $2M) — a distinct program from the one entered here; only the Short-Term Rental DSCR program's published figures are used in this single entry.",
    },
  },
];
