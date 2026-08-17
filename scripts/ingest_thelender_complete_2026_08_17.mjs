import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
export const VERIFIED_ON = "2026-08-17";
export const SOURCES = {
  productPage: "https://wholesale.thelender.com/nonqm-products/",
  nonQhem: "https://wholesale.thelender.com/wp-content/uploads/2026/08/Non-QHEM_08.04.26E.pdf",
  itin: "https://wholesale.thelender.com/wp-content/uploads/2023/08/ITIN-Mortgage-Matrix.pdf",
};

const NON_QHEM_VERSION = "Non-QHEM 08.04.26E";
const ITIN_VERSION = "theITIN Matrix 10.23.23 — current product page link verified 2026-08-17";
const firstLien = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const domestic = ["us_citizen", "permanent_resident", "non_permanent_resident"];
const occupancies = ["primary", "second_home", "investment"];
const properties = ["single_family", "townhome", "pud", "condo", "non_warrantable_condo", "condotel", "2_4_unit", "rural"];
const condoCaps = { condo: 85, non_warrantable_condo: 80 };

const primaryRows = [
  [720, 1500000, 90, 85, 80], [720, 2000000, 90, 80, 75], [720, 2500000, 80, 75, 75], [720, 3000000, 80, 75, 70], [720, 4000000, 70, 70, null],
  [700, 1500000, 90, 85, 80], [700, 2000000, 85, 80, 75], [700, 3000000, 75, 70, 65], [700, 3500000, 70, 65, null],
  [680, 1000000, 90, 85, 80], [680, 1500000, 85, 85, 75], [680, 2000000, 80, 80, 70], [680, 2500000, 70, 70, 65], [680, 3000000, 70, 65, 65],
  [660, 1500000, 80, 80, 75], [660, 2500000, 70, 70, 65],
  [620, 1000000, 80, 75, 70], [620, 1500000, 70, 65, 65], [620, 2000000, 65, null, null],
];
const nonPrimaryRows = [
  [720, 2000000, 85, 80, 75], [720, 2500000, 80, 75, 75], [720, 3000000, 80, 75, 70], [720, 3500000, 70, 70, null],
  [700, 2000000, 85, 80, 75], [700, 2500000, 75, 70, 65], [700, 3000000, 75, 70, 65], [700, 3500000, 70, 65, null],
  [680, 1500000, 85, 80, 75], [680, 2000000, 80, 80, 70], [680, 2500000, 70, 65, 65], [680, 3000000, 70, 65, 65],
  [660, 1500000, 80, 80, 75], [660, 2500000, 70, 70, 65],
  [620, 1000000, 80, 75, 70], [620, 1500000, 70, 65, 65], [620, 2000000, 65, null, null],
];

function expandMatrix(rows, occupancy) {
  const purposes = ["purchase", "rate_term_refinance", "cash_out_refinance"];
  return rows.flatMap(([minFico, maxLoanAmount, purchase, rateTerm, cashOut]) =>
    [purchase, rateTerm, cashOut].flatMap((maxLtv, index) => maxLtv == null ? [] : [{
      minFico, maxLoanAmount, maxLtv, occupancy, loanPurpose: purposes[index],
      sourcePage: 1, sourceSection: `${occupancy === "primary" ? "Primary Residence" : "Second Home / Investment"} Maximum LTV/CLTV`,
    }]),
  );
}
export const NON_QHEM_LTV_MATRIX = [
  ...expandMatrix(primaryRows, "primary"),
  ...expandMatrix(nonPrimaryRows, "second_home"),
  ...expandMatrix(nonPrimaryRows, "investment"),
];

const itinTiers = [
  [1000000, 740, 80], [1000000, 720, 75], [1000000, 700, 70], [1000000, 680, 65],
  [1500000, 740, 75], [1500000, 720, 75], [1500000, 700, 70], [1500000, 680, 65],
];
export const ITIN_LTV_MATRIX = itinTiers.flatMap(([maxLoanAmount, minFico, maxLtv]) =>
  ["purchase", "rate_term_refinance"].map((loanPurpose) => ({
    maxLoanAmount, minFico, maxLtv, occupancy: "primary", loanPurpose, citizenship: "itin",
    sourcePage: 1, sourceSection: "Owner Occupied CLTV grid",
  })),
);

