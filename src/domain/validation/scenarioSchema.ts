import { z } from "zod";

/**
 * Shared server-side validation for scenario input. The UI uses the same
 * schema so client and server always agree. All monetary fields are
 * non-negative; percents are 0-100.
 */

const usd = z.number().nonnegative().finite();
const percent = z.number().min(0).max(100);
const optionalUsd = usd.optional();
const optionalPercent = percent.optional();
/** Tri-state used by several optional secondary vitals (gift funds, DSCR
 * short-term-rental income, one-year self-employment) — see YesNoUnknown
 * in enums.ts. */
const yesNoUnknown = z.enum(["yes", "no", "unknown"]).optional();

export const bankStatementSchema = z.object({
  personalOrBusiness: z.enum(["personal", "business"]),
  months: z.union([z.literal(12), z.literal(24)]),
  businessType: z.string().max(200).optional(),
  ownershipPercent: optionalPercent,
  businessStartDate: z.string().optional(),
  averageMonthlyEligibleDeposits: optionalUsd,
  expenseFactorPercent: optionalPercent,
  expenseFactorSource: z.enum(["cpa", "ea", "tax_professional", "fixed", "unknown"]).optional(),
  hasCashDeposits: z.boolean().optional(),
  hasAtmDeposits: z.boolean().optional(),
  hasTransfers: z.boolean().optional(),
  hasRefundsOrReversals: z.boolean().optional(),
  depositsDeclining: z.boolean().optional(),
  hasLargeUnusualDeposits: z.boolean().optional(),
  combiningMultipleAccounts: z.boolean().optional(),
  hasComingling: z.boolean().optional(),
});

export const pnlSchema = z.object({
  periodMonths: z.number().int().min(1).max(36),
  grossRevenue: optionalUsd,
  expenseAmount: optionalUsd,
  netIncome: z.number().finite().optional(),
  ownershipPercent: optionalPercent,
  preparer: z.enum(["cpa", "ea", "tax_professional", "borrower"]).optional(),
  supportingBankStatements: z.boolean().optional(),
  bankDepositVariancePercent: z.number().min(-100).max(1000).optional(),
  businessNarrative: z.string().max(2000).optional(),
  obviousExpensesMissing: z.boolean().optional(),
});

export const dscrSchema = z.object({
  monthlyLease: optionalUsd,
  marketRent: optionalUsd,
  annualTaxes: optionalUsd,
  annualHazardInsurance: optionalUsd,
  annualFloodInsurance: optionalUsd,
  monthlyHoa: optionalUsd,
  interestOnlyPayment: optionalUsd,
  principalAndInterest: optionalUsd,
  shortTermRental: z.boolean().optional(),
  /** Tri-state secondary-vital sibling of shortTermRental above — see
   * Scenario.dscr.strIncomeUsed in scenario.ts. */
  strIncomeUsed: yesNoUnknown,
  firstTimeInvestor: z.boolean().optional(),
  financedProperties: z.number().int().min(0).max(100).optional(),
});

export const assetDepletionSchema = z.object({
  checkingSavings: optionalUsd,
  brokerage: optionalUsd,
  stocksBonds: optionalUsd,
  retirement: optionalUsd,
  borrowerAge: z.number().min(18).max(120).optional(),
  retirementVestedPercent: optionalPercent,
  realEstateEquity: optionalUsd,
  eligibleAssetPercent: optionalPercent,
  requiredDownPayment: optionalUsd,
  closingCosts: optionalUsd,
  requiredReserves: optionalUsd,
  assetDivisorMonths: z.number().int().min(1).max(480).optional(),
  assetsAlsoUsedToClose: z.boolean().optional(),
});

export const foreignNationalSchema = z.object({
  countryOfCitizenship: z.string().max(100).optional(),
  usCreditAvailable: z.boolean().optional(),
  foreignCreditAvailable: z.boolean().optional(),
  visaType: z.string().max(20).optional(),
  hasItin: z.boolean().optional(),
  hasValidPassport: z.boolean().optional(),
  hasUsBankAccount: z.boolean().optional(),
  hasForeignBankAccounts: z.boolean().optional(),
  usPropertyOwnership: z.boolean().optional(),
  sourceOfFunds: z.string().max(500).optional(),
  translationRequired: z.boolean().optional(),
  ofacScreeningStatus: z.enum(["not_started", "clear", "flagged"]).optional(),
});

