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
});

export const scenarioInputSchema = z.object({
  name: z.string().min(1).max(200),
  borrowerReference: z.string().max(120).optional(),
  loanPurpose: z.enum(["purchase", "rate_term_refinance", "cash_out_refinance"]).optional(),
  occupancy: z.enum(["primary", "second_home", "investment"]).optional(),
  propertyType: z
    .enum(["single_family", "condo", "non_warrantable_condo", "townhome", "2_4_unit", "5_plus_unit", "pud", "manufactured", "rural"])
    .optional(),
  units: z.number().int().min(1).max(20).optional(),
  state: z.string().length(2).optional(),
  county: z.string().max(100).optional(),
  purchasePrice: optionalUsd,
  estimatedValue: optionalUsd,
  requestedLoanAmount: optionalUsd,
  requestedCashOut: optionalUsd,
  existingLienBalance: optionalUsd,
  fico: z.number().int().min(300).max(850).optional(),
  citizenship: z.enum(["us_citizen", "permanent_resident", "non_permanent_resident", "itin", "foreign_national"]).optional(),
  vesting: z.enum(["individual", "joint_tenants", "llc", "corporation", "trust"]).optional(),
  firstTimeHomebuyer: z.boolean().optional(),
  firstTimeInvestor: z.boolean().optional(),
  employmentStatus: z.enum(["self_employed", "wage_earner", "retired", "other"]).optional(),
  selfEmploymentMonths: z.number().int().min(0).max(720).optional(),
  businessOwnershipPercent: optionalPercent,
  incomeDocType: z.enum(["full_doc", "bank_statement", "pnl_only", "dscr", "asset_depletion", "1099", "wvoe_only"]).optional(),
  documentedMonthlyIncome: optionalUsd,
  monthlyHousingPayment: optionalUsd,
  monthlyLiabilities: optionalUsd,
  liquidAssets: optionalUsd,
  retirementAssets: optionalUsd,
  otherEligibleAssets: optionalUsd,
  reserveAmountMonthsRequested: z.number().min(0).max(120).optional(),
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
});

export type ScenarioInput = z.infer<typeof scenarioInputSchema>;
