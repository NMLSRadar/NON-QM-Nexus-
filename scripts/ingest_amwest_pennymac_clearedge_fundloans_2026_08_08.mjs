import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
export const VERIFIED_ON = "2026-08-08";

const SOURCES = {
  amwestAdvantage: "https://amwestwholesale.com/content/documents/AmWest-Advantage-Program-Appvd.pdf",
  amwestInvestor: "https://amwestcorrespondent.com/Content/Documents/AmWest-Investor-Advantage-%20Corr%20Edition-%20APPVD.pdf",
  pennymacAPlus: "https://corr.pennymac.com/assets/documents/non-qm-resources/non-qm-a-plus-product-profile.pdf",
  pennymacA: "https://corr.pennymac.com/assets/documents/non-qm-resources/non-qm-a-product-profile.pdf",
  pennymacAMinus: "https://corr.pennymac.com/assets/documents/non-qm-resources/non-qm-a-minus-product-profile.pdf",
  pennymacDscr: "https://corr.pennymac.com/assets/documents/non-qm-resources/non-qm-dscr-product-profile.pdf",
  pennymacComparison: "https://corr.pennymac.com/assets/documents/non-qm-resources/Non-QM_Product_Comparison.pdf",
  clearEdgeConnect: "https://clearedgelending.com/wp-content/uploads/2026/07/2026-7.1-CEL-PP-Connect-Product-Matrix-Clean-Copy.pdf",
  clearEdgeInvestor: "https://clearedgelending.com/wp-content/uploads/2025/10/2025-10.13-CEL-Investor-Connect-Matrix.pdf",
  clearEdgeJade: "https://clearedgelending.com/wp-content/uploads/2026/07/7.22.2026-Jade-Matrix.pdf",
  fundLoansHub: "https://fundloans.com/guidelines",
  fundLoansPortfolio: "https://guidelines.fundloans.com/portfolio",
  fundLoansApex: "https://gl.fundloans.com/apex-matrix.pdf",
  fundLoansMontage: "https://gl.fundloans.com/montage-matrix.pdf",
  fundLoansSpectrum: "https://gl.fundloans.com/spectrum-matrix.pdf",
  fundLoansArete: "https://gl.fundloans.com/arete-matrix.pdf",
  fundLoansAspire: "https://gl.fundloans.com/aspire-matrix.pdf",
  fundLoansAspireX: "https://gl.fundloans.com/aspire-x-matrix.pdf",
};

const commonProperties = ["single_family", "condo", "non_warrantable_condo", "townhome", "pud", "2_4_unit"];
const domestic = ["us_citizen", "permanent_resident", "non_permanent_resident"];
const firstLienPurposes = ["purchase", "rate_term_refinance", "cash_out_refinance"];

function matrixRows(rows, extras = {}) {
  return rows.flatMap(([maxLoanAmount, minFico, purchase, rateTerm, cashOut]) => [
    purchase == null ? null : { maxLoanAmount, minFico, loanPurpose: "purchase", maxLtv: purchase, ...extras },
    rateTerm == null ? null : { maxLoanAmount, minFico, loanPurpose: "rate_term_refinance", maxLtv: rateTerm, ...extras },
    cashOut == null ? null : { maxLoanAmount, minFico, loanPurpose: "cash_out_refinance", maxLtv: cashOut, ...extras },
  ].filter(Boolean));
}

function bankVariants({ lender, family, source, version, effectiveDate, base, matrix, notes, fields = {} }) {
  return [12, 24].flatMap((months) => ["personal", "business"].map((kind) => ({
    lender,
    name: `${family} — ${months}-Month ${kind === "personal" ? "Personal" : "Business"} Bank Statement`,
    aliases: [],
    source,
    version,
    effectiveDate,
    config: {
      ...base,
      incomeDocTypes: ["bank_statement"],
      bankStatementMonthsEligible: [months],
      bankStatementAccountTypes: [kind],
      eligibilityLtvMatrix: matrix,
      searchTags: ["bank statement", `${months} month`, `${kind} statements`, "business deposits", "self-employed"],
      sourceDocuments: source.split(" | ").filter((item) => item.startsWith("http")),
      notes: `${notes} This record is deliberately separated by statement period and account type so Voice Scenario evaluates the stated ${months}-month ${kind} pathway rather than matching a generic bank-statement label.`,
      ...fields,
    },
  })));
}

const amwestAdvantageRows = [
  [1_500_000, 720, 85, 85, 75], [1_500_000, 700, 80, 80, 75], [1_500_000, 660, 75, 75, 65],
  [1_500_000, 640, 70, 70, null], [1_500_000, 620, 65, 65, null], [2_000_000, 680, 75, 75, 65],
  [2_000_000, 660, 70, 70, null], [2_500_000, 700, 75, 75, 65], [2_500_000, 680, 70, 70, 60],
  [2_500_000, 660, 65, 65, null], [3_000_000, 700, 70, 70, 55], [3_000_000, 680, 60, 60, null],
];
const amwestAdvantageMatrix = matrixRows(amwestAdvantageRows, { sourceSection: "Advantage Program matrices", sourcePage: 4 });
const amwestForeignMatrix = [
  { maxLoanAmount: 1_500_000, citizenship: "foreign_national", occupancy: "second_home", loanPurpose: "purchase", maxLtv: 70, sourcePage: 6 },
  { maxLoanAmount: 1_500_000, citizenship: "foreign_national", occupancy: "second_home", loanPurpose: "rate_term_refinance", maxLtv: 70, sourcePage: 6 },
  { maxLoanAmount: 1_500_000, citizenship: "foreign_national", occupancy: "investment", loanPurpose: "purchase", maxLtv: 70, sourcePage: 6 },
  { maxLoanAmount: 1_500_000, citizenship: "foreign_national", occupancy: "investment", loanPurpose: "rate_term_refinance", maxLtv: 70, sourcePage: 6 },
  { maxLoanAmount: 3_000_000, citizenship: "foreign_national", loanPurpose: "purchase", maxLtv: 60, sourcePage: 6 },
  { maxLoanAmount: 3_000_000, citizenship: "foreign_national", loanPurpose: "rate_term_refinance", maxLtv: 60, sourcePage: 6 },
  { maxLoanAmount: 2_000_000, citizenship: "foreign_national", loanPurpose: "cash_out_refinance", maxLtv: 55, sourcePage: 6 },
];
const amwestDscrStandardRows = matrixRows([
  [1_500_000, 700, 80, 80, 75], [1_500_000, 660, 75, 75, 65], [1_500_000, 640, 70, 70, 60],
  [1_500_000, 620, 60, 60, null], [2_500_000, 660, 75, 75, 70], [2_500_000, 640, 65, 65, 60],
], { minDscr: 1, sourceSection: "Investor Advantage matrix", sourcePage: 4 });
const amwestDscrLowRows = [
  ...matrixRows([[1_500_000, 660, 75, 75, 70], [2_500_000, 660, 75, 75, 70]], { minDscr: .85, maxDscrExclusive: 1, sourcePage: 4 }),
  ...matrixRows([[1_500_000, 660, 65, 65, 60], [2_500_000, 660, 65, 65, 60]], { minDscr: .75, maxDscrExclusive: .85, sourcePage: 4 }),
];

const pennymacAPlusRows = [
  [1_000_000, 740, 90, 90, 80], [1_000_000, 660, 80, 80, null], [1_500_000, 700, 85, 85, 75],
  [1_500_000, 680, 80, 80, null], [2_000_000, 740, 85, 85, 75], [2_000_000, 700, 80, 80, 70],
  [2_000_000, 660, 75, 75, 60], [2_500_000, 720, 80, 80, 70], [2_500_000, 700, 75, 75, 65],
  [2_500_000, 660, 70, 70, null], [3_000_000, 720, 75, 75, 65], [3_000_000, 700, 70, 70, 60],
  [3_500_000, 740, 65, 65, null], [3_500_000, 720, 60, 60, null],
];
const pennymacARows = [
  [1_000_000, 740, 90, 90, null], [1_000_000, 700, 85, 85, 75], [1_000_000, 660, 80, 80, 70],
  [1_500_000, 720, 85, 85, 75], [1_500_000, 680, 80, 80, 70], [1_500_000, 660, 75, 75, 65],
  [2_000_000, 700, 80, 80, 70], [2_000_000, 680, 75, 75, 65], [2_000_000, 660, null, null, 60],
  [2_500_000, 700, 75, 75, 65], [2_500_000, 680, 70, 70, 60], [3_000_000, 740, 60, 60, null],
];
const pennymacAMinusRows = [
  [1_000_000, 720, 85, 85, 75], [1_000_000, 700, 80, 80, 70], [1_000_000, 660, 75, 75, 65],
  [1_500_000, 720, 80, 80, null], [1_500_000, 700, 75, 75, 70], [1_500_000, 680, 75, 75, 65],
  [1_500_000, 660, 70, 70, 60], [2_000_000, 720, 75, 75, null], [2_000_000, 700, 70, 70, null],
];
const pennymacDscrStandard = [
  [1_000_000, 720, 80, 80, 75], [1_000_000, 680, 75, 75, null], [1_000_000, 660, 70, 70, 65],
  [1_500_000, 700, 75, 75, 70], [1_500_000, 680, 70, 70, null], [1_500_000, 660, 65, 65, 60],
  [2_000_000, 720, 75, 75, null], [2_000_000, 700, 70, 70, 60], [2_000_000, 680, 65, 65, null],
  [2_000_000, 660, 60, 60, null],
];
const pennymacDscrLow = [
  [1_000_000, 700, 75, 75, 70], [1_000_000, 680, 70, 70, null], [1_000_000, 660, 60, 60, 60],
  [1_500_000, 700, 70, 70, 65], [2_000_000, 700, 65, 65, 60],
];
const pennymacDscrNoRatio = [
  [1_000_000, 740, 75, 75, 65], [1_000_000, 720, 70, 70, 60], [1_000_000, 700, 65, 65, 60],
  [1_000_000, 680, 65, 60, 60], [1_000_000, 660, 60, 60, 60], [1_500_000, 740, 70, 70, null],
  [1_500_000, 720, 65, 65, 60], [1_500_000, 700, 65, 65, 60], [2_000_000, 740, 65, 65, 60],
];