const creditEventLtvRules = [
  { minSeasoningMonths: 36, maxLoanAmount: 3000000, maxLtvPurchase: 85, maxLtvRefinance: 80 },
  { minSeasoningMonths: 24, maxLoanAmount: 1500000, maxLtvPurchase: 80, maxLtvRefinance: 75 },
  { minSeasoningMonths: 12, maxLoanAmount: 1000000, maxLtvPurchase: 70, maxLtvRefinance: null },
];
const housingHistoryLtvRules = [
  { category: "none", maxLoanAmount: 3000000, maxLtvPurchase: 85, maxLtvRefinance: 80 },
  { category: "late_30", maxLoanAmount: 3000000, maxLtvPurchase: 85, maxLtvRefinance: 80 },
  { category: "late_60", maxLoanAmount: 1500000, maxLtvPurchase: 80, maxLtvRefinance: 75 },
  { category: "late_90", maxLoanAmount: 1000000, maxLtvPurchase: 70, maxLtvRefinance: null },
  { category: "multiple", maxLoanAmount: 1500000, maxLtvPurchase: 80, maxLtvRefinance: 75 },
];

const sharedRuleIndex = [
  { field: "eligibilityLtvMatrix", sourceUrl: SOURCES.nonQhem, documentTitle: "Non-QHEM", effectiveDate: "2026-08-04", page: 1, section: "Maximum LTV/CLTV", status: "verified" },
  { field: "creditEventLtvRules", sourceUrl: SOURCES.nonQhem, documentTitle: "Non-QHEM", effectiveDate: "2026-08-04", page: 1, section: "Credit Requirements", status: "verified" },
  { field: "reserveRules", sourceUrl: SOURCES.nonQhem, documentTitle: "Non-QHEM", effectiveDate: "2026-08-04", page: "1, 4", section: "Reserves", status: "verified" },
  { field: "propertyTypes", sourceUrl: SOURCES.nonQhem, documentTitle: "Non-QHEM", effectiveDate: "2026-08-04", page: "2, 4", section: "Property Requirements / Property Types", status: "verified" },
  { field: "incomeDocumentation", sourceUrl: SOURCES.nonQhem, documentTitle: "Non-QHEM", effectiveDate: "2026-08-04", page: 3, section: "Income Requirements", status: "verified" },
];

function commonNonQhem(overrides = {}) {
  return {
    active: true,
    incomeDocTypes: ["full_doc"],
    loanPurposes: firstLien,
    occupancies,
    propertyTypes: properties,
    eligibleStates: "ALL",
    citizenshipEligible: domestic,
    vestingEligible: ["individual", "joint_tenants", "trust"],
    minLoanAmount: 100000,
    maxLoanAmount: 4000000,
    minFico: 620,
    maxDti: 50,
    conditionalDtiRules: [{
      maxDti: 55, minFico: 680, maxLtv: 70,
      loanPurposes: ["purchase", "rate_term_refinance"],
      requiresResidualIncomeReview: true,
      residualIncomeRequirement: "residual income equal to the greater of 0.5% of the loan amount or $2,000, unless waived with six additional months PITIA reserves",
    }],
    baseMaxLtv: 90,
    eligibilityLtvMatrix: NON_QHEM_LTV_MATRIX,
    propertyTypeLtvCaps: condoCaps,
    citizenshipLtvCaps: { non_permanent_resident: 85 },
    minReservesMonths: 0,
    reserveRules: [
      { maxLoanAmount: 1500000, months: 0 },
      { minLoanAmountExclusive: 1500000, maxLoanAmount: 2500000, months: 6 },
      { minLoanAmountExclusive: 2500000, months: 9 },
      { minLtvExclusive: 75, months: 3 },
    ],
    creditEventLtvRules,
    housingHistoryLtvRules,
    maxMortgageLatesCategory: "late_90",
    giftFundsAllowed: true,
    giftFundsNotes: "Primary: 100% gift allowed for Full Doc or 24-month Bank Statement. Other Alt Doc receives a 10% LTV reduction unless 5% borrower funds are verified. Second home/investment requires 10% borrower funds. Gifts cannot satisfy reserves.",
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: ["Investment only: 12, 24, 36, 48, or 60 months; state restrictions apply"],
    sourceDocuments: [SOURCES.nonQhem, SOURCES.productPage],
    sourceRuleIndex: sharedRuleIndex,
    effectiveDate: "2026-08-04",
    lastVerifiedDate: VERIFIED_ON,
    businessPurposeEligible: true,
    businessPurposeNotes: "Investment-only overlay. Consumer use prohibited; DSCR and personal-occupancy mixed use are ineligible under Non-QHEM Business Purpose. Co-mingled bank statements are ineligible.",
    armTerms: ["7/6 ARM", "10/6 ARM"],
    fixedTerms: ["30-year", "40-year"],
    acreageMaximum: 20,
    acreageLtvCapAtOrAbove10: 80,
    ruralMaxLtv: 80,
    condotelMaxLoanAmount: 2500000,
    condotelMaxLtv: 85,
    majorRestrictions: [
      "FTHB: primary residence only; $1,500,000 maximum loan amount",
      "Non-permanent resident: 85% maximum LTV/CLTV",
      "40-year interest-only: 80% maximum LTV/CLTV",
      "Hawaii lava zones 1 and 2 ineligible",
      "Investment properties in Baltimore City, MD and Philadelphia County, PA ineligible",
      "Manufactured housing and mixed-use/nonresidential income-producing structures ineligible",
    ],
    ...overrides,
  };
}

