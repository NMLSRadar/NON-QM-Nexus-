/**
 * Compensating-factors engine (chatbot upgrade Part 2 §3).
 *
 * DETERMINISTIC, pure, and tested. Computes the strength of a file's
 * compensating factors from data the scenario already collects — NO LLM
 * involvement anywhere in the scoring. It describes FILE STRENGTH, never a
 * likelihood of approval and never lender behavior.
 *
 * Reserves surplus and LTV cushion carry the most weight (reserves highest of
 * all); perfect housing history and DTI cushion next; the rest are supporting.
 * Weights are a documented, configurable constant (WEIGHTS) with rationale in
 * docs/calculation-methods.md.
 */

export type CompensatingFactorType =
  | "ltv_cushion"
  | "reserves_surplus"
  | "dti_cushion"
  | "fico_cushion"
  | "housing_history"
  | "credit_depth"
  | "seasoning_surplus"
  | "residual_income"
  | "tenure"
  | "payment_shock";

export type FactorStrength = "none" | "slight" | "moderate" | "strong" | "very_strong";
export type OverallStrength = "weak" | "developing" | "moderate" | "strong";

export interface FactorResult {
  type: CompensatingFactorType;
  present: boolean;
  strength: FactorStrength;
  actualValue: string;
  requiredValue: string;
  explanation: string;
  verificationNeeded: string;
}

export interface CompensatingFactorInput {
  requestedLtv?: number;
  maxAllowableLtv?: number;
  actualReservesMonths?: number;
  requiredReservesMonths?: number;
  calculatedDti?: number;
  maxAllowableDti?: number;
  actualFico?: number;
  programMinFico?: number;
  /** Mortgage lates in the lookback window (e.g. 30-day count in 24 months). */
  mortgageLates30x24?: number;
  residualIncome?: number;
  residualIncomeThresholds?: { strong?: number; moderate?: number };
  selfEmploymentMonths?: number;
  minSelfEmploymentMonths?: number;
  seasoningSurplusMonths?: number;
  proposedHousingPayment?: number;
  currentHousingPayment?: number;
  creditDepthFlags?: {
    noDerogatories?: boolean;
    noCollections?: boolean;
    lowUtilization?: boolean;
    seasonedTradelines?: boolean;
  };
}

export interface CompensatingFactorAssessment {
  factors: FactorResult[];
  overallStrength: OverallStrength;
  strongFactorCount: number;
  missingHighValueFactors: CompensatingFactorType[];
  narrativeInputs: Record<string, unknown>;
}

/**
 * Weighting guidance — reserves surplus and LTV cushion carry the most weight
 * (reserves highest of all). Perfect credit/housing history and DTI cushion
 * next. Rationale + tier thresholds are documented in
 * docs/calculation-methods.md. Weights sum to 1.
 */
export const COMPENSATING_FACTOR_WEIGHTS: Record<CompensatingFactorType, number> = {
  reserves_surplus: 0.25,
  ltv_cushion: 0.2,
  housing_history: 0.15,
  dti_cushion: 0.15,
  fico_cushion: 0.1,
  credit_depth: 0.06,
  seasoning_surplus: 0.05,
  residual_income: 0.02,
  tenure: 0.01,
  payment_shock: 0.01,
};

const STRENGTH_SCORE: Record<FactorStrength, number> = { none: 0, slight: 0.2, moderate: 0.5, strong: 0.8, very_strong: 1.0 };

export function overallFromScore(score: number): OverallStrength {
  if (score >= 0.65) return "strong";
  if (score >= 0.4) return "moderate";
  if (score >= 0.2) return "developing";
  return "weak";
}

/** High-value factors that are absent — what would most improve the case. */
const HIGH_VALUE = ["reserves_surplus", "ltv_cushion", "housing_history", "dti_cushion"] as const;