const clearEdgePrimeRows = [
  [1_000_000, 700, 90, 90, 80], [1_500_000, 720, 90, 90, null], [2_000_000, 680, 85, 85, null],
  [2_000_000, 660, 80, 80, 70], [2_500_000, 680, 80, 80, null], [3_000_000, 700, 80, 80, 70],
  [3_500_000, 700, 75, 75, null],
];
const clearEdgePlusRows = [
  [1_000_000, 680, 80, 80, 80], [1_500_000, 640, 80, 80, 70], [2_000_000, 660, 80, 80, 70],
  [2_500_000, 700, 80, 80, 70], [2_000_000, 620, 75, 75, 65], [3_000_000, 700, 75, 75, null],
];
const clearEdgeDscrStandardRows = [
  [1_500_000, 740, 85, 85, null], [1_000_000, 640, 80, 80, null], [1_500_000, 660, 80, 80, null],
  [2_000_000, 740, 80, 80, null], [1_000_000, 620, 75, 75, 65], [1_500_000, 640, 75, 75, null],
  [2_000_000, 700, 75, 75, null], [2_500_000, 700, 70, 70, 60], [3_000_000, 700, 65, 65, null],
];
const clearEdgeDscrLowRows = [[2_000_000, 720, 75, 75, null], [1_500_000, 680, 70, 70, null], [2_000_000, 700, 65, 65, null]];
const clearEdgeJadeDscrRows = [
  [1_000_000, 700, 80, 75, 75], [1_500_000, 700, 80, 75, 75], [2_000_000, 700, 75, 70, 70],
  [3_000_000, 700, 70, 65, 65], [3_500_000, 700, 70, 65, null], [1_000_000, 660, 75, 75, 70],
  [1_500_000, 660, 75, 70, 70], [2_000_000, 660, 70, 65, 65], [2_500_000, 660, 70, 65, 65],
  [1_000_000, 640, 75, 70, null], [1_500_000, 640, 65, 65, null],
];
const clearEdgeJadeLowRows = [
  [1_000_000, 700, 75, 70, 70], [1_500_000, 700, 75, 70, 70], [2_000_000, 700, 70, 65, 65],
  [2_500_000, 700, 65, null, null], [1_000_000, 680, 70, 65, null], [1_500_000, 680, 70, 65, null],
  [2_000_000, 680, 65, 60, null],
];

const fundLoansSpectrumStandard = [
  [1_000_000, 740, 80, 80, 75], [1_000_000, 720, 80, 80, 75], [1_000_000, 700, 80, 80, 75],
  [1_000_000, 680, 80, 80, 75], [1_000_000, 660, 80, 80, 70], [1_500_000, 740, 75, 75, 70],
  [1_500_000, 700, 75, 75, 70], [1_500_000, 680, 70, 70, 60], [1_500_000, 660, 65, 65, 60],
  [2_000_000, 740, 75, 75, 60], [2_000_000, 700, 70, 70, 60], [2_000_000, 680, 65, 65, null],
  [3_000_000, 740, 75, 75, 60], [3_000_000, 700, 70, 70, 60], [4_000_000, 700, 65, 65, null],
];
const fundLoansSpectrumLow = [
  [1_000_000, 740, 75, 75, 70], [1_000_000, 720, 75, 75, 70], [1_000_000, 700, 75, 75, 65],
  [1_000_000, 680, 70, 70, 60], [1_000_000, 660, 60, 60, 60], [1_500_000, 740, 70, 70, 65],
  [1_500_000, 700, 70, 70, 65], [2_000_000, 740, 65, 65, 60], [2_000_000, 700, 65, 65, null],
];
const fundLoansSpectrumNoRatio = [
  [1_000_000, 740, 75, 75, 65], [1_000_000, 720, 70, 70, 60], [1_000_000, 700, 65, 65, 60],
  [1_000_000, 680, 65, 60, 60], [1_000_000, 660, 60, 60, 60], [1_500_000, 740, 70, 70, 60],
  [1_500_000, 720, 65, 65, 60], [1_500_000, 700, 65, 65, 60], [2_000_000, 740, 65, 65, 60],
];

const baseAltDoc = {
  active: true, loanPurposes: firstLienPurposes, occupancies: ["primary", "second_home", "investment"], propertyTypes: commonProperties,
  eligibleStates: "ALL", citizenshipEligible: domestic, vestingEligible: ["individual", "joint_tenants", "trust"], minLoanAmount: 100_000,
  maxLoanAmount: 3_000_000, minFico: 620, maxDti: 50, baseMaxLtv: 90, minReservesMonths: 3,
  interestOnlyAvailable: true, prepaymentPenaltyOptions: ["none", "1_year", "2_year", "3_year"],
};
const baseDscr = {
  active: true, incomeDocTypes: ["dscr"], loanPurposes: firstLienPurposes, occupancies: ["investment"], propertyTypes: commonProperties,
  eligibleStates: "ALL", citizenshipEligible: domestic, vestingEligible: ["individual", "llc", "corporation", "trust"], minLoanAmount: 100_000,
  maxLoanAmount: 3_000_000, minFico: 620, baseMaxLtv: 85, minReservesMonths: 3, interestOnlyAvailable: true,
  prepaymentPenaltyOptions: ["1_year", "2_year", "3_year", "4_year", "5_year"],
};