export const creditEventsSchema = z.object({
  bankruptcyMonthsSinceDischarge: z.number().int().min(0).max(600).nullable().optional(),
  foreclosureMonthsSince: z.number().int().min(0).max(600).nullable().optional(),
  shortSaleMonthsSince: z.number().int().min(0).max(600).nullable().optional(),
  mortgageLates30x12: z.number().int().min(0).max(12).optional(),
  mortgageLates60x12: z.number().int().min(0).max(12).optional(),
  mortgageLates90x12: z.number().int().min(0).max(12).optional(),
  housingHistoryMonths: z.number().int().min(0).max(600).optional(),
  /** Friendlier single-select category sibling of the numeric counts
   * above — see MortgageLatesCategory in enums.ts. */
  mortgageLatesCategory: z.enum(["none", "late_30", "late_60", "late_90", "multiple", "unknown"]).optional(),
});

export const scenarioInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    borrowerReference: z.string().max(120).optional(),
    loanPurpose: z.enum(["purchase", "rate_term_refinance", "cash_out_refinance", "heloc", "second_lien"]).optional(),
    occupancy: z.enum(["primary", "second_home", "investment"]).optional(),
    propertyType: z
      .enum(["single_family", "condo", "non_warrantable_condo", "townhome", "2_4_unit", "5_plus_unit", "pud", "manufactured", "rural", "condotel"])
      .optional(),
    units: z.number().int().min(1).max(20).optional(),
    state: z.string().length(2).optional(),
    county: z.string().max(100).optional(),
    purchasePrice: optionalUsd,
    estimatedValue: optionalUsd,
    requestedLoanAmount: optionalUsd,
    requestedCashOut: optionalUsd,
    existingLienBalance: optionalUsd,
    currentLoanBalance: optionalUsd,
    fico: z.number().int().min(300).max(850).optional(),
    /** Nonnumeric credit-profile status — resolves the credit-profile
     * Vital in place of `fico` when the borrower legitimately has no
     * numeric U.S. FICO (F-1 visa / no-FICO fix, 2026-07-28). A `fico`
     * present alongside `us_fico_score` (or omitted entirely) is the
     * ordinary case; any OTHER value here is valid with `fico` absent —
     * see hasValidCreditProfile below. */
    creditProfileType: z.enum(["us_fico_score", "no_fico", "no_us_credit", "foreign_credit", "insufficient_credit_history", "unknown"]).optional(),
    citizenship: z.enum(["us_citizen", "permanent_resident", "non_permanent_resident", "itin", "foreign_national"]).optional(),
    /** Stated visa/immigration category (e.g. "F-1"), preserved separately
     * from `citizenship` for lender-guideline visa-specific matching. */
    visaType: z.string().max(40).optional(),
    vesting: z.enum(["individual", "joint_tenants", "llc", "corporation", "trust"]).optional(),
    firstTimeHomebuyer: z.boolean().optional(),
    firstTimeInvestor: z.boolean().optional(),
    investorExperience: z.enum(["first_time_investor", "experienced_investor", "not_applicable"]).optional(),
    employmentStatus: z.enum(["self_employed", "wage_earner", "retired", "other"]).optional(),
    selfEmploymentMonths: z.number().int().min(0).max(720).optional(),
    /** Secondary vital — see Scenario.oneYearSelfEmployed in scenario.ts. */
    oneYearSelfEmployed: yesNoUnknown,
    businessOwnershipPercent: optionalPercent,
    incomeDocType: z.enum(["full_doc", "bank_statement", "pnl_only", "dscr", "asset_depletion", "1099", "wvoe_only"]).optional(),
    documentedMonthlyIncome: optionalUsd,
    monthlyHousingPayment: optionalUsd,
    monthlyLiabilities: optionalUsd,
    liquidAssets: optionalUsd,
    retirementAssets: optionalUsd,
    otherEligibleAssets: optionalUsd,
    reserveAmountMonthsRequested: z.number().min(0).max(120).optional(),
    /** Secondary vital — see Scenario.giftFundsUsed in scenario.ts. */
    giftFundsUsed: yesNoUnknown,
    interestOnlyRequested: z.boolean().optional(),
    prepaymentPenaltyAccepted: z.boolean().optional(),
    desiredClosingDate: z.string().optional(),
    notes: z.string().max(5000).optional(),
    creditEvents: creditEventsSchema.optional(),
    bankStatement: bankStatementSchema.optional(),
    pnl: pnlSchema.optional(),
    dscr: dscrSchema.optional(),
    assetDepletion: assetDepletionSchema.optional(),
    foreignNational: foreignNationalSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Cross-field check the per-field schema alone can't express: a
    // requested loan amount can never exceed the property's value —
    // reported against requestedLoanAmount so it highlights the field the
    // user would actually correct.
    const value = data.estimatedValue ?? data.purchasePrice;
    if (value !== undefined && data.requestedLoanAmount !== undefined && data.requestedLoanAmount > value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestedLoanAmount"],
        message: "The loan amount cannot exceed the property value.",
      });
    }
  });

