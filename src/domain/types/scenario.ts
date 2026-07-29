import type {
  Citizenship,
  CreditProfileType,
  IncomeDocType,
  InvestorExperience,
  LoanPurpose,
  Occupancy,
  PropertyType,
  Vesting,
} from "./enums";

/**
 * Structured, normalized scenario used by the calculation and rules engines.
 * This is the deterministic input surface. The UI questionnaire collects a
 * superset; the intake mapper produces this shape. Every field is optional
 * except identity because scenarios can be saved as drafts.
 */

export interface BankStatementDetails {
  personalOrBusiness: "personal" | "business";
  months: 12 | 24;
  businessType?: string;
  ownershipPercent?: number; // 0-100
  businessStartDate?: string; // ISO date
  averageMonthlyEligibleDeposits?: number;
  expenseFactorPercent?: number; // 0-100; e.g. 30 means 30% expense factor
  expenseFactorSource?: "cpa" | "ea" | "tax_professional" | "fixed" | "unknown";
  hasCashDeposits?: boolean;
  hasAtmDeposits?: boolean;
  hasTransfers?: boolean;
  hasRefundsOrReversals?: boolean;
  depositsDeclining?: boolean;
  hasLargeUnusualDeposits?: boolean;
  combiningMultipleAccounts?: boolean;
  hasComingling?: boolean;
}

export interface PnlDetails {
  periodMonths: number; // e.g. 12 or 24
  grossRevenue?: number;
  expenseAmount?: number;
  netIncome?: number;
  ownershipPercent?: number; // 0-100
  preparer?: "cpa" | "ea" | "tax_professional" | "borrower";
  supportingBankStatements?: boolean;
  bankDepositVariancePercent?: number; // variance between P&L revenue and deposits
  businessNarrative?: string;
  obviousExpensesMissing?: boolean;
}

export interface DscrDetails {
  monthlyLease?: number;
  marketRent?: number;
  annualTaxes?: number;
  annualHazardInsurance?: number;
  annualFloodInsurance?: number;
  monthlyHoa?: number;
  interestOnlyPayment?: number;
  principalAndInterest?: number; // full PITIA P&I component
  shortTermRental?: boolean;
  firstTimeInvestor?: boolean;
  financedProperties?: number;
}

export interface AssetDepletionDetails {
  checkingSavings?: number;
  brokerage?: number;
  stocksBonds?: number;
  retirement?: number;
  borrowerAge?: number;
  retirementVestedPercent?: number; // 0-100
  realEstateEquity?: number;
  eligibleAssetPercent?: number; // 0-100 haircut applied to non-retirement
  requiredDownPayment?: number;
  closingCosts?: number;
  requiredReserves?: number;
  assetDivisorMonths?: number; // e.g. 60, 84, 120, 240
  assetsAlsoUsedToClose?: boolean;
}

export interface ForeignNationalDetails {
  countryOfCitizenship?: string;
  usCreditAvailable?: boolean;
  foreignCreditAvailable?: boolean;
  visaType?: string;
  hasItin?: boolean;
  hasValidPassport?: boolean;
  hasUsBankAccount?: boolean;
  hasForeignBankAccounts?: boolean;
  usPropertyOwnership?: boolean;
  sourceOfFunds?: string;
  translationRequired?: boolean;
  ofacScreeningStatus?: "not_started" | "clear" | "flagged";
}

export interface CreditEvents {
  bankruptcyMonthsSinceDischarge?: number | null;
  foreclosureMonthsSince?: number | null;
  shortSaleMonthsSince?: number | null;
  // Mortgage lates over the last 12 / 24 months, e.g. "0x30x12" style counts.
  mortgageLates30x12?: number;
  mortgageLates60x12?: number;
  mortgageLates90x12?: number;
  housingHistoryMonths?: number; // documented months of housing history
}

export interface Scenario {
  id: string;
  organizationId: string;
  name: string;
  createdByUserId: string;
  brokerId?: string;
  borrowerReference?: string; // anonymized identifier — never store full SSN here