export function scoreCompensatingFactors(input: CompensatingFactorInput): CompensatingFactorAssessment {
  const factors: FactorResult[] = [];

  // LTV cushion: maxAllowableLTV − requestedLTV in points.
  if (input.maxAllowableLtv != null && input.requestedLtv != null) {
    const cushion = input.maxAllowableLtv - input.requestedLtv;
    let strength: FactorStrength = "none";
    if (cushion >= 10) strength = "strong";
    else if (cushion >= 5) strength = "moderate";
    else if (cushion >= 1) strength = "slight";
    factors.push({
      type: "ltv_cushion",
      present: strength !== "none",
      strength,
      actualValue: `${input.requestedLtv}% LTV`,
      requiredValue: `${input.maxAllowableLtv}% max`,
      explanation: `LTV ${cushion} pts under the ${input.maxAllowableLtv}% max${cushion >= 10 ? " — strong cushion" : cushion >= 5 ? " — moderate cushion" : ""}.`,
      verificationNeeded: "Appraisal / current value to confirm the LTV basis.",
    });
  } else {
    factors.push({ type: "ltv_cushion", present: false, strength: "none", actualValue: "—", requiredValue: "—", explanation: "LTV not stated.", verificationNeeded: "Stated LTV." });
  }

  // Reserves surplus — the heaviest factor. Ratio AND absolute months.
  if (input.actualReservesMonths != null && input.requiredReservesMonths != null) {
    const ratio = input.actualReservesMonths / input.requiredReservesMonths;
    let strength: FactorStrength = "none";
    if (input.actualReservesMonths >= 12 || ratio >= 4) strength = "very_strong";
    else if (ratio >= 2 || input.actualReservesMonths >= 8) strength = "strong";
    else if (ratio >= 1.5) strength = "moderate";
    else if (ratio >= 1) strength = "slight";
    factors.push({
      type: "reserves_surplus",
      present: strength !== "none",
      strength,
      actualValue: `${input.actualReservesMonths} months`,
      requiredValue: `${input.requiredReservesMonths} months required`,
      explanation:
        strength === "very_strong"
          ? `${input.actualReservesMonths} months of reserves against a ${input.requiredReservesMonths}-month requirement is one of the strongest positions on a file.`
          : `${input.actualReservesMonths} months vs ${input.requiredReservesMonths} required (${ratio.toFixed(1)}x).`,
      verificationNeeded: "Liquid asset statements / account balances showing reserves.",
    });
  } else {
    factors.push({ type: "reserves_surplus", present: false, strength: "none", actualValue: "—", requiredValue: "—", explanation: "Reserves not stated.", verificationNeeded: "Reserve months." });
  }

  // DTI cushion.
  if (input.maxAllowableDti != null && input.calculatedDti != null) {
    const cushion = input.maxAllowableDti - input.calculatedDti;
    let strength: FactorStrength = "none";
    if (cushion >= 8) strength = "strong";
    else if (cushion >= 3) strength = "moderate";
    else if (cushion >= 1) strength = "slight";
    factors.push({
      type: "dti_cushion",
      present: strength !== "none",
      strength,
      actualValue: `${input.calculatedDti}% DTI`,
      requiredValue: `${input.maxAllowableDti}% max`,
      explanation: `DTI ${cushion} pts under the ${input.maxAllowableDti}% max.`,
      verificationNeeded: "Debt/income documentation supporting the DTI.",
    });
  } else {
    factors.push({ type: "dti_cushion", present: false, strength: "none", actualValue: "—", requiredValue: "—", explanation: "DTI not applicable/not stated.", verificationNeeded: "Calculated DTI." });
  }

  // FICO cushion.
  if (input.actualFico != null && input.programMinFico != null) {
    const cushion = input.actualFico - input.programMinFico;
    let strength: FactorStrength = "none";
    if (cushion >= 40) strength = "strong";
    else if (cushion >= 20) strength = "moderate";
    else if (cushion >= 1) strength = "slight";
    factors.push({
      type: "fico_cushion",
      present: strength !== "none",
      strength,
      actualValue: `${input.actualFico} FICO`,
      requiredValue: `${input.programMinFico} min`,
      explanation: `FICO ${cushion} pts above the ${input.programMinFico} floor.`,
      verificationNeeded: "Credit report / tri-merge FICO.",
    });
  } else {
    factors.push({ type: "fico_cushion", present: false, strength: "none", actualValue: "—", requiredValue: "—", explanation: "FICO not stated.", verificationNeeded: "FICO." });
  }

  // Housing history: 0x30x24 strong, 0x30x12 moderate.
  const noLates = input.mortgageLates30x24 === 0;
  let housingStrength: FactorStrength = "none";
  if (noLates) housingStrength = "strong";
  factors.push({
    type: "housing_history",
    present: housingStrength !== "none",
    strength: housingStrength,
    actualValue: input.mortgageLates30x24 == null ? "—" : `${input.mortgageLates30x24}x30 in 24 months`,
    requiredValue: "0x30x24 for strongest",
    explanation: noLates ? "Clean 0x30x24 mortgage/housing history." : input.mortgageLates30x24 == null ? "Housing history not stated." : `Mortgage lates present (${input.mortgageLates30x24}x30).`,
    verificationNeeded: "Credit report housing-history section.",
  });

  // Credit depth — qualitative flags.
  const flags = input.creditDepthFlags ?? {};
  const depthCount = [flags.noDerogatories, flags.noCollections, flags.lowUtilization, flags.seasonedTradelines].filter(Boolean).length;
  let depthStrength: FactorStrength = "none";
  if (depthCount >= 4) depthStrength = "strong";
  else if (depthCount >= 3) depthStrength = "moderate";
  else if (depthCount >= 1) depthStrength = "slight";
  factors.push({
    type: "credit_depth",
    present: depthStrength !== "none",
    strength: depthStrength,
    actualValue: `${depthCount}/4 depth flags`,
    requiredValue: "3+ flags",
    explanation: `${depthCount} of 4 credit-depth flags present (no derogatories, no collections, low utilization, seasoned tradelines).`,
    verificationNeeded: "Credit report.",
  });

  // Seasoning surplus.
  if (input.seasoningSurplusMonths != null) {
    let strength: FactorStrength = "none";
    if (input.seasoningSurplusMonths >= 12) strength = "strong";
    else if (input.seasoningSurplusMonths >= 6) strength = "moderate";
    else if (input.seasoningSurplusMonths >= 1) strength = "slight";
    factors.push({
      type: "seasoning_surplus",
      present: strength !== "none",
      strength,
      actualValue: `${input.seasoningSurplusMonths} months beyond min`,
      requiredValue: "program minimum",
      explanation: `${input.seasoningSurplusMonths} months past the credit-event seasoning minimum.`,
      verificationNeeded: "Bankruptcy/foreclosure discharge records.",
    });
  } else {
    factors.push({ type: "seasoning_surplus", present: false, strength: "none", actualValue: "—", requiredValue: "—", explanation: "No credit-event seasoning in context.", verificationNeeded: "—" });
  }

  // Residual income.
  if (input.residualIncome != null) {
    const strong = input.residualIncomeThresholds?.strong;
    const moderate = input.residualIncomeThresholds?.moderate;
    let strength: FactorStrength = "none";
    if (strong != null && input.residualIncome >= strong) strength = "strong";
    else if (moderate != null && input.residualIncome >= moderate) strength = "moderate";
    else if (input.residualIncome > 0) strength = "slight";
    factors.push({
      type: "residual_income",
      present: strength !== "none",
      strength,
      actualValue: `$${input.residualIncome.toLocaleString()} residual`,
      requiredValue: strong != null ? `$${strong.toLocaleString()}+ for strong` : "—",
      explanation: "Qualifying income minus total obligations.",
      verificationNeeded: "Income + liability documentation.",
    });
  } else {
    factors.push({ type: "residual_income", present: false, strength: "none", actualValue: "—", requiredValue: "—", explanation: "Residual income not computed.", verificationNeeded: "—" });
  }

  // Tenure (self-employment/employment beyond program minimum).
  if (input.selfEmploymentMonths != null && input.minSelfEmploymentMonths != null) {
    const beyond = input.selfEmploymentMonths - input.minSelfEmploymentMonths;
    let strength: FactorStrength = "none";
    if (beyond >= 24) strength = "moderate";
    else if (beyond >= 12) strength = "slight";
    factors.push({
      type: "tenure",
      present: strength !== "none",
      strength,
      actualValue: `${input.selfEmploymentMonths} months tenure`,
      requiredValue: `${input.minSelfEmploymentMonths} months min`,
      explanation: `${beyond} months beyond the ${input.minSelfEmploymentMonths}-month minimum.`,
      verificationNeeded: "Business/personal history supporting tenure.",
    });
  } else {
    factors.push({ type: "tenure", present: false, strength: "none", actualValue: "—", requiredValue: "—", explanation: "Tenure not stated.", verificationNeeded: "—" });
  }

  // Payment shock.
  if (input.proposedHousingPayment != null && input.currentHousingPayment != null) {
    const ratio = input.proposedHousingPayment / input.currentHousingPayment;
    let strength: FactorStrength = "none";
    if (ratio <= 1.0) strength = "strong";
    else if (ratio <= 1.25) strength = "moderate";
    factors.push({
      type: "payment_shock",
      present: strength !== "none",
      strength,
      actualValue: `${ratio.toFixed(2)}x payment ratio`,
      requiredValue: "≤1.25x",
      explanation: ratio <= 1.0 ? "Proposed payment is at or below the current housing payment." : "Modest payment increase.",
      verificationNeeded: "Current housing payment + proposed PITIA.",
    });
  } else {
    factors.push({ type: "payment_shock", present: false, strength: "none", actualValue: "—", requiredValue: "—", explanation: "Payment shock not computable.", verificationNeeded: "—" });
  }

  // Weighted overall score.
  let score = 0;
  for (const f of factors) {
    score += COMPENSATING_FACTOR_WEIGHTS[f.type] * STRENGTH_SCORE[f.strength];
  }
  const overallStrength = overallFromScore(score);
  const strongFactorCount = factors.filter((f) => f.strength === "strong" || f.strength === "very_strong").length;
  const missingHighValueFactors = HIGH_VALUE.filter((t) => {
    const f = factors.find((x) => x.type === t);
    return !f || f.strength === "none" || f.strength === "slight";
  }) as CompensatingFactorType[];

  return {
    factors,
    overallStrength,
    strongFactorCount,
    missingHighValueFactors,
    narrativeInputs: {
      overallStrength,
      strongFactorCount,
      topFactors: factors.filter((f) => f.present).sort((a, b) => STRENGTH_SCORE[b.strength] - STRENGTH_SCORE[a.strength]).slice(0, 5).map((f) => ({ type: f.type, strength: f.strength, actualValue: f.actualValue, requiredValue: f.requiredValue })),
    },
  };
}