export type ScenarioInput = z.infer<typeof scenarioInputSchema>;

/**
 * Corrected credit-profile validation (F-1 visa / no-FICO fix, 2026-07-28).
 * The credit-profile Vital is satisfied when EITHER a numeric FICO is
 * present OR a recognized nonnumeric credit-profile status was captured —
 * a null/absent `ficoScore` is a legitimate, resolved answer when
 * `creditProfileType` is one of the nonnumeric statuses, NOT a validation
 * failure. Never show "Please correct highlighted fields" for a
 * legitimately-captured no-FICO borrower.
 */
export const NONNUMERIC_CREDIT_PROFILE_TYPES = [
  "no_fico",
  "no_us_credit",
  "foreign_credit",
  "insufficient_credit_history",
  "unknown",
] as const;

export function hasValidCreditProfile(input: {
  fico?: number | null;
  creditProfileType?: string | null;
}): boolean {
  return (
    typeof input.fico === "number" ||
    (input.creditProfileType != null &&
      (NONNUMERIC_CREDIT_PROFILE_TYPES as readonly string[]).includes(input.creditProfileType))
  );
}

/** Plain-language label for each top-level scenario field a validation
 * issue might point at — used to build a specific message instead of the
 * generic "Please correct the highlighted fields." */
const FIELD_LABELS: Record<string, string> = {
  name: "scenario name",
  loanPurpose: "purchase, refinance, HELOC, or second lien",
  occupancy: "occupancy",
  propertyType: "property type",
  estimatedValue: "estimated property value",
  purchasePrice: "purchase price",
  requestedLoanAmount: "requested loan amount",
  requestedCashOut: "requested cash-out amount",
  existingLienBalance: "existing subordinate lien balance",
  currentLoanBalance: "current loan balance",
  fico: "credit score",
  creditProfileType: "credit profile",
  incomeDocType: "income documentation type",
  citizenship: "citizenship/residency status",
  visaType: "visa type",
  vesting: "title vesting",
};

/** Specific, plain-language guidance for the exact issue found — falls
 * back to "Please check the <field>." (never the generic blanket message)
 * when a field has no bespoke phrasing below. Only ever called with a
 * failed parse's issues, so there's always at least one. */
export function friendlyValidationMessage(issues: z.ZodIssue[]): string {
  const first = issues[0];
  if (!first) return "Please check the highlighted fields.";
  const field = first.path[0] ? String(first.path[0]) : undefined;
  const label = field ? (FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").toLowerCase()) : "scenario";

  // Bespoke phrasing for the cases the spec calls out explicitly.
  if (field === "requestedLoanAmount" && first.message === "The loan amount cannot exceed the property value.") {
    return first.message;
  }
  if (field === "fico") {
    return "The credit score must be between 300 and 850.";
  }
  if ((field === "estimatedValue" || field === "purchasePrice") && first.code === "invalid_type") {
    return "Please provide the estimated property value.";
  }
  if (field === "requestedLoanAmount" && first.code === "invalid_type") {
    return "Please provide the requested loan amount.";
  }
  if (field === "loanPurpose") {
    return "Please confirm whether this is a purchase, refinance, HELOC, or second lien.";
  }
  if (first.code === "invalid_type" || first.code === "invalid_enum_value") {
    return `Please provide the ${label}.`;
  }
  return `Please check the ${label} — ${first.message.toLowerCase()}`;
}