function itinCommon(overrides = {}) {
  return {
    active: true,
    incomeDocTypes: ["full_doc"],
    loanPurposes: ["purchase", "rate_term_refinance"],
    occupancies: ["primary"],
    propertyTypes: ["single_family", "townhome", "pud", "condo", "non_warrantable_condo", "2_4_unit"],
    eligibleStates: "ALL",
    citizenshipEligible: ["itin"],
    citizenshipDocTypeRestrictions: { itin: [overrides.incomeDocTypes?.[0] ?? "full_doc"] },
    ownerOccupiedItinEligible: true,
    investmentItinEligible: false,
    itinSpecialist: true,
    vestingEligible: ["individual", "trust"],
    minLoanAmount: 125000,
    maxLoanAmount: 1500000,
    minFico: 680,
    maxDti: 45,
    conditionalDtiRules: [{ maxDti: 50, maxLtv: 75, occupancies: ["primary"] }],
    baseMaxLtv: 80,
    eligibilityLtvMatrix: ITIN_LTV_MATRIX,
    propertyTypeLtvCaps: { condo: 80, non_warrantable_condo: 75 },
    minReservesMonths: 3,
    reserveRules: [{ minLoanAmountExclusive: 999999, months: 6 }],
    noHousingHistoryReserveMonths: 6,
    noHousingHistoryMinBorrowerContributionPercent: 10,
    noHousingHistoryNotes: "Potentially eligible only with at least six months reserves after closing, 10% minimum borrower contribution, and VOR/VOM for all available months paid as agreed.",
    maxMortgageLates30x12: 1,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: ["none"],
    matrixConfirmationRequired: true,
    matrixConfirmationNotes: "The current theLender product page still links this 10/23/2023 ITIN matrix, but its age requires human confirmation that no newer overlay supersedes it.",
    sourceDocuments: [SOURCES.itin, SOURCES.productPage],
    sourceRuleIndex: [
      { field: "eligibilityLtvMatrix", sourceUrl: SOURCES.itin, documentTitle: "theITIN Matrix", effectiveDate: "2023-10-23", page: 1, section: "Owner Occupied", status: "needs_review" },
      { field: "documentation", sourceUrl: SOURCES.itin, documentTitle: "theITIN Matrix", effectiveDate: "2023-10-23", page: 2, section: "Documentation Options", status: "needs_review" },
      { field: "currentProgramConfirmation", sourceUrl: SOURCES.productPage, documentTitle: "theLender NonQM Products", effectiveDate: VERIFIED_ON, page: "ITIN section", section: "ITIN", status: "verified" },
    ],
    effectiveDate: "2023-10-23",
    lastVerifiedDate: VERIFIED_ON,
    residualIncomeRequirement: 1500,
    creditEventMinimumMonths: 48,
    creditEventMaxLtv: 75,
    noMultipleCreditEventsWithinYears: 7,
    recentlyListedSeasoningMonths: 6,
    subordinateLienSeasoningMonths: 12,
    armTerms: ["5/6 ARM", "7/6 ARM"],
    fixedTerms: ["30-year fully amortizing"],
    majorRestrictions: [
      "Primary residence only; cash-out ineligible",
      "Non-warrantable condo capped at 75% LTV",
      "Individual or living-trust vesting only; LLC/corporation/partnership ineligible",
      "48-month foreclosure, short-sale, deed-in-lieu, and bankruptcy seasoning",
      "Minimum 12-month housing history unless the no-housing-history exception is satisfied",
      "Non-traditional credit ineligible",
    ],
    ...overrides,
  };
}

