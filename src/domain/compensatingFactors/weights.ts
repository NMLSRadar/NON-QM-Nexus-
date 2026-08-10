import type { CompensatingFactorType, FactorStrength, ResidualIncomeThresholds } from "./types";

/**
 * Factor weights for the overall-strength roll-up — a single documented
 * constant, not magic numbers scattered through the engine.
 *
 * Rationale (spec §3, Part 2):
 *  - RESERVES SURPLUS carries the most weight of all. A borrower holding
 *    12+ months when the program asks 3 or 6 is one of the strongest
 *    positions a file can be in — cash after closing directly answers the
 *    ability-to-repay concern an exception reviewer is weighing.
 *  - LTV CUSHION is next: real equity below the cap is the lender's
 *    protection if everything else goes wrong.
 *  - CLEAN HOUSING HISTORY, CREDIT DEPTH, and DTI CUSHION form the next
 *    band — they speak to willingness and capacity to pay.
 *  - The remaining factors matter but rarely carry an exception alone.
 */
export const FACTOR_WEIGHTS: Record<CompensatingFactorType, number> = {
  reserves_surplus: 3.0,
  ltv_cushion: 2.5,
  clean_housing_history: 2.0,
  credit_depth: 2.0,
  dti_cushion: 2.0,
  fico_cushion: 1.5,
  seasoning_surplus: 1.5,
  residual_income: 1.5,
  payment_shock: 1.5,
  tenure: 1.0,
};

/** Numeric value of each strength tier for the weighted roll-up. */
export const STRENGTH_VALUES: Record<FactorStrength, number> = {
  none: 0,
  slight: 0.25,
  moderate: 0.5,
  strong: 0.75,
  very_strong: 1,
};

/**
 * Overall-strength thresholds on the weighted ratio
 * (Σ weight×strengthValue over DOCUMENTED factors ÷ Σ ALL weights).
 * Dividing by the full weight sum — not just documented factors — is what
 * keeps unknown data from ever scoring favorably: an undocumented factor
 * contributes zero to the numerator but still counts in the denominator.
 */
export const OVERALL_THRESHOLDS = {
  developing: 0.15,
  moderate: 0.3,
  strong: 0.5,
} as const;

/** Factors considered "high-value" when reporting what's missing. */
export const HIGH_VALUE_FACTOR_MIN_WEIGHT = 2.0;

/** Default residual-income tiers (monthly dollars after all obligations) —
 * org-configurable via the engine's options parameter. */
export const DEFAULT_RESIDUAL_INCOME_THRESHOLDS: ResidualIncomeThresholds = {
  moderate: 2_500,
  strong: 5_000,
  veryStrong: 10_000,
};
