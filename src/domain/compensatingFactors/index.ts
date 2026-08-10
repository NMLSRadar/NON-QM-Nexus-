import type {
  CompensatingFactor,
  CompensatingFactorAssessment,
  CompensatingFactorType,
  CompensatingScenarioFacts,
  FactorStrength,
  OverallStrength,
  ProgramRequirementSnapshot,
  ResidualIncomeThresholds,
} from "./types";
import {
  DEFAULT_RESIDUAL_INCOME_THRESHOLDS,
  FACTOR_WEIGHTS,
  HIGH_VALUE_FACTOR_MIN_WEIGHT,
  OVERALL_THRESHOLDS,
  STRENGTH_VALUES,
} from "./weights";

export * from "./types";
export { FACTOR_WEIGHTS, OVERALL_THRESHOLDS } from "./weights";

/**
 * Deterministic compensating-factors engine (chatbot upgrade Part 2, §3).
 *
 * Computes file strength from data the scenario already collects. Pure
 * function, no LLM anywhere in scoring, no lender-posture input — posture
 * describes lenders, this describes THE FILE, and the two must never blend.
 *
 * Unknown is never favorable: a factor whose inputs are missing scores
 * `none` with an explanation that says the value isn't documented, and it
 * still counts fully in the overall denominator (see weights.ts).
 *
 * The output describes file strength, not lender behavior — it is never a
 * likelihood of approval.
 */

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function factor(
  type: CompensatingFactorType,
  strength: FactorStrength,
  actualValue: string,
  requiredValue: string,
  explanation: string,
  verificationNeeded: string
): CompensatingFactor {
  return { type, present: strength !== "none", strength, actualValue, requiredValue, explanation, verificationNeeded };
}

function unknownFactor(type: CompensatingFactorType, whatIsMissing: string, verificationNeeded: string): CompensatingFactor {
  return factor(type, "none", "not documented", "—", `${whatIsMissing} isn't documented on this file, so it can't count in its favor.`, verificationNeeded);
}

export interface ScoreOptions {
  residualIncomeThresholds?: ResidualIncomeThresholds;
}