function program(name, config, aliases = [], pendingReview = false) {
  const isItin = config.citizenshipEligible?.includes("itin");
  return {
    lender: "theLender", name, aliases,
    source: isItin ? SOURCES.itin : SOURCES.nonQhem,
    version: isItin ? ITIN_VERSION : NON_QHEM_VERSION,
    effectiveDate: isItin ? "2023-10-23" : "2026-08-04",
    pendingReview,
    config: { ...config, lastVerifiedDate: VERIFIED_ON },
  };
}

export const PROGRAMS = [
  program("theLender — Full Doc Non-QM", commonNonQhem({
    category: "Full Doc Non-QM", displayIncomeDocumentation: "Full Documentation",
    incomeDocTypes: ["full_doc"], searchTags: ["full doc", "full documentation", "W-2", "tax returns", "Non-QHEM"],
    documentationRequirements: ["Wage/salary: paystubs, W-2s, one or two years tax returns, 4506-C, verbal VOE", "Self-employed: one or two years personal/business tax returns, YTD P&L, 4506-C"],
    notes: "Standard Non-QHEM full-documentation path. The conditional 55% DTI tier requires purchase/rate-term, 680 FICO, 70% max LTV, and residual-income/additional-reserve validation.",
  }), ["Non-QHEM — Full Documentation"]),
  program("theLender — 12-Month Bank Statement", commonNonQhem({
    category: "Bank Statement", displayIncomeDocumentation: "12-Month Bank Statement",
    incomeDocTypes: ["bank_statement"], bankStatementMonthsEligible: [12], bankStatementAccountTypes: ["personal", "business"],
    standardExpenseFactor: 50, minimumExpenseFactor: 10, maximumExpenseFactor: 50, expenseFactorType: "variable_by_business",
    reducedExpenseFactorAvailable: true, cpaExpenseFactorAllowed: true, pnlExpenseFactorAllowed: true,
    businessBankStatementRules: "12 months business statements. Standard factors: 15% consultant/service; 30% small business; 50% medium/large. Third-party CPA/EA/PTIN/tax-preparer ratio allowed with 10% floor, or third-party P&L.",
    expenseFactorNotes: "Personal path requires 12 personal statements plus two business statements showing business activity and transfers. Business path permits standard, third-party ratio, or third-party P&L analysis.",
    searchTags: ["12 month bank statement", "12 months business bank statements", "12 months personal bank statements", "self-employed deposits"],
    notes: "Personal and business paths are supported, but this record never matches a 24-month statement scenario. Other Alt Doc gift-fund reduction applies unless 5% borrower funds are verified.",
  }), ["Non-QHEM — 12-Month Personal Bank Statement", "Non-QHEM — 12-Month Business Bank Statement"]),
  program("theLender — 24-Month Bank Statement", commonNonQhem({
    category: "Bank Statement", displayIncomeDocumentation: "24-Month Bank Statement",
    incomeDocTypes: ["bank_statement"], bankStatementMonthsEligible: [24], bankStatementAccountTypes: ["personal", "business"],
    standardExpenseFactor: 50, minimumExpenseFactor: 10, maximumExpenseFactor: 50, expenseFactorType: "variable_by_business",
    reducedExpenseFactorAvailable: true, cpaExpenseFactorAllowed: true, pnlExpenseFactorAllowed: true,
    businessBankStatementRules: "24 months business statements. Standard factors: 15% consultant/service; 30% small business; 50% medium/large. Third-party CPA/EA/PTIN/tax-preparer ratio allowed with 10% floor, or third-party P&L.",
    expenseFactorNotes: "Personal path requires 24 personal statements plus two business statements showing business activity and transfers. Business path permits standard, third-party ratio, or third-party P&L analysis.",
    searchTags: ["24 month bank statement", "24 months business bank statements", "24 months personal bank statements", "self-employed deposits"],
    notes: "Personal and business paths are supported, but this record never matches a 12-month statement scenario. Primary-residence gift funds may cover 100% subject to reserves and residual income.",
  }), ["Non-QHEM — 24-Month Personal Bank Statement", "Non-QHEM — 24-Month Business Bank Statement"]),
  program("theLender — P&L Only", commonNonQhem({
    category: "P&L Only", displayIncomeDocumentation: "P&L Only", incomeDocTypes: ["pnl_only"],
    minFico: 680, maxLoanAmount: 2500000, maxDti: 50, conditionalDtiRules: [], baseMaxLtv: 85,
    pnlOnlyAvailable: true, pnlEligiblePeriods: [12, 24], pnlPeriodMonths: 12, pnlTaxReturnsRequired: false,
    pnlPreparerAttestationPurpose: "confirms_tax_filing_only", pnlPreparerRequirements: "CPA, EA, CTEC, or Tax Attorney prepared P&L; preparer attests review/preparation of borrower financials for the P&L period and provides ownership percentage.",
    pnlBankStatementSupportRequired: false, pnlMinFico: 680, pnlMaxDti: 50, pnlMaxLoanAmount: 2500000, pnlMaxLtv: 85,
    incomeDocTypeLtvCaps: { pnl_only: { purchase: 85, rate_term_refinance: 80, cash_out_refinance: 80 } },
    minimumBusinessOwnershipPercent: 25,
    searchTags: ["P&L only", "profit and loss only", "P and L", "no bank statements", "qualify using P&L", "CPA P&L", "12-month P&L", "24-month P&L"],
    majorRestrictions: ["680 minimum FICO", "$2,500,000 maximum loan amount", "85% purchase / 80% refinance cap", "Borrowers living rent-free are ineligible", "25% business ownership per current official product page"],
    notes: "The P&L is the qualifying income document. Borrower tax returns are not required for delivery under this P&L-only path; the preparer attestation confirms tax-filing/financial review rather than converting the product to Full Doc.",
  }), ["Non-QHEM — P&L Only"]),
  program("theLender Gig Qualifier — 1099", commonNonQhem({
    category: "1099", displayIncomeDocumentation: "1099", incomeDocTypes: ["1099"],
    fixedExpenseFactor: 10, standardExpenseFactor: 10, minimumExpenseFactor: 10, maximumExpenseFactor: 10, expenseFactorType: "fixed",
    documentationPeriodsEligible: [12, 24], ytdIncomeDocumentationRequired: true,
    searchTags: ["Gig Qualifier", "Gig Worker", "Independent Contractor", "Freelancer", "1099 Only", "one year 1099", "two year 1099", "paid on 1099", "contractor income"],
    notes: "One- or two-year 1099 permitted. Less than two years (minimum one year) is allowed when converting W-2 to 1099 with the same employer and position. YTD documentation must support continued income from the same source. Fixed 10% expense ratio.",
  }), ["Non-QHEM — 1099"]),
  program("theLender — Asset Qualifier", commonNonQhem({
    category: "Asset Depletion", displayIncomeDocumentation: "Asset Qualifier", incomeDocTypes: ["asset_depletion"],
    minFico: 660, maxDti: 43, conditionalDtiRules: [],
    assetQualifierMethods: [
      "Option 1: eligible assets less down payment, out-of-pocket closing costs, and required reserves, divided by 60; minimum eligible assets are the lesser of $1,000,000 or 150% of loan amount",
      "Option 2: eligible assets less down payment, out-of-pocket closing costs, and required reserves, divided by 84; no minimum eligible asset amount",
    ],
    eligibleAssetSources: ["checking", "savings", "money market", "stocks", "bonds", "mutual funds", "vested retirement assets"],
    eligibleAssetPercentages: { checking: 100, savings: 100, moneyMarket: 100, stocksAndBondsNetValue: 100, vestedRetirement: 100 },
    assetVerificationDays: 30,
    searchTags: ["Asset Qualifier", "Asset Depletion", "Asset Utilization", "Asset-Based Income", "liquid assets"],
    notes: "Current public matrix confirms 60- or 84-month depletion and 43% maximum DTI. The current public product page supplies the detailed minimum-asset formula for each option.",
  }), ["Non-QHEM — Asset Utilization"]),
  program("theLender — Written VOE", commonNonQhem({
    category: "Written VOE", displayIncomeDocumentation: "Written Verification of Employment", incomeDocTypes: ["wvoe_only"],
    minFico: 680, maxLoanAmount: 2500000, baseMaxLtv: 85,
    incomeDocTypeLtvCaps: { wvoe_only: { purchase: 85, rate_term_refinance: 80, cash_out_refinance: 80 } },
    documentationRequirements: ["FNMA Form 1005", "Two most recent personal bank statements reflecting employer deposits on each statement"],
    searchTags: ["WVOE", "written VOE", "written verification of employment", "Form 1005"],
    notes: "Independent Non-QHEM documentation method discovered in the current matrix; 680 FICO, $2.5MM loan, 85% purchase/80% refinance documentation caps apply.",
  }), ["Non-QHEM — Written VOE"]),
  program("theLender — P&L Plus", commonNonQhem({
    category: "P&L Plus", displayIncomeDocumentation: "P&L Plus", incomeDocTypes: ["pnl_only"],
    minFico: 680, maxLoanAmount: 2500000, maxDti: 50, conditionalDtiRules: [], baseMaxLtv: 85,
    pnlOnlyAvailable: true, pnlEligiblePeriods: [12, 24], pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
    pnlSupportingBankStatementsMonths: 3, pnlBankStatementSupportRequired: true, pnlMinFico: 680, pnlMaxDti: 50, pnlMaxLoanAmount: 2500000, pnlMaxLtv: 85,
    incomeDocTypeLtvCaps: { pnl_only: { purchase: 85, rate_term_refinance: 80, cash_out_refinance: 80 } },
    searchTags: ["P&L Plus", "P&L with three months bank statements", "profit and loss support"],
    notes: "Separate supported-P&L method: three months bank statements must support P&L income within 10%. All P&L-only preparer/ownership rules also apply.",
  }), ["Non-QHEM — P&L Plus"]),
  program("theLender — ITIN Full Doc", itinCommon({
    category: "ITIN", subcategory: "Full Documentation", displayIncomeDocumentation: "Full Doc", incomeDocTypes: ["full_doc"],
    searchTags: ["ITIN full doc", "ITIN W-2", "ITIN tax returns", "ITIN borrower full documentation"],
    documentationRequirements: ["Standard Fannie Mae documentation", "One or two years", "Alternative Loan Review Form (Exhibit F) or DU Approve/Ineligible finding"],
    notes: "ITIN overlay controls; this record does not inherit standard Non-QHEM Full Doc leverage or loan-size limits.",
  }), ["theITIN — Full Doc"], true),
  program("theLender — ITIN Bank Statement", itinCommon({
    category: "ITIN", subcategory: "Bank Statement", displayIncomeDocumentation: "Bank Statement", incomeDocTypes: ["bank_statement"],
    bankStatementMonthsEligible: [12, 24], bankStatementAccountTypes: ["personal", "business"],
    searchTags: ["ITIN bank statement", "ITIN self-employed", "ITIN borrower using bank statements", "12 month ITIN bank statement", "24 month ITIN bank statement"],
    documentationRequirements: ["12 or 24 months", "Personal or business statements", "Less than two years self-employment allowed per linked ITIN matrix"],
    notes: "ITIN-specific matrix controls. Standard Non-QHEM bank-statement maximums and gift rules do not overwrite this product.",
  }), ["theITIN — Bank Statement"], true),
  program("theLender — ITIN 1099", itinCommon({
    category: "ITIN", subcategory: "1099", displayIncomeDocumentation: "1099", incomeDocTypes: ["1099"],
    searchTags: ["ITIN 1099", "ITIN contractor", "ITIN freelancer", "ITIN borrower paid on 1099"],
    documentationRequirements: ["Two-year 1099", "One year only if converted from W-2 with the same employer and line of work", "VOE with YTD income", "Two months bank statements proving receipt"],
    notes: "ITIN-specific overlay controls. This record does not inherit standard Gig Qualifier FICO/LTV/DTI/loan-size terms.",
  }), ["theITIN — 1099"], true),
];

