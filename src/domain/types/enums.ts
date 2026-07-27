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