export const PROGRAMS = [
  // AmWest — current supplied 2026 summaries. No bank-statement program is created because these sources do not affirmatively document one.
  {
    lender: "AmWest Funding Corp.", name: "Advantage — P&L Only", aliases: ["AmWest Advantage P&L Only"], source: SOURCES.amwestAdvantage,
    version: "AmWest Advantage Program — revised 2026-04-06", effectiveDate: "2026-04-06",
    config: { ...baseAltDoc, incomeDocTypes: ["pnl_only"], maxLoanAmount: 3_000_000, minFico: 660, maxDti: 49,
      eligibilityLtvMatrix: amwestAdvantageMatrix, incomeDocTypeLtvCaps: { pnl_only: { cash_out_refinance: 70 } },
      pnlPeriodMonths: 12, pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
      minSelfEmploymentMonths: 24, reserveRules: [{ months: 6, maxLoanAmount: 1_000_000 }, { months: 9, minLoanAmountExclusive: 1_000_000, maxLoanAmount: 2_000_000 }, { months: 12, minLoanAmountExclusive: 2_000_000 }],
      propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80, rural: 70 }, cashOutLimits: [{ maxLtv: 50, maxCashOutAmount: 2_000_000 }, { maxLtv: 60, maxCashOutAmount: 1_000_000 }, { maxLtv: 65, maxCashOutAmount: 750_000 }, { maxLtv: 75, maxCashOutAmount: 500_000 }],
      sourceDocuments: [SOURCES.amwestAdvantage], searchTags: ["P&L only", "CPA prepared income", "self-employed"],
      notes: "Current AmWest Advantage P&L pathway. No borrower tax returns or 4506-C are required for this alternative-doc option. The licensed tax preparer documents prior filing/review and prepares the P&L; this attestation does not convert the program into tax-return qualification. Max DTI 49%. P&L cash-out is capped at 70% LTV. Source pages 2, 4-5, and 13-16." },
  },
  {
    lender: "AmWest Funding Corp.", name: "Advantage — WVOE", aliases: ["AmWest Advantage WVOE"], source: SOURCES.amwestAdvantage,
    version: "AmWest Advantage Program — revised 2026-04-06", effectiveDate: "2026-04-06",
    config: { ...baseAltDoc, incomeDocTypes: ["wvoe_only"], maxLoanAmount: 3_000_000, maxDti: 49, eligibilityLtvMatrix: amwestAdvantageMatrix,
      reserveRules: [{ months: 6, maxLoanAmount: 1_000_000 }, { months: 9, minLoanAmountExclusive: 1_000_000, maxLoanAmount: 2_000_000 }, { months: 12, minLoanAmountExclusive: 2_000_000 }],
      sourceDocuments: [SOURCES.amwestAdvantage], searchTags: ["WVOE", "written verification of employment", "Form 1005"],
      notes: "Salaried borrowers may qualify with a written verification of employment (FNMA Form 1005 or equivalent). Max DTI 49%. Non-permanent residents require acceptable visa/EAD documentation. Source pages 2, 13, and 22." },
  },
  {
    lender: "AmWest Funding Corp.", name: "Advantage — 1-Year 1099", aliases: ["AmWest Advantage 1099"], source: SOURCES.amwestAdvantage,
    version: "AmWest Advantage Program — revised 2026-04-06", effectiveDate: "2026-04-06",
    config: { ...baseAltDoc, incomeDocTypes: ["1099"], maxLoanAmount: 3_000_000, maxDti: 49, eligibilityLtvMatrix: amwestAdvantageMatrix,
      citizenshipEligible: domestic, minSelfEmploymentMonths: 24, standardExpenseFactor: 10, expenseFactorType: "fixed",
      documentationRequirements: ["Most recent 1099", "WVOE or YTD bank/payment statements", "1099 transcript", "Licensed tax-preparer history letter"],
      sourceDocuments: [SOURCES.amwestAdvantage], searchTags: ["1099", "independent contractor", "10% expense factor"],
      notes: "Uses 90% of gross 1099 income after a fixed 10% expense factor. Requires evidence of at least two years receiving 1099 income, although the income document supplied is the most recent one-year 1099 plus YTD support. P&L and borrower tax returns are not required; 1099 transcripts are required. Foreign nationals are ineligible for this documentation option. Source pages 14-15." },
  },
  {
    lender: "AmWest Funding Corp.", name: "Advantage — Foreign National Alt Doc", aliases: ["AmWest Foreign National"], source: SOURCES.amwestAdvantage,
    version: "AmWest Advantage Program — revised 2026-04-06", effectiveDate: "2026-04-06",
    config: { ...baseAltDoc, incomeDocTypes: ["full_doc", "pnl_only", "wvoe_only"], occupancies: ["second_home", "investment"],
      citizenshipEligible: ["foreign_national"], minFico: 0, noFicoPolicy: "eligible_with_alternative_credit", noFicoMaxLtv: 70,
      maxLoanAmount: 3_000_000, baseMaxLtv: 70, eligibilityLtvMatrix: amwestForeignMatrix, foreignNationalSpecialist: true,
      propertyTypeLtvCaps: { "2_4_unit": 65 }, cashOutLimits: [{ maxLtv: 50, maxCashOutAmount: 2_000_000 }, { maxLtv: 55, maxCashOutAmount: 750_000 }],
      sourceDocuments: [SOURCES.amwestAdvantage], searchTags: ["foreign national", "no FICO", "second home", "investment"],
      notes: "Foreign nationals are eligible for second homes and investment properties. Passport, I-94 when in the U.S., and visa or visa-waiver eligibility are required; impounds and U.S.-bank transfer of foreign assets apply. Rural properties are ineligible. The 1-year 1099 option is not available. Source pages 6 and 11-12." },
  },
  {
    lender: "AmWest Funding Corp.", name: "Investor Advantage — Standard DSCR (>=1.00)", aliases: ["Investor Advantage DSCR"], source: SOURCES.amwestInvestor,
    version: "AmWest Investor Advantage — revised 2026-03-17", effectiveDate: "2026-03-17",
    config: { ...baseDscr, minDscr: 1, maxLoanAmount: 2_500_000, minFico: 620, baseMaxLtv: 80,
      eligibilityLtvMatrix: amwestDscrStandardRows, firstTimeInvestorAllowed: true, firstTimeHomebuyerAllowed: true, firstTimeInvestorLtvAdjustment: 5,
      maxMortgageLates30x12: 1, strIncomeEligible: true, strIncomeLtvAdjustment: 5, strIncomeNotes: "STR requires DSCR >=1.15 and a 5-point LTV reduction.",
      reserveRules: [{ months: 3, maxLoanAmount: 1_000_000 }, { months: 6, minLoanAmountExclusive: 1_000_000 }],
      sourceDocuments: [SOURCES.amwestInvestor], searchTags: ["DSCR", "first-time investor", "Airbnb", "STR"],
      notes: "Investment-only DSCR. First-time homebuyers and first-time investors are allowed; FTHB receives a 5-point LTV reduction, 660 minimum FICO, and must document 0x30x12 housing history. STR is allowed with DSCR >=1.15 and a 5-point LTV reduction. One 30-day mortgage late in 12 months is permitted. Source pages 3-10." },
  },
  {
    lender: "AmWest Funding Corp.", name: "Investor Advantage — Low DSCR (0.75-0.99)", aliases: [], source: SOURCES.amwestInvestor,
    version: "AmWest Investor Advantage — revised 2026-03-17", effectiveDate: "2026-03-17",
    config: { ...baseDscr, minDscr: .75, maxLoanAmount: 2_500_000, minFico: 660, baseMaxLtv: 75, eligibilityLtvMatrix: amwestDscrLowRows,
      firstTimeInvestorAllowed: true, firstTimeHomebuyerAllowed: true, firstTimeInvestorLtvAdjustment: 5, maxMortgageLates30x12: 1,
      reserveRules: [{ months: 6 }], sourceDocuments: [SOURCES.amwestInvestor], searchTags: ["low DSCR", "DSCR below 1", "0.75 DSCR"],
      notes: "Low-DSCR tier preserves separate 0.75-.84 and .85-.99 leverage caps. Minimum six months reserves when DSCR is below 1.00. Source pages 4, 6, and 15." },
  },
  {
    lender: "AmWest Funding Corp.", name: "Investor Advantage — Foreign National DSCR", aliases: [], source: SOURCES.amwestInvestor,
    version: "AmWest Investor Advantage — revised 2026-03-17", effectiveDate: "2026-03-17",
    config: { ...baseDscr, minDscr: .75, citizenshipEligible: ["foreign_national"], minFico: 0, noFicoPolicy: "eligible_with_alternative_credit",
      maxLoanAmount: 2_500_000, baseMaxLtv: 70, foreignNationalDscrEligible: true, foreignNationalSpecialist: true,
      eligibilityLtvMatrix: [
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: .75, loanPurpose: "purchase", maxLtv: 70 },
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: .75, loanPurpose: "rate_term_refinance", maxLtv: 70 },
        { maxLoanAmount: 2_500_000, citizenship: "foreign_national", minDscr: .75, loanPurpose: "purchase", maxLtv: 65 },
        { maxLoanAmount: 2_500_000, citizenship: "foreign_national", minDscr: .75, loanPurpose: "rate_term_refinance", maxLtv: 65 },
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: .75, loanPurpose: "cash_out_refinance", maxLtv: 60 },
      ], reserveRules: [{ months: 6 }], sourceDocuments: [SOURCES.amwestInvestor],
      notes: "Foreign-national investment DSCR. No U.S. FICO is required by the matrix. U.S. address, passport/visa or waiver eligibility, U.S.-bank transfer of foreign assets, and impounds are required. Source pages 4 and 17." },
  },

  // PennyMac — A+/A/A- bank statement pathways are split by statement period and account type.
  ...bankVariants({ lender: "PennyMac", family: "Non-QM A+", source: `${SOURCES.pennymacAPlus} | ${SOURCES.pennymacComparison}`,
    version: "PennyMac Non-QM A+ Product Profile 08.03.26", effectiveDate: "2026-08-03",
    base: { ...baseAltDoc, minLoanAmount: 100_000, maxLoanAmount: 3_500_000, minFico: 660, maxDti: 55, baseMaxLtv: 90,
      citizenshipLtvCaps: { non_permanent_resident: 80 }, propertyTypeLtvCaps: { "2_4_unit": 85, condo: 85, non_warrantable_condo: 80, rural: 75 },
      reserveRules: [{ months: 6, maxLoanAmount: 1_000_000 }, { months: 9, minLoanAmountExclusive: 1_000_000, maxLoanAmount: 2_000_000 }, { months: 12, minLoanAmountExclusive: 2_000_000 }],
      maxMortgageLates30x12: 0, minSelfEmploymentMonths: 24, cashOutLimits: [{ maxLtv: 60, maxCashOutAmount: null }, { maxLtv: 100, maxCashOutAmount: 750_000 }] },
    matrix: matrixRows(pennymacAPlusRows),
    notes: "A+ uses the full loan-amount/FICO/transaction grid, not a headline 90% cap. Non-permanent residents are capped at 80% and cannot cash out. Warrantable condos/2-4 units cap at 85%; non-warrantable condos cap at 80%. Bank-statement methodology varies by business type and employee count; personal and business pathways have distinct rules.",
    fields: { standardExpenseFactor: 50, minimumExpenseFactor: 15, maximumExpenseFactor: 85, expenseFactorType: "variable_by_business", reducedExpenseFactorAvailable: true,
      reducedFactorDocumentation: "Business narrative and either published business-type/employee-count grid, third-party P&L, or licensed tax-professional expense statement", cpaLetterAllowed: true, eaLetterAllowed: true, pnlSupported: true, businessNarrativeRequired: true,
      eligibleDepositPercentage: 100, personalBankStatementRules: "Eligible business-derived deposits averaged over 12/24 months; two business statements validate separate business account; no commingling.",
      businessBankStatementRules: "Eligible deposits x ownership percentage x (1-expense factor); 15/30/50 service and 25/50/85 product-business factors based on employees, or documented third-party method.",
      expenseFactorNotes: "NSFs: max 3 in 12 months, or up to 6 if zero in most recent 3 months. Transfers require business-income evidence; large deposits over 100% of monthly qualifying income require LOE; 24-month declining income uses most recent 12 months." } }),
  ...bankVariants({ lender: "PennyMac", family: "Non-QM A", source: `${SOURCES.pennymacA} | ${SOURCES.pennymacComparison}`,
    version: "PennyMac Non-QM A Product Profile 08.03.26", effectiveDate: "2026-08-03",
    base: { ...baseAltDoc, minLoanAmount: 100_000, maxLoanAmount: 3_000_000, minFico: 660, maxDti: 50, baseMaxLtv: 90,
      citizenshipLtvCaps: { non_permanent_resident: 75 }, propertyTypeLtvCaps: { "2_4_unit": 80, condo: 80, non_warrantable_condo: 75, rural: 75 },
      reserveRules: [{ months: 3, maxLoanAmount: 1_000_000 }, { months: 6, minLoanAmountExclusive: 1_000_000, maxLoanAmount: 2_000_000 }, { months: 9, minLoanAmountExclusive: 2_000_000 }],
      maxMortgageLates30x12: 1, minSelfEmploymentMonths: 24, cashOutLimits: [{ maxLtv: 60, maxCashOutAmount: null }, { maxLtv: 100, maxCashOutAmount: 500_000 }] },
    matrix: matrixRows(pennymacARows), notes: "A uses its own loan-amount/FICO/transaction grid. Non-permanent residents are capped at 75% with no cash-out. Condo/2-4-unit caps are lower than A+. Bank-statement expense factors vary by business and cannot be assumed universally.",
    fields: { standardExpenseFactor: 50, minimumExpenseFactor: 15, maximumExpenseFactor: 85, expenseFactorType: "variable_by_business", reducedExpenseFactorAvailable: true,
      reducedFactorDocumentation: "Business narrative plus published business-type grid, third-party P&L, or licensed tax-professional expense statement", cpaLetterAllowed: true, eaLetterAllowed: true, pnlSupported: true, businessNarrativeRequired: true,
      eligibleDepositPercentage: 100, personalBankStatementRules: "Eligible business-derived deposits averaged over 12/24 months; separate business account validated with two statements.",
      businessBankStatementRules: "Eligible deposits x ownership percentage x (1-expense factor); variable service/product business grid or documented third-party method." } }),
  ...bankVariants({ lender: "PennyMac", family: "Non-QM A-", source: `${SOURCES.pennymacAMinus} | ${SOURCES.pennymacComparison}`,
    version: "PennyMac Non-QM A- Product Profile 08.03.26", effectiveDate: "2026-08-03",
    base: { ...baseAltDoc, minLoanAmount: 100_000, maxLoanAmount: 2_000_000, minFico: 660, maxDti: 50, baseMaxLtv: 85,
      citizenshipLtvCaps: { non_permanent_resident: 75 }, propertyTypeLtvCaps: { "2_4_unit": 75, condo: 75, non_warrantable_condo: 75, rural: 75 },
      reserveRules: [{ months: 3 }], maxMortgageLates30x12: 1, minSelfEmploymentMonths: 24,
      cashOutLimits: [{ maxLtv: 60, maxCashOutAmount: null }, { maxLtv: 100, maxCashOutAmount: 250_000 }] },
    matrix: matrixRows(pennymacAMinusRows), notes: "A- is the lower-leverage grade with its own exact grid; it must not inherit A+ ceilings. Asset Depletion/Asset Qualifier and WVOE are ineligible. Non-permanent residents are capped at 75% with no cash-out.",
    fields: { standardExpenseFactor: 50, minimumExpenseFactor: 15, maximumExpenseFactor: 85, expenseFactorType: "variable_by_business", reducedExpenseFactorAvailable: true,
      reducedFactorDocumentation: "Business narrative plus published business-type grid, third-party P&L, or licensed tax-professional expense statement", cpaLetterAllowed: true, eaLetterAllowed: true, pnlSupported: true, businessNarrativeRequired: true,
      eligibleDepositPercentage: 100 } }),
  {
    lender: "PennyMac", name: "Non-QM A+ — WVOE", aliases: [], source: SOURCES.pennymacAPlus, version: "PennyMac Non-QM A+ Product Profile 08.03.26", effectiveDate: "2026-08-03",
    config: { ...baseAltDoc, incomeDocTypes: ["wvoe_only"], minFico: 660, baseMaxLtv: 80, maxLoanAmount: 3_500_000, maxDti: 55,
      incomeDocTypeLtvCaps: { wvoe_only: { purchase: 80, rate_term_refinance: 80, cash_out_refinance: 80 } }, sourceDocuments: [SOURCES.pennymacAPlus],
      documentationRequirements: ["FNMA Form 1005", "Direct employer delivery/receipt evidence", "Two personal bank statements supporting at least 65% of WVOE wages"],
      notes: "Wage earners only; two years in the same industry and one year continuously at the current employer. Family employment is ineligible. A+ WVOE max 80% LTV/CLTV and 660 minimum FICO." },
  },
  {
    lender: "PennyMac", name: "Non-QM A — WVOE", aliases: [], source: SOURCES.pennymacA, version: "PennyMac Non-QM A Product Profile 08.03.26", effectiveDate: "2026-08-03",
    config: { ...baseAltDoc, incomeDocTypes: ["wvoe_only"], minFico: 660, baseMaxLtv: 75, maxLoanAmount: 3_000_000, maxDti: 50,
      incomeDocTypeLtvCaps: { wvoe_only: { purchase: 75, rate_term_refinance: 75, cash_out_refinance: 75 } }, sourceDocuments: [SOURCES.pennymacA],
      documentationRequirements: ["FNMA Form 1005", "Direct employer delivery/receipt evidence", "Two personal bank statements supporting at least 65% of WVOE wages"],
      notes: "Wage earners only. A WVOE is capped at 75% LTV/CLTV with 660 minimum FICO; A- does not allow WVOE." },
  },
  {
    lender: "PennyMac", name: "Non-QM A+ — Asset Depletion / Asset Qualifier", aliases: [], source: SOURCES.pennymacAPlus, version: "PennyMac Non-QM A+ Product Profile 08.03.26", effectiveDate: "2026-08-03",
    config: { ...baseAltDoc, incomeDocTypes: ["asset_depletion"], occupancies: ["primary"], loanPurposes: ["purchase", "rate_term_refinance"], minFico: 700,
      baseMaxLtv: 85, maxLoanAmount: 3_500_000, maxDti: 55, minReservesMonths: 0, giftFundsAllowed: false,
      documentationRequirements: ["Minimum $450,000 post-closing qualifying assets", "120-day asset seasoning", "Asset Depletion: qualifying assets >= lesser of $1M or 125% of loan", "Asset Qualifier: post-closing assets >=125% of loan"],
      sourceDocuments: [SOURCES.pennymacAPlus], assetQualifierMethods: ["Asset Depletion", "Asset Qualifier residual-income method"],
      notes: "Primary residence only, no cash-out, no gift/business/foreign assets, and no employment income combined. Asset Depletion uses DTI; Asset Qualifier uses residual income. Reserves are not required for these two methods." },
  },
  {
    lender: "PennyMac", name: "Non-QM DSCR — Standard (>=1.00)", aliases: ["PennyMac DSCR"], source: SOURCES.pennymacDscr,
    version: "PennyMac Non-QM DSCR Product Profile 08.03.26", effectiveDate: "2026-08-03",
    config: { ...baseDscr, minDscr: 1, maxLoanAmount: 2_000_000, minFico: 660, baseMaxLtv: 80, eligibilityLtvMatrix: matrixRows(pennymacDscrStandard, { minDscr: 1 }),
      firstTimeInvestorAllowed: true, firstTimeHomebuyerAllowed: false, maxMortgageLates30x12: 0, citizenshipEligible: domestic,
      citizenshipLtvCaps: { non_permanent_resident: 75 }, propertyTypeLtvCaps: { "2_4_unit": 75, condo: 75, non_warrantable_condo: 75 },
      reserveRules: [{ months: 3, maxLoanAmount: 500_000 }, { months: 6, minLoanAmountExclusive: 500_000 }],
      strIncomeEligible: true, strIncomeMaxLtv: 70, strIncomeNotes: "STR income requires DSCR >=1.00 and maximum 70% LTV/CLTV.",
      sourceDocuments: [SOURCES.pennymacDscr], notes: "Investment business-purpose only. First-time investors require 700 FICO and DSCR >=1.00; first-time homebuyers are ineligible. STR capped at 70% LTV. Foreign nationals are ineligible." },
  },
  {
    lender: "PennyMac", name: "Non-QM DSCR — Low DSCR (0.75-0.99)", aliases: [], source: SOURCES.pennymacDscr,
    version: "PennyMac Non-QM DSCR Product Profile 08.03.26", effectiveDate: "2026-08-03",
    config: { ...baseDscr, minDscr: .75, maxLoanAmount: 2_000_000, minFico: 660, baseMaxLtv: 75,
      eligibilityLtvMatrix: matrixRows(pennymacDscrLow, { minDscr: .75, maxDscrExclusive: 1 }), firstTimeInvestorAllowed: false,
      firstTimeHomebuyerAllowed: false, maxMortgageLates30x12: 0, citizenshipLtvCaps: { non_permanent_resident: 75 },
      reserveRules: [{ months: 3, maxLoanAmount: 500_000 }, { months: 6, minLoanAmountExclusive: 500_000 }],
      sourceDocuments: [SOURCES.pennymacDscr], notes: "Separate 0.75-.99 DSCR grid. Interest-only is allowed only at >=0.75 and subject to tighter leverage; first-time investors require DSCR >=1.00 and therefore do not qualify for this low-DSCR tier." },
  },
  {
    lender: "PennyMac", name: "Non-QM DSCR — No Ratio", aliases: [], source: SOURCES.pennymacDscr,
    version: "PennyMac Non-QM DSCR Product Profile 08.03.26", effectiveDate: "2026-08-03",
    config: { ...baseDscr, minDscr: 0, maxLoanAmount: 2_000_000, minFico: 660, baseMaxLtv: 75, eligibilityLtvMatrix: matrixRows(pennymacDscrNoRatio),
      firstTimeInvestorAllowed: false, firstTimeHomebuyerAllowed: false, experiencedInvestorRequired: true, maxMortgageLates30x12: 0,
      strIncomeEligible: false, interestOnlyAvailable: false, reserveRules: [{ months: 3, maxLoanAmount: 500_000 }, { months: 6, minLoanAmountExclusive: 500_000 }],
      sourceDocuments: [SOURCES.pennymacDscr], documentationRequirements: ["Seven years without housing credit events", "0x30x24 on all personally-held real-estate loans"],
      notes: "No-ratio DSCR is a separate tier, not a generic DSCR minimum. Requires seven years without housing credit events and 0x30x24 on personally held real-estate loans. STR and interest-only are ineligible; first-time investors/homebuyers are ineligible." },
  },

  // ClearEdge Connect and Jade.
  ...bankVariants({ lender: "ClearEdge Lending", family: "Prime Connect", source: SOURCES.clearEdgeConnect, version: "ClearEdge Connect Product Matrix 7.1.2026", effectiveDate: "2026-07-01",
    base: { ...baseAltDoc, minLoanAmount: 125_000, maxLoanAmount: 3_500_000, minFico: 660, maxDti: 50, baseMaxLtv: 90, minReservesMonths: 6,
      reserveRules: [{ months: 9, minLoanAmountExclusive: 1_500_000 }], propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 }, minSelfEmploymentMonths: 24,
      maxMortgageLates30x12: 1 }, matrix: matrixRows(clearEdgePrimeRows),
    notes: "Prime Connect supports 12/24-month personal or business statements. Exact business expense method is stored; a generic 50% factor must not be assumed for every borrower.",
    fields: { standardExpenseFactor: 50, minimumExpenseFactor: 10, expenseFactorType: "documentation_driven", reducedExpenseFactorAvailable: true,
      reducedFactorDocumentation: "30% or 20% fixed service-business tests, or licensed independent Tax Attorney/CPA/EA/CTEC third-party ratio (10% floor)", cpaLetterAllowed: true, eaLetterAllowed: true,
      pnlSupported: true, eligibleDepositPercentage: 100, personalBankStatementRules: "100% of verified business transfers/deposits; 2 business statements validate source. A qualifying commingled sole-practitioner service business may use a 10% factor.",
      businessBankStatementRules: "50% all-business default; 30% qualifying small service business; 20% sole owner/operator minimal-overhead service business; documented third-party ratio with 10% floor." } }),
  ...bankVariants({ lender: "ClearEdge Lending", family: "Plus Connect", source: SOURCES.clearEdgeConnect, version: "ClearEdge Connect Product Matrix 7.1.2026", effectiveDate: "2026-07-01",
    base: { ...baseAltDoc, minLoanAmount: 125_000, maxLoanAmount: 3_000_000, minFico: 620, maxDti: 50, baseMaxLtv: 80, minReservesMonths: 6,
      reserveRules: [{ months: 9, minLoanAmountExclusive: 1_500_000 }], propertyTypeLtvCaps: { non_warrantable_condo: 80 }, minSelfEmploymentMonths: 24,
      maxMortgageLates30x12: 1 }, matrix: matrixRows(clearEdgePlusRows), notes: "Plus Connect is the lower-FICO/lower-leverage Connect grade. It preserves the same reviewed 12/24 personal/business statement methods.",
    fields: { standardExpenseFactor: 50, minimumExpenseFactor: 10, expenseFactorType: "documentation_driven", reducedExpenseFactorAvailable: true,
      reducedFactorDocumentation: "Published 30%/20% service-business tests or licensed independent third-party ratio", cpaLetterAllowed: true, eaLetterAllowed: true, pnlSupported: true,
      eligibleDepositPercentage: 100, businessBankStatementRules: "50% default with documented 30%, 20%, or third-party ratio pathways." } }),
  {
    lender: "ClearEdge Lending", name: "Connect — P&L Only", aliases: [], source: SOURCES.clearEdgeConnect, version: "ClearEdge Connect Product Matrix 7.1.2026", effectiveDate: "2026-07-01",
    config: { ...baseAltDoc, incomeDocTypes: ["pnl_only"], occupancies: ["primary"], minFico: 680, maxLoanAmount: 2_000_000, maxDti: 50, baseMaxLtv: 80,
      incomeDocTypeLtvCaps: { pnl_only: { purchase: 80, rate_term_refinance: 75, cash_out_refinance: 70 } }, pnlPeriodMonths: 12,
      pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only", pnlSupportingBankStatementsMonths: 2, minSelfEmploymentMonths: 24,
      sourceDocuments: [SOURCES.clearEdgeConnect], documentationRequirements: ["12/24-month independently prepared P&L", "Borrower business narrative", "Two business statements if preparer did not file most recent return"],
      notes: "Primary residence only. The P&L itself is the income document; borrower tax returns are not required. The tax professional attests to filing status. If the preparer did not file the most recent business return, two months business statements must support at least 80% of monthly-average P&L revenue." },
  },
  {
    lender: "ClearEdge Lending", name: "Connect — WVOE Only", aliases: [], source: SOURCES.clearEdgeConnect, version: "ClearEdge Connect Product Matrix 7.1.2026", effectiveDate: "2026-07-01",
    config: { ...baseAltDoc, incomeDocTypes: ["wvoe_only"], occupancies: ["primary"], minFico: 660, maxLoanAmount: 1_500_000, baseMaxLtv: 80,
      incomeDocTypeLtvCaps: { wvoe_only: { purchase: 80, rate_term_refinance: 70, cash_out_refinance: 70 } }, minSelfEmploymentMonths: 0,
      sourceDocuments: [SOURCES.clearEdgeConnect], documentationRequirements: ["FNMA Form 1005", "Delivery and receipt evidence", "One year at current job; two-year employment history"],
      notes: "Wage earners only. Family/related-party employment is ineligible. Max 80% purchase and 70% refinance, max $1.5M." },
  },
  {
    lender: "ClearEdge Lending", name: "Connect — Asset Depletion", aliases: [], source: SOURCES.clearEdgeConnect, version: "ClearEdge Connect Product Matrix 7.1.2026", effectiveDate: "2026-07-01",
    config: { ...baseAltDoc, incomeDocTypes: ["asset_depletion"], minFico: 620, maxLoanAmount: 3_000_000, baseMaxLtv: 80,
      incomeDocTypeLtvCaps: { asset_depletion: { purchase: 80, rate_term_refinance: 80, cash_out_refinance: 60 } }, giftFundsAllowed: false,
      sourceDocuments: [SOURCES.clearEdgeConnect], notes: "Primary/second-home asset depletion caps at 80%; investment caps at 65%; cash-out caps at 60%. Gift funds are not permitted." },
  },
  {
    lender: "ClearEdge Lending", name: "Investor Connect — Standard DSCR (>=1.00)", aliases: ["Investor Connect DSCR"], source: SOURCES.clearEdgeInvestor,
    version: "ClearEdge Investor Connect Matrix 10.13.2025", effectiveDate: "2025-10-13",
    config: { ...baseDscr, minDscr: 1, maxLoanAmount: 3_000_000, minFico: 620, baseMaxLtv: 85,
      eligibilityLtvMatrix: matrixRows(clearEdgeDscrStandardRows, { minDscr: 1 }), firstTimeInvestorAllowed: true, firstTimeHomebuyerAllowed: true,
      propertyTypeLtvCaps: { condo: 70 }, maxMortgageLates30x12: 1, reserveRules: [{ months: 0, maxLoanAmount: 1_500_000, maxLtv: 70 }, { months: 3, maxLoanAmount: 1_500_000, minLtvExclusive: 70 }, { months: 9, minLoanAmountExclusive: 1_500_000 }, { months: 6, loanPurpose: "cash_out_refinance" }],
      strIncomeEligible: true, strIncomeMaxLtv: 75, strIncomeNotes: "STR purchase: >=1.10 DSCR, max 75%, 700 FICO, one year STR experience, AirDNA; refinance: >=1.00 DSCR, max 70%, 700 FICO, one year STR experience.",
      sourceDocuments: [SOURCES.clearEdgeInvestor], notes: "First-time investor: >=1.00 DSCR, 680 FICO, max 80%, STR ineligible. First-time homebuyer: max 75%, 700 FICO, >=1.00 DSCR, max $750k, no IO/40-year. Foreign-national restrictions are modeled separately." },
  },
  {
    lender: "ClearEdge Lending", name: "Investor Connect — Low DSCR (0.75-0.99)", aliases: [], source: SOURCES.clearEdgeInvestor,
    version: "ClearEdge Investor Connect Matrix 10.13.2025", effectiveDate: "2025-10-13",
    config: { ...baseDscr, minDscr: .75, minLoanAmount: 175_000, maxLoanAmount: 2_000_000, minFico: 680, baseMaxLtv: 75,
      eligibilityLtvMatrix: matrixRows(clearEdgeDscrLowRows, { minDscr: .75, maxDscrExclusive: 1 }), firstTimeInvestorAllowed: false, firstTimeHomebuyerAllowed: false,
      interestOnlyAvailable: false, maxMortgageLates30x12: 1, reserveRules: [{ months: 6, maxLoanAmount: 1_500_000 }, { months: 9, minLoanAmountExclusive: 1_500_000 }],
      sourceDocuments: [SOURCES.clearEdgeInvestor], notes: "Separate 0.75-.99 matrix. 40-year and 40-year IO are not permitted. First-time investor/homebuyer overlays require >=1.00 DSCR and therefore do not apply to this tier." },
  },
  {
    lender: "ClearEdge Lending", name: "Investor Connect — Foreign National DSCR", aliases: ["Investor Jade — DSCR Foreign National and ITIN"], source: SOURCES.clearEdgeInvestor,
    version: "ClearEdge Investor Connect Matrix 10.13.2025", effectiveDate: "2025-10-13",
    config: { ...baseDscr, minDscr: 1, citizenshipEligible: ["foreign_national"], minFico: 0, noFicoPolicy: "eligible_with_alternative_credit",
      maxLoanAmount: 1_500_000, baseMaxLtv: 75, foreignNationalDscrEligible: true, foreignNationalSpecialist: true,
      eligibilityLtvMatrix: [
        { maxLoanAmount: 1_000_000, citizenship: "foreign_national", minDscr: 1, loanPurpose: "purchase", maxLtv: 75 },
        { maxLoanAmount: 1_000_000, citizenship: "foreign_national", minDscr: 1, loanPurpose: "rate_term_refinance", maxLtv: 70 },
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: 1, loanPurpose: "purchase", maxLtv: 65 },
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: 1, loanPurpose: "rate_term_refinance", maxLtv: 65 },
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: 1, loanPurpose: "cash_out_refinance", maxLtv: 65 },
      ], reserveRules: [{ months: 6 }], strIncomeEligible: false, sourceDocuments: [SOURCES.clearEdgeInvestor],
      notes: "Foreign-national Investor Connect allows purchase/rate-term/cash-out on 1-2 units, max $1.5M. DSCR below 1.00 and STR income are not permitted. No FICO requirement; 680 is used for pricing. Six months reserves and tax/insurance escrows apply." },
  },
  ...bankVariants({ lender: "ClearEdge Lending", family: "Prime Jade Alt Doc", source: SOURCES.clearEdgeJade, version: "ClearEdge Jade Matrix 7.22.2026", effectiveDate: "2026-07-22",
    base: { ...baseAltDoc, occupancies: ["primary"], minLoanAmount: 150_000, maxLoanAmount: 4_000_000, minFico: 660, maxDti: 50, baseMaxLtv: 90,
      citizenshipLtvCaps: { non_permanent_resident: 80 }, propertyTypeLtvCaps: { "2_4_unit": 80, condo: 80, condotel: 85 },
      reserveRules: [{ months: 6, maxLtv: 85 }, { months: 12, minLtvExclusive: 85 }, { months: 9, minLoanAmountExclusive: 1_500_000 }, { months: 12, minLoanAmountExclusive: 2_500_000 }],
      minSelfEmploymentMonths: 24, maxMortgageLates30x12: 1 }, matrix: matrixRows(clearEdgePrimeRows),
    notes: "Prime Jade is primary-residence only and has a separate July 22, 2026 matrix. 2-4 units/condos cap at 80%; condotels cap at 85% and $2.5M.",
    fields: { standardExpenseFactor: 50, minimumExpenseFactor: 10, expenseFactorType: "documentation_driven", reducedExpenseFactorAvailable: true,
      reducedFactorDocumentation: "CPA/EA/CTEC/tax-preparer ratio or third-party P&L", cpaLetterAllowed: true, eaLetterAllowed: true, pnlSupported: true,
      eligibleDepositPercentage: 100, personalBankStatementRules: "12/24 personal statements plus two business statements; average eligible deposits.", businessBankStatementRules: "50% fixed factor, third-party ratio with 10% floor, or third-party P&L." } }),
  {
    lender: "ClearEdge Lending", name: "Investor Jade — DSCR (1-4 Unit)", aliases: [], source: SOURCES.clearEdgeJade, version: "ClearEdge Jade Matrix 7.22.2026", effectiveDate: "2026-07-22",
    config: { ...baseDscr, minDscr: 0, maxLoanAmount: 3_500_000, minFico: 640, baseMaxLtv: 80,
      eligibilityLtvMatrix: [...matrixRows(clearEdgeJadeDscrRows, { minDscr: 1 }), ...matrixRows(clearEdgeJadeLowRows, { minDscr: 0, maxDscrExclusive: 1 })],
      firstTimeInvestorAllowed: true, firstTimeHomebuyerAllowed: false, propertyTypeLtvCaps: { "2_4_unit": 75, condo: 75, condotel: 75 },
      strIncomeEligible: true, strIncomeMaxLtv: 75, strIncomeNotes: "Purchase <=75%, refinance <=70%; 12-month average and minimum 20% extraordinary-expense reduction; AirDNA Rentalizer available for purchase with score/comp requirements.",
      reserveRules: [{ months: 2 }, { months: 6, minLoanAmountExclusive: 1_500_000 }, { months: 12, minLoanAmountExclusive: 2_500_000 }],
      sourceDocuments: [SOURCES.clearEdgeJade], notes: "Jade preserves separate >=1.00 and <1.00 grids. First-time investors require 700 FICO, DSCR >1.00, owned primary residence for one year, SFR only, and no cash-out. Vacant/unleased properties are allowed under documented rules." },
  },
  {
    lender: "ClearEdge Lending", name: "Investor Jade — DSCR (5-8 Unit / Mixed Use)", aliases: [], source: SOURCES.clearEdgeJade,
    version: "ClearEdge Jade Matrix 7.22.2026", effectiveDate: "2026-07-22",
    config: { ...baseDscr, minDscr: 1, minLoanAmount: 400_000, maxLoanAmount: 2_000_000, minFico: 700, baseMaxLtv: 75,
      propertyTypes: ["5_8_unit"], experiencedInvestorRequired: true, fiveToEightUnitExperiencedInvestorRequired: true, fiveToEightUnitMinDscr: 1,
      fiveToEightUnitStrIncomeEligible: false, fiveToEightUnitMaxVacantUnits: 2, fiveToEightUnitLtvMatrix: [
        { maxLoanAmount: 1_500_000, minFico: 700, maxLtvPurchase: 75, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
        { maxLoanAmount: 2_000_000, minFico: 700, maxLtvPurchase: 70, maxLtvRateTerm: 65, maxLtvCashOut: 65 },
      ], reserveRules: [{ months: 6 }, { months: 9, minLoanAmountExclusive: 1_500_000 }], sourceDocuments: [SOURCES.clearEdgeJade],
      notes: "Dedicated 5-8 residential / 2-8 mixed-use tier. Experienced investor required; first-time investors and STR income are ineligible. Commercial space is limited to office/retail/restaurant and <49% of area/income. Maximum two vacancies on 4+ units." },
  },
  {
    lender: "ClearEdge Lending", name: "Investor Jade FN — Foreign National DSCR", aliases: [], source: SOURCES.clearEdgeJade,
    version: "ClearEdge Jade Matrix 7.22.2026", effectiveDate: "2026-07-22",
    config: { ...baseDscr, minDscr: 0, citizenshipEligible: ["foreign_national"], minFico: 0, noFicoPolicy: "eligible_with_alternative_credit",
      maxLoanAmount: 1_500_000, baseMaxLtv: 75, foreignNationalDscrEligible: true, foreignNationalSpecialist: true,
      eligibilityLtvMatrix: [
        ...matrixRows([[1_000_000, 680, 75, 65, 65], [1_500_000, 680, 70, 60, 60]], { citizenship: "foreign_national", minDscr: 1 }),
        ...matrixRows([[1_000_000, 680, 65, 60, 60], [1_500_000, 680, 65, null, null]], { citizenship: "foreign_national", minDscr: 0, maxDscrExclusive: 1 }),
      ], noFicoMaxLtv: 75, firstTimeInvestorAllowed: true, reserveRules: [{ months: 6 }], strIncomeEligible: true, strIncomeMaxLtv: 70,
      strIncomeNotes: "STR: <=70% purchase/65% refinance, 12-month average, minimum 20% expense reduction, AirDNA purchase method allowed.",
      sourceDocuments: [SOURCES.clearEdgeJade], notes: "Foreign-credit/no-score is explicitly eligible under the same matrix ceilings. First-time investors are allowed. Six months reserves; gifts not allowed; hazard/flood/tax escrows required." },
  },

  // FundLoans current 2026 matrices and live portfolio guidelines.
  ...bankVariants({ lender: "FundLoans", family: "Apex", source: `${SOURCES.fundLoansApex} | ${SOURCES.fundLoansPortfolio}`, version: "FundLoans Apex Matrix v1.3 — 2026-08-01", effectiveDate: "2026-08-01",
    base: { ...baseAltDoc, minLoanAmount: 300_000, maxLoanAmount: 6_000_000, minFico: 660, maxDti: 50, baseMaxLtv: 90,
      propertyTypeLtvCaps: { "2_4_unit": 85, condo: 85, non_warrantable_condo: 80, rural: 80 }, reserveRules: [{ months: 3, maxLoanAmount: 500_000 }, { months: 6, minLoanAmountExclusive: 500_000, maxLoanAmount: 1_500_000 }, { months: 9, minLoanAmountExclusive: 1_500_000 }],
      minSelfEmploymentMonths: 24, maxMortgageLates30x12: 0 }, matrix: matrixRows(clearEdgePrimeRows),
    notes: "Apex current matrix confirms 12/24-month statement pathways and up to $6M subject to detailed balance/FICO/LTV tiers. Very large loans above the published grid require case-by-case review; the engine does not assign them a fabricated ceiling.",
    fields: { expenseFactorType: "variable_by_business", reducedExpenseFactorAvailable: true, cpaLetterAllowed: true, eaLetterAllowed: true, pnlSupported: true,
      businessNarrativeRequired: true, eligibleDepositPercentage: 100, personalBankStatementRules: "12/24 consecutive personal statements; business-derived eligible deposits only.",
      businessBankStatementRules: "12/24 consecutive business statements; ownership-adjusted eligible deposits less guideline expense factor; transfers/non-business deposits excluded.",
      expenseFactorNotes: "The applicable expense factor depends on business nature and documentation. Do not assume every borrower receives one fixed factor." } }),
  {
    lender: "FundLoans", name: "Apex — P&L Only", aliases: [], source: `${SOURCES.fundLoansApex} | ${SOURCES.fundLoansPortfolio}`,
    version: "FundLoans Portfolio Guidelines v1.4 / Apex Matrix v1.3 — 2026-08-01", effectiveDate: "2026-08-01",
    config: { ...baseAltDoc, incomeDocTypes: ["pnl_only"], minLoanAmount: 300_000, maxLoanAmount: 6_000_000, minFico: 660, maxDti: 50, baseMaxLtv: 80,
      pnlPeriodMonths: 12, pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only", minSelfEmploymentMonths: 24,
      sourceDocuments: [SOURCES.fundLoansApex, SOURCES.fundLoansPortfolio], notes: "P&L Only is an Apex alternative-documentation type. The P&L itself is the income document; tax returns are not required. Matrix tiers and live portfolio overlays control." },
  },
  {
    lender: "FundLoans", name: "Montage — Full Doc", aliases: ["Montage Prime — Full Doc + Asset Qualification"], source: `${SOURCES.fundLoansMontage} | ${SOURCES.fundLoansPortfolio}`,
    version: "FundLoans Montage Matrix v1.3 / Portfolio Guidelines v1.4 — 2026-08-01", effectiveDate: "2026-08-01",
    config: { ...baseAltDoc, incomeDocTypes: ["full_doc"], minLoanAmount: 300_000, maxLoanAmount: 6_000_000, minFico: 660, maxDti: 50, baseMaxLtv: 90,
      eligibilityLtvMatrix: matrixRows(clearEdgePrimeRows), propertyTypeLtvCaps: { "2_4_unit": 85, condo: 85, non_warrantable_condo: 80 },
      sourceDocuments: [SOURCES.fundLoansMontage, SOURCES.fundLoansPortfolio], notes: "Montage full-documentation program with separate exact FICO/loan-amount/transaction tiers. Includes one- and two-year full documentation subject to current guidelines." },
  },
  {
    lender: "FundLoans", name: "Montage — Asset Qualification / Assets Only", aliases: ["Montage Prime — 60-Month Asset Allowance"], source: `${SOURCES.fundLoansMontage} | ${SOURCES.fundLoansPortfolio}`,
    version: "FundLoans Montage Matrix v1.3 / Portfolio Guidelines v1.4 — 2026-08-01", effectiveDate: "2026-08-01",
    config: { ...baseAltDoc, incomeDocTypes: ["asset_depletion"], minLoanAmount: 300_000, maxLoanAmount: 6_000_000, minFico: 660, baseMaxLtv: 85,
      assetQualifierMethods: ["Assets Only", "60-month Asset Allowance"], sourceDocuments: [SOURCES.fundLoansMontage, SOURCES.fundLoansPortfolio],
      notes: "Distinct asset methods are preserved: Assets Only may be the qualifying source, while the 60-month Asset Allowance supplements documented income. Current Montage matrix controls exact leverage." },
  },
  {
    lender: "FundLoans", name: "Spectrum — Standard DSCR (>=1.00)", aliases: ["Spectrum DSCR"], source: `${SOURCES.fundLoansSpectrum} | ${SOURCES.fundLoansPortfolio}`,
    version: "FundLoans Spectrum Matrix v1.3 / Portfolio Guidelines v1.4 — 2026-08-01", effectiveDate: "2026-08-01",
    config: { ...baseDscr, minDscr: 1, minLoanAmount: 150_000, maxLoanAmount: 6_000_000, minFico: 660, baseMaxLtv: 80,
      eligibilityLtvMatrix: matrixRows(fundLoansSpectrumStandard, { minDscr: 1 }), firstTimeInvestorAllowed: true, firstTimeHomebuyerAllowed: false,
      propertyTypeLtvCaps: { condo: 75, non_warrantable_condo: 75, condotel: 75 }, strIncomeEligible: true,
      strIncomeNotes: "Existing 12-month STR history or eligible appraisal/1007 method; STR maximum loan $2M and DSCR >1.00.",
      reserveRules: [{ months: 6 }, { months: 12, firstTimeInvestor: true }], sourceDocuments: [SOURCES.fundLoansSpectrum, SOURCES.fundLoansPortfolio],
      notes: "Spectrum investment-only DSCR. Exact loan-amount/FICO tiers preserved through $4M; $4M-$6M is case-by-case and is not represented as automatic eligibility. First-time investors require >=700 FICO, >1.00 DSCR, <$2M, 5-point LTV reduction, no gifts, and 12 months reserves." },
  },
  {
    lender: "FundLoans", name: "Spectrum — Low DSCR (0.75-0.99)", aliases: [], source: `${SOURCES.fundLoansSpectrum} | ${SOURCES.fundLoansPortfolio}`,
    version: "FundLoans Spectrum Matrix v1.3 / Portfolio Guidelines v1.4 — 2026-08-01", effectiveDate: "2026-08-01",
    config: { ...baseDscr, minDscr: .75, minLoanAmount: 150_000, maxLoanAmount: 2_000_000, minFico: 660, baseMaxLtv: 75,
      eligibilityLtvMatrix: matrixRows(fundLoansSpectrumLow, { minDscr: .75, maxDscrExclusive: 1 }), firstTimeInvestorAllowed: false,
      reserveRules: [{ months: 6 }], sourceDocuments: [SOURCES.fundLoansSpectrum, SOURCES.fundLoansPortfolio],
      notes: "Separate >=0.75 and <1.00 grid. First-time-investor and STR overlays require >1.00 and therefore do not qualify under this low-DSCR tier." },
  },
  {
    lender: "FundLoans", name: "Spectrum — No Ratio", aliases: [], source: `${SOURCES.fundLoansSpectrum} | ${SOURCES.fundLoansPortfolio}`,
    version: "FundLoans Spectrum Matrix v1.3 / Portfolio Guidelines v1.4 — 2026-08-01", effectiveDate: "2026-08-01",
    config: { ...baseDscr, minDscr: 0, minLoanAmount: 150_000, maxLoanAmount: 2_000_000, minFico: 660, baseMaxLtv: 75,
      eligibilityLtvMatrix: matrixRows(fundLoansSpectrumNoRatio), experiencedInvestorRequired: true, firstTimeInvestorAllowed: false,
      strIncomeEligible: false, sourceDocuments: [SOURCES.fundLoansSpectrum, SOURCES.fundLoansPortfolio],
      documentationRequirements: ["Seven years without housing credit events", "0x30x24 on personally-held real estate"],
      notes: "No Ratio is preserved as a separate product tier. Foreign nationals and STR are not allowed. Requires seven years without housing credit events and 0x30x24 on personally-held real estate." },
  },
  {
    lender: "FundLoans", name: "Spectrum — Foreign National DSCR", aliases: [], source: `${SOURCES.fundLoansSpectrum} | ${SOURCES.fundLoansPortfolio}`,
    version: "FundLoans Spectrum Matrix v1.3 / Portfolio Guidelines v1.4 — 2026-08-01", effectiveDate: "2026-08-01",
    config: { ...baseDscr, minDscr: 1, citizenshipEligible: ["foreign_national"], minFico: 0, noFicoPolicy: "eligible_with_alternative_credit",
      maxLoanAmount: 1_500_000, baseMaxLtv: 65, foreignNationalDscrEligible: true, foreignNationalSpecialist: true,
      eligibilityLtvMatrix: [
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: 1, loanPurpose: "purchase", maxLtv: 65 },
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: 1, loanPurpose: "rate_term_refinance", maxLtv: 65 },
        { maxLoanAmount: 1_500_000, citizenship: "foreign_national", minDscr: 1, loanPurpose: "cash_out_refinance", maxLtv: 60 },
      ], reserveRules: [{ months: 12 }], strIncomeEligible: false, sourceDocuments: [SOURCES.fundLoansSpectrum, SOURCES.fundLoansPortfolio],
      notes: "Foreign-national Spectrum DSCR requires >=1.00 DSCR, max $1.5M, 65% purchase/rate-term and 60% cash-out. No-FICO uses the documented foreign-national credit path. STR and no-ratio are ineligible; 12 months subject reserves plus additional-property reserves apply." },
  },
  {
    lender: "FundLoans", name: "Arete — Full Doc / Alt Doc", aliases: ["Arete — Full Doc / Alt Doc / DSCR"], source: `${SOURCES.fundLoansArete} | https://guidelines.fundloans.com/arete`,
    version: "FundLoans Arete Matrix v1.1 — 2026-07-15", effectiveDate: "2026-07-15",
    config: { ...baseAltDoc, incomeDocTypes: ["full_doc", "bank_statement"], bankStatementMonthsEligible: [12], bankStatementAccountTypes: ["personal", "business"],
      minLoanAmount: 300_000, maxLoanAmount: 3_000_000, minFico: 660, baseMaxLtv: 90, maxDti: 50,
      citizenshipEligible: [...domestic, "foreign_national"], citizenshipLtvCaps: { non_permanent_resident: 80, foreign_national: 75 },
      sourceDocuments: [SOURCES.fundLoansArete, "https://guidelines.fundloans.com/arete"], notes: "Arete is a subset of the Portfolio guidelines. Its 12-month Bank Statement option follows Apex one-year methodology; current Arete matrix and conflicting Arete-specific provisions control." },
  },
  {
    lender: "FundLoans", name: "Arete — DSCR", aliases: [], source: `${SOURCES.fundLoansArete} | https://guidelines.fundloans.com/arete`,
    version: "FundLoans Arete Matrix v1.1 — 2026-07-15", effectiveDate: "2026-07-15",
    config: { ...baseDscr, minDscr: 0, minLoanAmount: 200_000, maxLoanAmount: 2_000_000, minFico: 660, baseMaxLtv: 80,
      citizenshipEligible: [...domestic, "foreign_national"], citizenshipLtvCaps: { non_permanent_resident: 75, foreign_national: 75 },
      foreignNationalDscrEligible: true, firstTimeInvestorAllowed: true, strIncomeEligible: true, strIncomeMaxLtv: 75,
      sourceDocuments: [SOURCES.fundLoansArete, "https://guidelines.fundloans.com/arete"], notes: "Arete DSCR preserves >=1.00 and below-1.00 eligibility under its current matrix and Arete-specific overlays. First-time investor and foreign-national restrictions must be evaluated against the current matrix." },
  },
  {
    lender: "FundLoans", name: "Aspire — Standalone Second (Full/Alt Doc)", aliases: ["Aspire — Standalone Second Mortgage"], source: `${SOURCES.fundLoansAspire} | https://guidelines.fundloans.com/aspire`,
    version: "FundLoans Aspire Matrix v4.1 — 2026-06-05", effectiveDate: "2026-06-05",
    config: { ...baseAltDoc, incomeDocTypes: ["full_doc", "bank_statement", "pnl_only", "asset_depletion"], loanPurposes: ["second_lien"],
      lienPosition: "standalone_second", ltvMetric: "cltv", minLoanAmount: 125_000, maxLoanAmount: 1_000_000, minFico: 660, baseMaxLtv: 85, maxDti: 50,
      bankStatementMonthsEligible: [12], bankStatementAccountTypes: ["personal", "business"], incomeDocTypeLtvCaps: { pnl_only: { second_lien: 85 } },
      sourceDocuments: [SOURCES.fundLoansAspire, "https://guidelines.fundloans.com/aspire"], notes: "Closed-end standalone second/HELOAN. Full Doc follows Montage; 12-month Bank Statement follows Apex; P&L has 45% max DTI. This must never match a first-lien cash-out request." },
  },
  {
    lender: "FundLoans", name: "Aspire X — Standalone Second (Expanded Doc)", aliases: ["Aspire X — Standalone Second Mortgage"], source: `${SOURCES.fundLoansAspireX} | https://guidelines.fundloans.com/aspire-x`,
    version: "FundLoans Aspire X Matrix v4.0 — 2026-04-14", effectiveDate: "2026-04-14",
    config: { ...baseAltDoc, incomeDocTypes: ["full_doc", "bank_statement", "pnl_only", "asset_depletion", "1099", "wvoe_only", "dscr"], loanPurposes: ["second_lien"],
      lienPosition: "standalone_second", ltvMetric: "cltv", minLoanAmount: 125_000, maxLoanAmount: 850_000, minFico: 660, baseMaxLtv: 85, maxDti: 45,
      bankStatementMonthsEligible: [12, 24], bankStatementAccountTypes: ["personal", "business"], sourceDocuments: [SOURCES.fundLoansAspireX, "https://guidelines.fundloans.com/aspire-x"],
      notes: "High-CLTV standalone second with expanded full doc, 12/24 bank statement, P&L, 1099, WVOE, asset depletion, and DSCR options. Exact CLTV/FICO/loan-amount intersection is governed by the current Aspire X matrix." },
  },
];

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) {
    for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, "");
    }
  }
  return env;
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function resolveAdmin(admin) {
  const { data, error } = await admin.from("users").select("id,email").eq("email", "nonqmnexusadmin@gmail.com").maybeSingle();
  if (error || !data) throw new Error(`Unable to resolve platform admin: ${error?.message ?? "not found"}`);
  return data.id;
}