const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

function loadEnv() {
  const env = { ...process.env };
  for (const filename of [".env.local", ".env.production.local", ".env"]) {
    if (!fs.existsSync(filename)) continue;
    for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match || env[match[1]]) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return env;
}

async function resolveAdmin(admin) {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").maybeSingle();
  if (error || !data) throw new Error(`Unable to resolve platform admin: ${error?.message ?? "not found"}`);
  return data.id;
}

async function resolveLender(admin, adminId) {
  const { data, error } = await admin.from("lenders").select("id,name,tier_level").eq("organization_id", PLATFORM_ORG).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const matches = (data ?? []).filter((row) => ["thelender", "hometownequitymortgage", "hometownequitymortgagellc"].includes(normalize(row.name)));
  let target = matches.find((row) => normalize(row.name) === "thelender") ?? matches[0];
  if (!target) {
    const created = await admin.from("lenders").insert({
      organization_id: PLATFORM_ORG, name: "theLender", is_sample_data: false, active: true, tier_level: 2,
      created_by: adminId, notes: "Hometown Equity Mortgage, LLC DBA theLender | NMLS 133519 | Official Non-QM catalog maintained by Non-QM Nexus.",
    }).select("id,name,tier_level").single();
    if (created.error) throw new Error(created.error.message);
    target = created.data;
  }
  for (const duplicate of matches.filter((row) => row.id !== target.id)) {
    const moved = await admin.from("programs").update({ lender_id: target.id }).eq("lender_id", duplicate.id).is("deleted_at", null);
    if (moved.error) throw new Error(`Merge lender programs: ${moved.error.message}`);
    await admin.from("lenders").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", duplicate.id);
  }
  const updated = await admin.from("lenders").update({
    name: "theLender", active: true, is_sample_data: false,
    notes: "Hometown Equity Mortgage, LLC DBA theLender | NMLS 133519 | Alphabetize and display under T as theLender.",
  }).eq("id", target.id);
  if (updated.error) throw new Error(updated.error.message);
  return target.id;
}

