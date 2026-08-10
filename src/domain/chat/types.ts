/**
 * Chat domain types — Stage A parse output, intents, target metrics, and the
 * deterministic tool-layer result shapes.
 *
 * PRODUCT PRINCIPLE (chatbot precision spec): the model never computes
 * eligibility numbers and never recalls lender facts from memory. Every
 * factual claim traces to a tool call against the tier-gated ProgramCatalog
 * the caller can actually see. Superlatives/thresholds are computed here in
 * the domain layer (deterministic), not by the LLM — the LLM only narrates
 * the ranked result set.
 */

import type { IncomeDocType, Occupancy, LoanPurpose, PropertyType, Citizenship, Vesting } from "@/domain/types/enums";

export type ChatIntent =
  | "superlative_lookup" // min/max of a numeric attribute across the library
  | "availability_lookup" // who supports a feature / borrower type / property type
  | "threshold_lookup" // cross-library floor/ceiling question
  | "scenario_triage" // partial borrower facts -> candidate programs
  | "program_detail" // facts about one named program
  | "comparison" // A vs B
  | "exception_guidance" // exception-friendly / flexible / lenient / who will do it
  | "process_help" // exceptions submission, turn times, how-to
  | "definition" // industry terminology
  | "app_navigation" // where is X in the product
  | "out_of_scope";

export type TargetMetric =
  | "min_down_payment"
  | "max_ltv"
  | "min_fico"
  | "max_dti"
  | "min_dscr"
  | "min_reserves"
  | "min_loan_amount"
  | "max_loan_amount"
  | "min_seasoning";

export type MetricDirection = "min" | "max";

export interface CreditEvent {
  type: "bk7" | "bk13" | "foreclosure" | "short_sale" | "dil" | "forbearance" | "modification" | "mortgage_lates";
  /** e.g. "2x30x12" — only set for mortgage_lates. */
  pattern?: string;
}

export interface ParsedEntities {
  docType?: IncomeDocType[];
  occupancy?: Occupancy[];
  purpose?: LoanPurpose[];
  propertyType?: PropertyType[];
  state?: string;
  fico?: number;
  ltv?: number;
  loanAmount?: number;
  dscr?: number;
  reservesMonths?: number;
  creditEvents?: CreditEvent[];
  latePattern?: string; // e.g. "2x30x12"
  vesting?: Vesting;
  features?: string[]; // io, ppp_options, non_warrantable, str, first_time_investor, first_time_homebuyer, no_ratio
  citizenship?: Citizenship[];
}

export interface ParsedQuery {
  intent: ChatIntent;
  normalizedText: string;
  entities: ParsedEntities;
  targetMetric?: TargetMetric;
  direction?: MetricDirection;
  /** Lender/program names the user invoked (fuzzy-matched to real catalog rows in the tool layer). */
  namedPrograms?: Array<{ query: string; resolvedProgramId?: string; resolvedLenderName?: string }>;
  missingCriticalFields: string[];
  confidence: number; // 0..1
  /** True when the parser decided occupancy/purpose/etc. is REQUIRED to answer precisely. */
  needsClarification: boolean;
  clarificationQuestion?: string;
  /** Marker for the "stated income" colloquialism — mapped to closest alt-doc with a note. */
  statedIncomeMappedTo?: IncomeDocType;
  /** Set only for out_of_scope intents — the specific guardrail that fired. */
  outOfScopeReason?: string;
}

// ---------------------------------------------------------------------------
// Tool-layer result shapes. Every result is tagged `sourceType` so the answer
// renderer can apply the correct label (guideline vs editorial).
// ---------------------------------------------------------------------------

export type ResultSourceType = "guideline" | "editorial" | "help" | "scenario";

export interface ProgramCitation {
  programId: string;
  lenderId: string;
  lenderName: string;
  programName: string;
  isSampleData: boolean;
  guidelineVersion?: string;
  effectiveDate?: string;
  lastVerifiedDate?: string;
  verificationStatus?: string;
  sourceCitation?: string;
}

export interface ProgramRow extends ProgramCitation {
  /** The single value the question asked about (e.g. 20 for "min down payment"). */
  value: number | null;
  valueLabel?: string; // e.g. "20% down (80% LTV)"
  /** Key gating conditions that qualify the value (FICO, purpose, DSCR, etc.). */
  gating: string[];
  /** True when the queried field is not captured on this program (never inferred). */
  fieldNotCaptured: boolean;
}

export interface RankResult {
  metric: TargetMetric;
  direction: MetricDirection;
  rows: ProgramRow[]; // sorted; [0] is the extremum
  ties: string[]; // programIds sharing the extremum value
  fieldCaptured: boolean; // false when NO program captures the field
  fieldNotCapturedAcross: string[]; // programIds that didn't capture the field
  citation: ProgramCitation;
}

export interface SearchProgramsResult {
  rows: Array<ProgramRow & { matchedOn: string[] }>;
  total: number;
}

export interface ProgramDetailResult {
  program: ProgramRow;
  matrix?: Record<string, unknown>;
  rules: Array<{ name: string; category: string; severity: string; userExplanation: string }>;
}

export interface MatrixCellResult {
  programId: string;
  programName: string;
  lenderName: string;
  dimensions: Record<string, unknown>;
  maxLtv: number | null; // null = no cell captured for those dimensions
  captured: boolean;
}

export interface RulesQueryResult {
  category: string;
  rows: Array<{
    ruleId: string;
    programId: string;
    programName: string;
    lenderName: string;
    category: string;
    name: string;
    severity: string;
    userExplanation: string;
    sourceSection?: string;
    verificationStatus?: string;
    isSampleData: boolean;
  }>;
}

export interface QuickEvaluateResult {
  programId: string;
  programName: string;
  lenderName: string;
  status: string;
  matchScore: number;
  failedRules: Array<{ userExplanation: string; severity: string }>;
  warnings: Array<{ userExplanation: string; severity: string }>;
  manualReview: Array<{ userExplanation: string; severity: string }>;
  isSampleData: boolean;
}

export interface HelpResult {
  topic: string;
  summary: string;
  steps: string[];
  route?: string;
  ctaLabel?: string;
}

export interface ScenarioDraftResult {
  scenario: unknown;
  deepLink: string;
}

export interface GroundedToolResult {
  tool: string;
  sourceType: ResultSourceType;
  args: Record<string, unknown>;
  data: unknown;
  rowCount: number;
  /** programIds present in this result — used by the grounding check. */
  programIds: string[];
}

/**
 * The deterministic exception-guidance layer (Part 2). Editorial posture is
 * tagged sourceType: 'editorial' so it can never be rendered as a guideline.
 */
export interface LenderPosture {
  lenderId: string;
  lenderName: string;
  posture: "exception_based" | "moderate" | "rigid";
  postureNotes?: string;
  pricingTendency?: "typically_more_aggressive" | "typically_mid" | "typically_better_priced" | "unknown";
  exceptionsConsidered: boolean;
  exceptionChannel?: string;
  typicalCompensatingFactorsRequired: string[];
  isVerified: boolean;
  lastReviewedAt?: string;
  stale: boolean; // lastReviewedAt older than the staleness window
  sourceType: "editorial";
}