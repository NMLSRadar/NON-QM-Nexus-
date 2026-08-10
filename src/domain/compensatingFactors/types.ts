/**
 * Compensating-factors engine types (2026-08-10, chatbot upgrade Part 2).
 *
 * The engine is fully deterministic — no LLM involvement in scoring. It
 * describes FILE STRENGTH, never lender behavior: an assessment is not a
 * likelihood of approval and must never be presented as one.
 */

export type CompensatingFactorType =
  | "ltv_cushion"
  | "reserves_surplus"
  | "dti_cushion"
  | "fico_cushion"
  | "clean_housing_history"
  | "credit_depth"
  | "seasoning_surplus"
  | "residual_income"
  | "tenure"
  | "payment_shock";

export type FactorStrength = "none" | "slight" | "moderate" | "strong" | "very_strong";

export type OverallStrength = "weak" | "developing" | "moderate" | "strong";

export interface CompensatingFactor {
  type: CompensatingFactorType;
  /** true only when the factor is DOCUMENTED and at least slight. Unknown
   * data is never favorable: missing inputs produce present:false with an
   * explanation saying the value isn't documented. */
  present: boolean;
  strength: FactorStrength;
  actualValue: string; // e.g. "70% LTV vs 80% max"
  requiredValue: string;
  /** Deterministic template citing the numbers — never model-generated. */
  explanation: string;
  /** What document proves it. */
  verificationNeeded: string;
}

export interface CompensatingFactorAssessment {
  factors: CompensatingFactor[];
  overallStrength: OverallStrength;
  strongFactorCount: number;
  /** Highest-weight factors that are absent/undocumented/below moderate —
   * what would most improve the case, strongest-impact first. */
  missingHighValueFactors: CompensatingFactorType[];
  /** Structured inputs for the AI narrative generator — the narrative is
   * built from THESE numbers only, never from lender posture text. */
  narrativeInputs: {
    factorLines: Array<{ type: CompensatingFactorType; strength: FactorStrength; detail: string }>;
    overallStrength: OverallStrength;
    gaps: string[];
  };
}

/** Facts the engine reads. Every field optional — an absent value scores as
 * unknown (never favorable), and the explanation says what's missing. */
export interface CompensatingScenarioFacts {
  requestedLtv?: number; // percent
  actualReservesMonths?: number;
  calculatedDti?: number; // percent
  fico?: number;
  /** Count of 30-day+ housing lates in the trailing 24 months; 0 = clean. */
  mortgageLates24mo?: number;
  /** Count in the trailing 12 months (used when 24-month data is absent). */
  mortgageLates12mo?: number;
  /** Credit-depth flags — all must be documented for the factor to count. */
  noDerogatories?: boolean;
  noCollections?: boolean;
  seasonedTradelines?: boolean;
  lowUtilization?: boolean;
  /** Months since the applicable credit event (BK/FC/SS/mod). */
  monthsSinceCreditEvent?: number;
  qualifyingMonthlyIncome?: number;
  totalMonthlyObligations?: number;
  /** Self-employment or employment tenure, months. */
  tenureMonths?: number;
  proposedHousingPayment?: number;
  currentHousingPayment?: number;
}

/** The program-side limits the factors are measured against. */
export interface ProgramRequirementSnapshot {
  maxAllowableLtv?: number;
  requiredReservesMonths?: number;
  maxAllowableDti?: number;
  minFico?: number;
  /** Program's required seasoning for the scenario's credit event, months. */
  requiredSeasoningMonths?: number;
  /** Program's minimum employment/self-employment tenure, months. */
  minTenureMonths?: number;
}

/** Org-configurable residual-income tiers (absolute monthly dollars left
 * after obligations). Defaults documented in weights.ts. */
export interface ResidualIncomeThresholds {
  moderate: number;
  strong: number;
  veryStrong: number;
}