async function upsertProgram(admin, adminId, lenderId, item) {
  const { data: current, error } = await admin.from("programs").select("id,name,config,version").eq("lender_id", lenderId).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const names = [item.name, ...item.aliases].map(normalize);
  const matches = (current ?? []).filter((row) => names.includes(normalize(row.name)));
  const config = {
    ...item.config, active: true, lenderId, isSampleData: false,
    guidelineVersionLabel: item.version, effectiveDate: item.effectiveDate, lastVerifiedDate: VERIFIED_ON,
    sourceCitation: `${item.version} — ${item.source}`,
  };
  let programId;
  if (matches.length) {
    programId = matches[0].id;
    const saved = await admin.from("programs").update({ name: item.name, active: true, is_sample_data: false, config, version: (matches[0].version ?? 0) + 1 }).eq("id", programId);
    if (saved.error) throw new Error(`Update ${item.name}: ${saved.error.message}`);
    for (const duplicate of matches.slice(1)) {
      await admin.from("programs").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", duplicate.id);
    }
  } else {
    const created = await admin.from("programs").insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: item.name, is_sample_data: false, active: true, config, created_by: adminId }).select("id").single();
    if (created.error) throw new Error(`Insert ${item.name}: ${created.error.message}`);
    programId = created.data.id;
  }
  await admin.from("guideline_versions").update({ verification_status: "superseded" }).eq("program_id", programId).neq("label", item.version).in("verification_status", ["human_verified", "imported_pending_review"]);
  const existing = await admin.from("guideline_versions").select("id").eq("program_id", programId).eq("label", item.version).maybeSingle();
  const row = {
    organization_id: PLATFORM_ORG, program_id: programId, label: item.version, effective_date: item.effectiveDate,
    last_verified_date: VERIFIED_ON, verification_status: item.pendingReview ? "imported_pending_review" : "human_verified",
    reviewed_by: item.pendingReview ? null : adminId, published_at: item.pendingReview ? null : new Date().toISOString(),
    source_url: item.source, last_checked_at: new Date().toISOString(), change_detected: item.pendingReview,
  };
  const versionSave = existing.data ? await admin.from("guideline_versions").update(row).eq("id", existing.data.id) : await admin.from("guideline_versions").insert(row);
  if (versionSave.error) throw new Error(`Guideline ${item.name}: ${versionSave.error.message}`);
}