async function resolveLenders(admin, adminId) {
  const { data, error } = await admin.from("lenders").select("id,name,tier_level,notes").eq("organization_id", PLATFORM_ORG).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const wanted = [
    { canonical: "AmWest Funding Corp.", aliases: ["amwest", "amwestfunding", "amwestfundingcorp"] },
    { canonical: "PennyMac", aliases: ["pennymac", "pennymaccorrespondent", "pennymacloanservices"] },
    { canonical: "ClearEdge Lending", aliases: ["clearedge", "clearedgelending"] },
    { canonical: "FundLoans", aliases: ["fundloans", "fundloanscapital"] },
  ];
  const result = new Map();
  for (const target of wanted) {
    const matches = (data ?? []).filter((row) => target.aliases.includes(normalizeName(row.name)) || normalizeName(row.name).includes(normalizeName(target.canonical)));
    let lender = matches[0];
    if (!lender) {
      const { data: created, error: createError } = await admin.from("lenders").insert({ organization_id: PLATFORM_ORG, name: target.canonical, is_sample_data: false, active: true, tier_level: 2, created_by: adminId, notes: "Official guideline data maintained by Non-QM Nexus." }).select("id,name,tier_level,notes").single();
      if (createError) throw new Error(`Create ${target.canonical}: ${createError.message}`);
      lender = created;
    }
    if (matches.length > 1) throw new Error(`Duplicate lender records detected for ${target.canonical}: ${matches.map((m) => `${m.name} (${m.id})`).join(", ")}`);
    await admin.from("lenders").update({ name: target.canonical, active: true }).eq("id", lender.id);
    result.set(target.canonical, lender.id);
  }
  return result;
}

