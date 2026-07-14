import type {
  Citizenship,
  IncomeDocType,
  LoanPurpose,
  Occupancy,
  PropertyType,
  RuleOutcome,
  RuleSeverity,
  VerificationStatus,
  Vesting,
} from "./enums";

/** A configurable comparison operator supported by the rules engine. */
export type RuleOperator =
  | "equals"
  | "not_equals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "not_in"
  | "contains"
  | "exists"
  | "not_exists";

export type RuleValue = string | number | boolean | Array<string | number> | null;

/** A single leaf condition: evaluate `field` with `operator` against `value`. */
export interface RuleCondition {
  field: string; // dot-path into the evaluation context, e.g. "fico" or "calc.ltv"
  operator: RuleOperator;
  value?: RuleValue;
  unit?: string; // documentation only, e.g. "percent", "months", "usd"
}

/** A nested boolean group. Exactly one of `all` / `any` is populated per node. */
export interface RuleGroup {
  all?: Array<RuleGroup | RuleCondition>;
  any?: Array<RuleGroup | RuleCondition>;
}

export function isCondition(node: RuleGroup | RuleCondition): node is RuleCondition {
  return (node as RuleCondition).operator !== undefined;
}

/** A named, versioned, reviewable eligibility rule. */
export interface Rule {
  id: string;
  lenderId: string;
  programId: string;
  guidelineVersionId: string;
  category: string; // e.g. "ltv", "fico", "occupancy", "reserves", "credit_event"
  name: string;
  conditions: RuleGroup;
  /**
   * Outcome applied when `conditions` evaluate TRUE. If a rule expresses a
   * requirement, model the conditions as the passing case and set
   * `outcomeWhenFalse` to the failing outcome. See rules-engine docs.
   */
  outcomeWhenTrue: RuleOutcome;
  outcomeWhenFalse: RuleOutcome;
  severity: RuleSeverity;
  userExplanation: string;
  internalExplanation?: string;
  /** When this rule passes and sets a derived maximum (e.g. max LTV), record it. */
  setsField?: { field: "maxLtv" | "maxCltv" | "maxLoanAmount" | "minReservesMonths"; value: number };
  sourceSection?: string;
  sourcePage?: number;
  effectiveDate?: string;
  expirationDate?: string;
  createdBy?: string;
  reviewedBy?: string;
  verificationStatus: VerificationStatus;
}

export interface LtvMatrixEntry {
  minFico: number;
  maxLtv: number; // percent 0-100
  occupancy?: Occupancy;
  maxLoanAmount?: number;
}

export interface Program {
  id: string;
  lenderId: string;
  organizationId: string; // null-equivalent for platform templates handled at repo layer
  name: string;
  isSampleData: boolean;
  active: boolean;
  incomeDocTypes: IncomeDocType[];
  loanPurposes: LoanPurpose[];
  occupancies: Occupancy[];
  propertyTypes: PropertyType[];
  eligibleStates: string[] | "ALL";
  citizenshipEligible: Citizenship[];
  vestingEligible: Vesting[];
  minLoanAmount: number;
  maxLoanAmount: number;
  minFico: number;
  maxDti?: number; // percent; omitted for pure DSCR / no-ratio programs
  minDscr?: number;
  baseMaxLtv: number; // percent, before matrix/rule refinement
  minReservesMonths: number;
  interestOnlyAvailable: boolean;
  prepaymentPenaltyOptions: string[];
  ltvMatrix?: LtvMatrixEntry[];
  guidelineVersionId: string;
  guidelineVersionLabel: string;
  effectiveDate: string;
  lastVerifiedDate?: string;
  sourceCitation: string;
  notes?: string;
}

export interface Lender {
  id: string;
  organizationId: string;
  name: string;
  isSampleData: boolean;
  active: boolean;
  contactEmail?: string;
  notes?: string;
}

export interface GuidelineVersion {
  id: string;
  lenderId: string;
  programId: string;
  label: string; // e.g. "v1.0"
  effectiveDate: string;
  expirationDate?: string;
  lastVerifiedDate?: string;
  verificationStatus: VerificationStatus;
  publishedAt?: string;
  reviewedBy?: string;
}