  // Loan
  loanPurpose?: LoanPurpose;
  occupancy?: Occupancy;
  propertyType?: PropertyType;
  units?: number;
  state?: string; // 2-letter
  county?: string;
  purchasePrice?: number;
  estimatedValue?: number;
  requestedLoanAmount?: number;
  requestedCashOut?: number;
  /** Retained SUBORDINATE financing that stays on title after closing
   * (e.g. a HELOC kept in place during a first-lien refinance/purchase) —
   * feeds calc/ltv.ts's CLTV as an additional lien. NOT the balance being
   * paid off by a refinance — see currentLoanBalance below, a distinct
   * field on purpose: conflating the two would silently inflate CLTV by
   * counting a lien that the new loan actually retires. */
  existingLienBalance?: number;
  /** Refinance-only: what the borrower currently owes on the subject
   * property, being paid off by the new requested loan. Drives the
   * current-lien-to-value / equity / cash-out figures (see
   * src/domain/voice/dialog.ts's refinanceCalc) — deliberately NOT fed
   * into CLTV (that would double-count a lien the refinance retires). */
  currentLoanBalance?: number;

  // Borrower
  /** Numeric U.S. FICO score — populated ONLY for the numeric case. A
   * borrower legitimately without a U.S. credit score (e.g. an F-1 visa
   * holder who never established U.S. credit) leaves this undefined/null
   * while `creditProfileType` carries the nonnumeric status instead; that
   * is a VALID, resolved credit-profile Vital, not missing data. */
  fico?: number;
  /** Credit-profile Vital — always resolves the credit-profile Vital
   * together with `fico`: `us_fico_score` when a number is present, or one
   * of the nonnumeric statuses (No FICO, No U.S. Credit, Foreign Credit,
   * Insufficient Credit History, Unknown) when it legitimately isn't.
   * See CreditProfileType in src/domain/types/enums.ts. */
  creditProfileType?: CreditProfileType;
  citizenship?: Citizenship;
  /** The borrower's stated visa/immigration category as spoken (e.g.
   * "F-1", "H-1B", "EAD"), preserved SEPARATELY from `citizenship` so
   * lender matching can search guidelines for both general
   * citizenship-classification eligibility AND any lender-specific visa
   * restriction (e.g. an F-1-specific overlay distinct from the general
   * Foreign National rule). Never discarded once citizenship is resolved. */
  visaType?: string;
  vesting?: Vesting;
  firstTimeHomebuyer?: boolean;
  firstTimeInvestor?: boolean;
  /** Richer investor-experience signal than firstTimeInvestor — captures
   * "experienced investor" explicitly too, not just the first-time case.
   * Voice/manual intake populate both fields for backward compatibility;
   * matching prefers this one when present (src/domain/matching/baseChecks.ts). */
  investorExperience?: InvestorExperience;
  employmentStatus?: "self_employed" | "wage_earner" | "retired" | "other";
  selfEmploymentMonths?: number;
  businessOwnershipPercent?: number;
  incomeDocType?: IncomeDocType;
  /** Documented monthly income for full-doc / 1099 / WVOE methods. */
  documentedMonthlyIncome?: number;

  // Ratios / obligations
  monthlyHousingPayment?: number; // subject-property proposed PITIA
  monthlyLiabilities?: number; // non-housing monthly debts

  // Assets
  liquidAssets?: number;
  retirementAssets?: number;
  otherEligibleAssets?: number;
  reserveAmountMonthsRequested?: number;

  // Options
  interestOnlyRequested?: boolean;
  prepaymentPenaltyAccepted?: boolean;
  desiredClosingDate?: string;
  notes?: string;

  // Credit history
  creditEvents?: CreditEvents;

  // Income-method specific detail (only the relevant one is populated)
  bankStatement?: BankStatementDetails;
  pnl?: PnlDetails;
  dscr?: DscrDetails;
  assetDepletion?: AssetDepletionDetails;
  foreignNational?: ForeignNationalDetails;

  createdAt: string;
  updatedAt: string;
}