async function upsertProgram(admin, adminId, lenderId, p) {
  const { data: current, error: readError } = await admin.from("programs").select("id,name,config,version").eq("lender_id", lenderId).is("deleted_at", null);
  if (readError) throw new Error(readError.message);
  const names = [p.name, ...(p.aliases ?? [])].map(normalizeName);
  const matches = (current ?? []).filter((row) => names.includes(normalizeName(row.name)));
  const config = {
    ...p.config,
    active: true,
    lenderId,
    isSampleData: false,
    guidelineVersionLabel: p.version,
    effectiveDate: p.effectiveDate,
    lastVerifiedDate: VERIFIED_ON,
    sourceCitation: `${p.version} — ${p.source}`,
  };
  let programId;
  if (matches.length) {
    const keeper = matches[0];
    programId = keeper.id;
    const { error } = await admin.from("programs").update({ name: p.name, active: true, is_sample_data: false, config, version: (keeper.version ?? 0) + 1 }).eq("id", programId);
    if (error) throw new Error(`Update ${p.name}: ${error.message}`);
    for (const duplicate of matches.slice(1)) {
      await admin.from("programs").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", duplicate.id);
    }
  } else {
    const { data: created, error } = await admin.from("programs").insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: p.name, is_sample_data: false, active: true, config, created_by: adminId }).select("id").single();
    if (error) throw new Error(`Insert ${p.name}: ${error.message}`);
    programId = created.id;
  }

  await admin.from("guideline_versions").update({ verification_status: "superseded" }).eq("program_id", programId).neq("label", p.version).eq("verification_status", "human_verified");
  const { data: existingVersion } = await admin.from("guideline_versions").select("id").eq("program_id", programId).eq("label", p.version).maybeSingle();
  const versionRow = {
    organization_id: PLATFORM_ORG, program_id: programId, label: p.version, effective_date: p.effectiveDate,
    last_verified_date: VERIFIED_ON, verification_status: "human_verified", reviewed_by: adminId,
    published_at: new Date().toISOString(), source_url: p.source.split(" | ")[0], last_checked_at: new Date().toISOString(), change_detected: false,
  };
  const { error: versionError } = existingVersion
    ? await admin.from("guideline_versions").update(versionRow).eq("id", existingVersion.id)
    : await admin.from("guideline_versions").insert(versionRow);
  if (versionError) throw new Error(`Guideline version ${p.name}: ${versionError.message}`);
  return programId;
}