async function archiveObsoleteVariants(admin, lenderId) {
  const keep = new Set(PROGRAMS.flatMap((item) => [item.name, ...item.aliases]).map(normalize));
  const { data, error } = await admin.from("programs").select("id,name").eq("lender_id", lenderId).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const obsoletePrefixes = ["nonqhem12monthpersonalbankstatement", "nonqhem12monthbusinessbankstatement", "nonqhem24monthpersonalbankstatement", "nonqhem24monthbusinessbankstatement"];
  for (const row of data ?? []) {
    const key = normalize(row.name);
    if (obsoletePrefixes.includes(key) && !keep.has(key)) {
      await admin.from("programs").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
}

async function verifyProductionState(admin, lenderId) {
  const { data: programs, error: programError } = await admin.from("programs")
    .select("id,name,active")
    .eq("lender_id", lenderId)
    .eq("active", true)
    .is("deleted_at", null);
  if (programError) throw new Error(`Verify programs: ${programError.message}`);
  const required = new Set(PROGRAMS.map((item) => item.name));
  const actual = new Set((programs ?? []).map((item) => item.name));
  const missing = [...required].filter((name) => !actual.has(name));
  if (missing.length) throw new Error(`Production verification missing programs: ${missing.join(", ")}`);
  const requiredRows = (programs ?? []).filter((item) => required.has(item.name));
  const { data: versions, error: versionError } = await admin.from("guideline_versions")
    .select("program_id,effective_date,verification_status")
    .in("program_id", requiredRows.map((item) => item.id));
  if (versionError) throw new Error(`Verify guideline versions: ${versionError.message}`);
  const latest = new Map();
  for (const version of versions ?? []) {
    const previous = latest.get(version.program_id);
    if (!previous || version.effective_date > previous.effective_date) latest.set(version.program_id, version);
  }
  const statuses = requiredRows.map((item) => latest.get(item.id)?.verification_status);
  const verified = statuses.filter((status) => status === "human_verified").length;
  const pending = statuses.filter((status) => status === "imported_pending_review").length;
  if (verified !== 8 || pending !== 3) throw new Error(`Production verification expected 8 verified / 3 pending; received ${verified} / ${pending}`);
  return { requiredPrograms: requiredRows.length, verified, pending, activeLenderPrograms: programs?.length ?? 0 };
}

export async function runIngestion() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_URL === "[SENSITIVE]") {
    return { skipped: true, programs: 0 };
  }
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminId = await resolveAdmin(admin);
  const lenderId = await resolveLender(admin, adminId);
  for (const item of PROGRAMS) await upsertProgram(admin, adminId, lenderId, item);
  await archiveObsoleteVariants(admin, lenderId);
  const verification = await verifyProductionState(admin, lenderId);
  console.log(`[thelender-ingest] complete: ${PROGRAMS.length} independent product records; ${PROGRAMS.filter((p) => p.pendingReview).length} ITIN records held for admin review`);
  console.log(`[thelender-ingest] verified production: ${verification.requiredPrograms} required programs (${verification.verified} human-verified, ${verification.pending} pending review); ${verification.activeLenderPrograms} total active theLender programs including existing DSCR/foreign-national specialties`);
  return { skipped: false, programs: PROGRAMS.length, verification };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runIngestion().catch((error) => { console.error("[thelender-ingest] fatal", error); process.exit(1); });
}
