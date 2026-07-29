/**
 * Domain enums shared across the calculation engine, rules engine, and UI.
 * These are stable identifiers used inside rules; changing a value is a
 * breaking change to stored program rules and must be migrated.
 */

export const LoanPurpose = {
  Purchase: "purchase",
  RateAndTermRefinance: "rate_term_refinance",
  CashOutRefinance: "cash_out_refinance",
} as const;
export type LoanPurpose = (typeof LoanPurpose)[keyof typeof LoanPurpose];

export const Occupancy = {
  Primary: "primary",
  SecondHome: "second_home",
  Investment: "investment",
} as const;
export type Occupancy = (typeof Occupancy)[keyof typeof Occupancy];

export const PropertyType = {
  SingleFamily: "single_family",
  Condo: "condo",
  NonWarrantableCondo: "non_warrantable_condo",
  Townhome: "townhome",
  TwoToFourUnit: "2_4_unit",
  FivePlusUnit: "5_plus_unit",
  Pud: "pud",
  Manufactured: "manufactured",
  Rural: "rural",
  Condotel: "condotel",
} as const;
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];

export const IncomeDocType = {
  FullDoc: "full_doc",
  BankStatement: "bank_statement",
  ProfitAndLoss: "pnl_only",
  Dscr: "dscr",
  AssetDepletion: "asset_depletion",
  Income1099: "1099",
  WvoeOnly: "wvoe_only",
} as const;
export type IncomeDocType = (typeof IncomeDocType)[keyof typeof IncomeDocType];

export const Citizenship = {
  UsCitizen: "us_citizen",
  PermanentResident: "permanent_resident",
  NonPermanentResident: "non_permanent_resident",
  Itin: "itin",
  ForeignNational: "foreign_national",
} as const;
export type Citizenship = (typeof Citizenship)[keyof typeof Citizenship];

/**
 * Lien position — added 2026-07-29 after a real bug: a "second lien" /
 * "standalone second mortgage" / "HELOAN" voice request was matching
 * against every ordinary FIRST-LIEN cash-out-refinance-eligible program in
 * the catalog, because loanPurpose (purchase / rate-term / cash-out) has
 * no dimension for lien POSITION at all — a standalone second mortgage is
 * a fundamentally different product (a subordinate lien behind an
 * unchanged first mortgage) from a cash-out refinance of the first lien
 * itself, even though both are colloquially "getting cash out."
 * undefined/FirstLien is the default for every ordinary program (no
 * migration needed for the vast majority of the catalog); only the
 * handful of REAL standalone-second products (FundLoans Aspire/Aspire X,
 * GreenBox CES, Verus Closed End Second, etc.) are tagged StandaloneSecond.
 * See baseChecks.ts's hard lien-position check.
 */
export const LienPosition = {
  FirstLien: "first_lien",
  StandaloneSecond: "standalone_second",
} as const;
export type LienPosition = (typeof LienPosition)[keyof typeof LienPosition];

/**
 * Credit-profile Vital — added 2026-07-28 (F-1 visa / no-FICO fix). Real
 * Non-QM scenarios routinely have NO numeric U.S. FICO at all (a foreign
 * national or a recently-arrived F-1 visa holder who has simply never
 * established U.S. credit) — that is a legitimate, resolvable answer, not
 * missing data. `UsFicoScore` is the ordinary numeric case (the actual
 * number is carried separately in Scenario.fico / VoiceExtraction.fico);
 * every OTHER value here is a valid NONNUMERIC credit-profile status the
 * Vital can resolve to instead of a number. See classifyCreditProfile in
 * src/domain/voice/extract.ts and hasValidCreditProfile in
 * src/domain/validation/scenarioSchema.ts.
 */
export const CreditProfileType = {
  UsFicoScore: "us_fico_score",
  NoFico: "no_fico",
  NoUsCredit: "no_us_credit",
  ForeignCredit: "foreign_credit",
  InsufficientCreditHistory: "insufficient_credit_history",
  Unknown: "unknown",
} as const;
export type CreditProfileType = (typeof CreditProfileType)[keyof typeof CreditProfileType];

/** Display labels matching the Vital Section wording in the spec. */
export const CREDIT_PROFILE_TYPE_LABELS: Record<CreditProfileType, string> = {
  us_fico_score: "U.S. FICO Score",
  no_fico: "No FICO",
  no_us_credit: "No U.S. Credit",
  foreign_credit: "Foreign Credit Report",
  insufficient_credit_history: "Insufficient Credit History",
  unknown: "Unknown",
};

/** Nonnumeric credit-profile values that satisfy the credit-profile Vital
 * WITHOUT a numeric FICO score (see hasValidCreditProfile). */
export const NONNUMERIC_CREDIT_PROFILE_TYPES = [
  CreditProfileType.NoFico,
  CreditProfileType.NoUsCredit,
  CreditProfileType.ForeignCredit,
  CreditProfileType.InsufficientCreditHistory,
  CreditProfileType.Unknown,
] as const;

export const Vesting = {
  Individual: "individual",
  JointTenants: "joint_tenants",
  Llc: "llc",
  Corporation: "corporation",
  Trust: "trust",
} as const;
export type Vesting = (typeof Vesting)[keyof typeof Vesting];

/** Distinguishes first-time vs. experienced investors — separate from
 * firstTimeHomebuyer, which tracks primary-residence ownership history.
 * A borrower can be any combination of the two (see docs/voice-vitals.md). */
export const InvestorExperience = {
  FirstTimeInvestor: "first_time_investor",
  ExperiencedInvestor: "experienced_investor",
  NotApplicable: "not_applicable",
} as const;
export type InvestorExperience = (typeof InvestorExperience)[keyof typeof InvestorExperience];

/** Result of an individual rule evaluation. */
export const RuleOutcome = {
  Pass: "pass",
  Fail: "fail",
  Warning: "warning",
  ManualReview: "manual_review",
  NotApplicable: "not_applicable",
} as const;
export type RuleOutcome = (typeof RuleOutcome)[keyof typeof RuleOutcome];

/** Severity attached to a rule; drives how a failing/warning rule is surfaced. */
export const RuleSeverity = {
  Hard: "hard", // a fail here makes the program ineligible
  Soft: "soft", // a fail here downgrades to conditional / warning
  Info: "info",
} as const;
export type RuleSeverity = (typeof RuleSeverity)[keyof typeof RuleSeverity];

/** Overall classification of a program for a scenario. */
export const MatchStatus = {
  StrongMatch: "strong_match",
  Eligible: "eligible",
  Conditional: "conditional",
  EligibleWithRestructuring: "eligible_with_restructuring",
  ManualReview: "manual_review",
  Ineligible: "ineligible",
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

/** Guideline / rule verification lifecycle. AI-extracted rules never auto-activate. */
export const VerificationStatus = {
  HumanVerified: "human_verified",
  ImportedPendingReview: "imported_pending_review",
  AiExtractedPendingReview: "ai_extracted_pending_review",
  Draft: "draft",
  Archived: "archived",
  Superseded: "superseded",
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const UserRole = {
  Broker: "broker",
  AccountExecutive: "account_executive",
  Processor: "processor",
  Underwriter: "underwriter",
  OrgAdmin: "org_admin",
  PlatformAdmin: "platform_admin",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const DISCLAIMER =
  "Preliminary scenario analysis only. Final eligibility, pricing, underwriting, documentation, and approval are subject to lender review and the guidelines in effect at the time of submission. This result is not a loan approval, commitment to lend, or guarantee of eligibility.";

export const SAMPLE_DATA_LABEL = "Demonstration program—not a real lender guideline.";