async function archiveSupersededGenericPrograms(admin, lenderIds) {
  const staleByLender = new Map([
    ["FundLoans", ["Bank Statement / P&L", "Assets Only", "WVOE"]],
  ]);
  for (const [lenderName, names] of staleByLender) {
    const lenderId = lenderIds.get(lenderName);
    if (!lenderId) continue;
    const { data, error } = await admin.from("programs").select("id,name").eq("lender_id", lenderId).in("name", names).is("deleted_at", null);
    if (error) throw new Error(`Read superseded ${lenderName} programs: ${error.message}`);
    for (const stale of data ?? []) {
      const { error: archiveError } = await admin.from("programs").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", stale.id);
      if (archiveError) throw new Error(`Archive ${lenderName} ${stale.name}: ${archiveError.message}`);
      console.log(`[four-lender-ingest] archived superseded generic row: ${lenderName} — ${stale.name}`);
    }
  }
}

export async function runIngestion() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_URL === "[SENSITIVE]") {
    console.log("[four-lender-ingest] skipped: protected Supabase credentials are unavailable");
    return { skipped: true, programs: 0 };
  }
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminId = await resolveAdmin(admin);
  const lenderIds = await resolveLenders(admin, adminId);
  let count = 0;
  for (const p of PROGRAMS) {
    const lenderId = lenderIds.get(p.lender);
    if (!lenderId) throw new Error(`Missing lender ${p.lender}`);
    await upsertProgram(admin, adminId, lenderId, p);
    count += 1;
    console.log(`[four-lender-ingest] ${p.lender}: ${p.name}`);
  }
  await archiveSupersededGenericPrograms(admin, lenderIds);
  console.log(`[four-lender-ingest] complete: ${count} program records`);
  return { skipped: false, programs: count };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runIngestion().catch((error) => {
    console.error("[four-lender-ingest] fatal", error);
    process.exit(1);
  });
}
