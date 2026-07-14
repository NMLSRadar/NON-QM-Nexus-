import type { MatchStatus, RuleOutcome, RuleSeverity } from "./enums";

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
  ruleResults: RuleEvaluationResult[];
  failedRules: RuleEvaluationResult[];
  warnings: RuleEvaluationResult[];
  manualReviewItems: RuleEvaluationResult[];
  guidelineVersion: string;
  effectiveDate: string;
  lastVerifiedDate?: string;
  sourceCitation: string;
  disclaimer: string;
}

export interface RestructuringOption {
  changedVariable: string;
  currentValue: string;
  suggestedValue: string;
  programsPotentiallyUnlocked: string[];
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
}