export function scoreCompensatingFactors(
  scenario: CompensatingScenarioFacts,
  program: ProgramRequirementSnapshot,
  options: ScoreOptions = {}
): CompensatingFactorAssessment {
  const residualTiers = options.residualIncomeThresholds ?? DEFAULT_RESIDUAL_INCOME_THRESHOLDS;
  const factors: CompensatingFactor[] = [];

  // ── LTV cushion ───────────────────────────────────────────────────────────
  if (scenario.requestedLtv != null && program.maxAllowableLtv != null) {
    const cushion = Math.round((program.maxAllowableLtv - scenario.requestedLtv) * 100) / 100;
    const strength: FactorStrength = cushion >= 10 ? "strong" : cushion >= 5 ? "moderate" : cushion >= 1 ? "slight" : "none";
    factors.push(
      factor(
        "ltv_cushion",
        strength,
        `${scenario.requestedLtv}% LTV vs ${program.maxAllowableLtv}% max`,
        `≤ ${program.maxAllowableLtv}% LTV`,
        cushion > 0
          ? `Requested leverage is ${cushion} points under the program cap (${scenario.requestedLtv}% vs ${program.maxAllowableLtv}%) — real equity beyond the requirement.`
          : `No LTV cushion: requested ${scenario.requestedLtv}% against a ${program.maxAllowableLtv}% cap.`,
        "Purchase contract / appraisal supporting the value and loan amount"
      )
    );
  } else {
    factors.push(unknownFactor("ltv_cushion", "Requested LTV or the program's LTV cap", "Appraisal or purchase contract"));
  }

  // ── Reserves surplus — the heaviest factor; surfaced prominently ─────────
  if (scenario.actualReservesMonths != null && program.requiredReservesMonths != null && program.requiredReservesMonths > 0) {
    const ratio = scenario.actualReservesMonths / program.requiredReservesMonths;
    const months = scenario.actualReservesMonths;
    const strength: FactorStrength =
      ratio >= 4 || (months >= 12 && ratio >= 1.5)
        ? "very_strong"
        : ratio >= 2
          ? "strong"
          : ratio >= 1.5
            ? "moderate"
            : ratio > 1
              ? "slight"
              : "none";
    factors.push(
      factor(
        "reserves_surplus",
        strength,
        `${months} months vs ${program.requiredReservesMonths} required`,
        `≥ ${program.requiredReservesMonths} months reserves`,
        strength === "very_strong"
          ? `${months} months of reserves against a ${program.requiredReservesMonths}-month requirement is one of the strongest positions a file can carry — lead with it in any exception conversation.`
          : strength === "none"
            ? `Reserves of ${months} months do not exceed the ${program.requiredReservesMonths}-month requirement.`
            : `${months} months of reserves against a ${program.requiredReservesMonths}-month requirement (${ratio.toFixed(1)}x the minimum).`,
        "Two months of asset statements covering the reserve accounts"
      )
    );
  } else {
    factors.push(unknownFactor("reserves_surplus", "Documented reserves or the program's reserve requirement", "Asset statements"));
  }

  // ── DTI cushion ───────────────────────────────────────────────────────────
  if (scenario.calculatedDti != null && program.maxAllowableDti != null) {
    const cushion = Math.round((program.maxAllowableDti - scenario.calculatedDti) * 100) / 100;
    const strength: FactorStrength = cushion >= 8 ? "strong" : cushion >= 3 ? "moderate" : cushion >= 1 ? "slight" : "none";
    factors.push(
      factor(
        "dti_cushion",
        strength,
        `${scenario.calculatedDti}% DTI vs ${program.maxAllowableDti}% max`,
        `≤ ${program.maxAllowableDti}% DTI`,
        cushion > 0
          ? `DTI runs ${cushion} points under the ceiling (${scenario.calculatedDti}% vs ${program.maxAllowableDti}%).`
          : `No DTI cushion at ${scenario.calculatedDti}% against a ${program.maxAllowableDti}% ceiling.`,
        "Income documentation per the program's method"
      )
    );
  } else {
    factors.push(unknownFactor("dti_cushion", "Calculated DTI or the program's DTI ceiling", "Income documentation"));
  }

  // ── FICO cushion ──────────────────────────────────────────────────────────
  if (scenario.fico != null && program.minFico != null && program.minFico > 0) {
    const cushion = scenario.fico - program.minFico;
    const strength: FactorStrength = cushion >= 40 ? "strong" : cushion >= 20 ? "moderate" : cushion >= 5 ? "slight" : "none";
    factors.push(
      factor(
        "fico_cushion",
        strength,
        `${scenario.fico} FICO vs ${program.minFico} floor`,
        `≥ ${program.minFico} FICO`,
        cushion > 0 ? `${scenario.fico} FICO sits ${cushion} points above the ${program.minFico} floor.` : `${scenario.fico} FICO carries no margin above the ${program.minFico} floor.`,
        "Tri-merge credit report"
      )
    );
  } else {
    factors.push(unknownFactor("fico_cushion", "Borrower FICO or the program's FICO floor", "Tri-merge credit report"));
  }

  // ── Housing history ───────────────────────────────────────────────────────
  if (scenario.mortgageLates24mo != null) {
    const strength: FactorStrength = scenario.mortgageLates24mo === 0 ? "strong" : "none";
    factors.push(
      factor(
        "clean_housing_history",
        strength,
        scenario.mortgageLates24mo === 0 ? "0x30x24" : `${scenario.mortgageLates24mo} late(s) in 24 months`,
        "clean housing history",
        scenario.mortgageLates24mo === 0
          ? "Clean 24-month housing history (0x30x24)."
          : `${scenario.mortgageLates24mo} housing late(s) in the trailing 24 months — housing history is not a compensating factor here.`,
        "VOM / VOR or mortgage payment history"
      )
    );
  } else if (scenario.mortgageLates12mo != null) {
    const strength: FactorStrength = scenario.mortgageLates12mo === 0 ? "moderate" : "none";
    factors.push(
      factor(
        "clean_housing_history",
        strength,
        scenario.mortgageLates12mo === 0 ? "0x30x12" : `${scenario.mortgageLates12mo} late(s) in 12 months`,
        "clean housing history",
        scenario.mortgageLates12mo === 0
          ? "Clean 12-month housing history (0x30x12); a documented clean 24 months would strengthen it further."
          : `${scenario.mortgageLates12mo} housing late(s) in the trailing 12 months — housing history is not a compensating factor here.`,
        "VOM / VOR or mortgage payment history"
      )
    );
  } else {
    factors.push(unknownFactor("clean_housing_history", "Housing payment history", "VOM / VOR or mortgage payment history"));
  }

  // ── Credit depth — qualitative flags rolled into one tier ────────────────
  {
    const flags = [scenario.noDerogatories, scenario.noCollections, scenario.seasonedTradelines, scenario.lowUtilization];
    const documented = flags.filter((f) => f != null);
    if (documented.length === 0) {
      factors.push(unknownFactor("credit_depth", "Credit-depth detail (derogatories, collections, tradeline age, utilization)", "Tri-merge credit report"));
    } else if (flags.some((f) => f === false)) {
      factors.push(
        factor("credit_depth", "none", "credit blemishes present", "clean, seasoned credit", "Credit depth is not a compensating factor: at least one of derogatories/collections/tradeline seasoning/utilization works against the file.", "Tri-merge credit report")
      );
    } else {
      const trueCount = flags.filter((f) => f === true).length;
      const strength: FactorStrength = trueCount === 4 ? "strong" : trueCount >= 2 ? "moderate" : "slight";
      factors.push(
        factor(
          "credit_depth",
          strength,
          `${trueCount}/4 depth markers documented clean`,
          "clean, seasoned credit",
          `Credit depth: ${trueCount} of 4 markers documented clean (no derogatories, no collections, seasoned tradelines, low utilization).`,
          "Tri-merge credit report"
        )
      );
    }
  }

  // ── Seasoning surplus ─────────────────────────────────────────────────────
  if (scenario.monthsSinceCreditEvent != null && program.requiredSeasoningMonths != null) {
    const surplus = scenario.monthsSinceCreditEvent - program.requiredSeasoningMonths;
    const strength: FactorStrength = surplus >= 12 ? "strong" : surplus >= 6 ? "moderate" : surplus >= 1 ? "slight" : "none";
    factors.push(
      factor(
        "seasoning_surplus",
        strength,
        `${scenario.monthsSinceCreditEvent} months vs ${program.requiredSeasoningMonths} required`,
        `≥ ${program.requiredSeasoningMonths} months seasoning`,
        surplus > 0
          ? `The credit event is ${surplus} months beyond the program's ${program.requiredSeasoningMonths}-month seasoning minimum.`
          : `Seasoning carries no surplus beyond the ${program.requiredSeasoningMonths}-month requirement.`,
        "Discharge / completion documentation with dates"
      )
    );
  } else {
    factors.push(unknownFactor("seasoning_surplus", "Credit-event date or the program's seasoning requirement", "Discharge / completion documentation"));
  }

  // ── Residual income ───────────────────────────────────────────────────────
  if (scenario.qualifyingMonthlyIncome != null && scenario.totalMonthlyObligations != null) {
    const residual = Math.round(scenario.qualifyingMonthlyIncome - scenario.totalMonthlyObligations);
    const strength: FactorStrength =
      residual >= residualTiers.veryStrong ? "very_strong" : residual >= residualTiers.strong ? "strong" : residual >= residualTiers.moderate ? "moderate" : residual > 0 ? "slight" : "none";
    factors.push(
      factor(
        "residual_income",
        strength,
        `${USD.format(residual)}/month after obligations`,
        `> ${USD.format(0)} residual`,
        residual > 0
          ? `${USD.format(residual)} of monthly income remains after all obligations.`
          : "No residual income remains after obligations.",
        "Income documentation and liability statement"
      )
    );
  } else {
    factors.push(unknownFactor("residual_income", "Qualifying income or total obligations", "Income documentation and liability statement"));
  }

  // ── Tenure ────────────────────────────────────────────────────────────────
  if (scenario.tenureMonths != null && program.minTenureMonths != null) {
    const surplus = scenario.tenureMonths - program.minTenureMonths;
    const strength: FactorStrength = surplus >= 24 ? "moderate" : surplus >= 12 ? "slight" : "none";
    factors.push(
      factor(
        "tenure",
        strength,
        `${scenario.tenureMonths} months vs ${program.minTenureMonths} required`,
        `≥ ${program.minTenureMonths} months`,
        surplus > 0
          ? `Employment/self-employment tenure runs ${surplus} months beyond the program minimum.`
          : "Tenure carries no surplus beyond the program minimum.",
        "Business license / CPA letter / employment verification"
      )
    );
  } else {
    factors.push(unknownFactor("tenure", "Employment/self-employment tenure or the program minimum", "Business license / employment verification"));
  }

  // ── Payment shock ─────────────────────────────────────────────────────────
  if (
    scenario.proposedHousingPayment != null &&
    scenario.currentHousingPayment != null &&
    scenario.currentHousingPayment > 0
  ) {
    const ratio = scenario.proposedHousingPayment / scenario.currentHousingPayment;
    const strength: FactorStrength = ratio <= 1.0 ? "strong" : ratio <= 1.25 ? "moderate" : ratio <= 1.5 ? "slight" : "none";
    factors.push(
      factor(
        "payment_shock",
        strength,
        `${ratio.toFixed(2)}x current housing payment`,
        "≤ 1.25x current payment",
        ratio <= 1.0
          ? `The proposed payment is at or below the current housing payment (${ratio.toFixed(2)}x) — no payment shock.`
          : `Proposed payment is ${ratio.toFixed(2)}x the current housing payment.`,
        "Current housing payment documentation (VOM/VOR)"
      )
    );
  } else {
    factors.push(unknownFactor("payment_shock", "Current or proposed housing payment", "VOM / VOR and proposed PITIA"));
  }

  // ── Roll-up ───────────────────────────────────────────────────────────────
  const totalWeight = Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
  const score =
    factors.reduce((sum, f) => sum + FACTOR_WEIGHTS[f.type] * STRENGTH_VALUES[f.strength], 0) / totalWeight;
  const overallStrength: OverallStrength =
    score >= OVERALL_THRESHOLDS.strong ? "strong" : score >= OVERALL_THRESHOLDS.moderate ? "moderate" : score >= OVERALL_THRESHOLDS.developing ? "developing" : "weak";

  const strongFactorCount = factors.filter((f) => f.strength === "strong" || f.strength === "very_strong").length;

  const missingHighValueFactors = factors
    .filter((f) => FACTOR_WEIGHTS[f.type] >= HIGH_VALUE_FACTOR_MIN_WEIGHT && STRENGTH_VALUES[f.strength] < STRENGTH_VALUES.moderate)
    .sort((a, b) => FACTOR_WEIGHTS[b.type] - FACTOR_WEIGHTS[a.type])
    .map((f) => f.type);

  // Strongest first for display; reserves surfaced prominently by weight.
  const ordered = [...factors].sort(
    (a, b) => STRENGTH_VALUES[b.strength] - STRENGTH_VALUES[a.strength] || FACTOR_WEIGHTS[b.type] - FACTOR_WEIGHTS[a.type]
  );

  return {
    factors: ordered,
    overallStrength,
    strongFactorCount,
    missingHighValueFactors,
    narrativeInputs: {
      factorLines: ordered.filter((f) => f.present).map((f) => ({ type: f.type, strength: f.strength, detail: f.explanation })),
      overallStrength,
      gaps: ordered.filter((f) => !f.present).map((f) => f.explanation),
    },
  };
}
