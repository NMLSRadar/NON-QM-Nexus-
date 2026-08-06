import type { Citizenship, IncomeDocType, LoanPurpose, MatchStatus, Occupancy, PropertyType, RuleOutcome, RuleSeverity } from "./enums";

/**
 * A calculation output with a fully transparent trace: every result carries the
 * formula used and the inputs it consumed so the UI and reports can show
 * "why this number".
 */
export interface CalcResult {
  key: string; // e.g. "ltv", "dti", "dscr", "bank_statement_income"
  label: string;
  value: number | null;
  unit: "percent" | "usd" | "ratio" | "months" | "count";
  formula: string;
  inputs: Record<string, number | string | boolean | null | undefined>;
  notes?: string[];
}

export interface CalculationSummary {
  ltv?: CalcResult;
  cltv?: CalcResult;
  dti?: CalcResult;
  dscr?: CalcResult;
  qualifyingMonthlyIncome?: CalcResult;
  results: CalcResult[]; // full ordered list including the above
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  category: string;
  outcome: RuleOutcome;
  severity: RuleSeverity;
  userExplanation: string;
  internalExplanation?: string;
  sourceSection?: string;
  sourcePage?: number;
}

export interface ProgramEvaluation {
  programId: string;
  lenderId: string;
  programName: string;
  lenderName: string;
  isSampleData: boolean;
  status: MatchStatus;
  matchScore: number; // 0-100, transparent weighted score
  scoreBreakdown: Array<{ factor: string; points: number; maxPoints: number; note: string }>;
  maxLtv?: number;
  maxLoanAmount?: number;
  minFico: number;
  maxDti?: number;
  estimatedQualifyingIncome?: number;
  estimatedReservesRequiredMonths?: number;
  documentationType: string;
  // Real program eligibility flags, passed straight through from the
  // Program record — surfaced on the premium recommendation cards
  // (occupancy/property/doc/purpose/citizenship badges, IO availability).
  // Never fabricated: every value here traces to a real, admin-managed
  // Program field.
  incomeDocTypes: IncomeDocType[];
  loanPurposes: LoanPurpose[];
  occupancies: Occupancy[];
  propertyTypes: PropertyType[];
  citizenshipEligible: Citizenship[];
  /** Editorial flag (never a guideline fact): admin-curated as a
   * specialist Foreign National lender — see Program.foreignNationalSpecialist. */
  foreignNationalSpecialist: boolean;
  /** Same editorial-signal pattern for ITIN — see Program.itinSpecialist. */
  itinSpecialist: boolean;
  bankStatementCleanExecution: boolean;
  bankStatementFlexible: boolean;
  /** Editorial flagship signal; never an eligibility override. */
  premierProduct?: boolean;
  /** True only when this evaluation is for an ITIN borrower requesting
   * DSCR/no-ratio qualification AND the program's current matrix
   * expressly confirms the combination (Program.itinDscrEligible /
   * itinNoRatioEligible === true) — never true merely because the
   * program independently lists itin + dscr. Drives the distinct "ITIN
   * DSCR Eligible" card label (never a generic "DSCR" label that could
   * cause the user to assume ITIN eligibility). */
  itinDscrConfirmed: boolean;
  /** Lien position — see LienPosition in enums.ts. Passed straight through
   * from Program.lienPosition (undefined/"first_lien" is the ordinary
   * default); drives the distinct "Standalone Second Lien" card badge so
   * a second-mortgage/HELOAN result is never confused with an ordinary
   * first-lien cash-out refinance. */
  lienPosition?: import("./enums").LienPosition;
  interestOnlyAvailable: boolean;
  ruleResults: RuleEvaluationResult[];
  failedRules: RuleEvaluationResult[];
  warnings: RuleEvaluationResult[];
  manualReviewItems: RuleEvaluationResult[];
  guidelineVersion: string;
  effectiveDate: string;
  lastVerifiedDate?: string;
  sourceCitation: string;
  disclaimer: string;
  /** The lender's minimum subscription tier (see Lender.tierLevel). Lets the
   * results UI show an eligible lender from a tier the viewer hasn't
   * subscribed to yet — locked, but still counted toward the eligible-lender
   * threshold — instead of silently excluding it (product spec: membership-
   * tier protection). */
  lenderTierLevel: number;
}

export interface RestructuringOption {
  changedVariable: string;
  currentValue: string;
  suggestedValue: string;
  programsPotentiallyUnlocked: string[];
  /** Program IDs behind programsPotentiallyUnlocked — used by analyze.ts to apply the eligible_with_restructuring display upgrade. */
  programsPotentiallyUnlockedIds: string[];
  remainingConcerns: string[];
  requiredVerification: string[];
  rationale: string;
}

export interface NeedsListItem {
  category: string;
  label: string;
  required: boolean;
  reason: string;
}

export interface AnalysisResult {
  scenarioId: string;
  calculation: CalculationSummary;
  evaluations: ProgramEvaluation[]; // ranked
  restructuring: RestructuringOption[];
  needsList: NeedsListItem[];
  generatedAt: string;
  disclaimer: string;
  /** Only present when scenario.incomeDocType === "bank_statement" — see
   * src/domain/matching/bankStatementComplexity.ts. */
  bankStatementFileClassification?: import("../matching/bankStatementComplexity").BankStatementComplexityResult;
}
