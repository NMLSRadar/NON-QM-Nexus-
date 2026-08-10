import type { CalculationSummary, ProgramEvaluation } from "../types/results";
import type { Scenario } from "../types/scenario";
import type { CompensatingScenarioFacts, ProgramRequirementSnapshot } from "./types";

/**
 * Adapters from the platform's existing scenario/calculation/evaluation
 * shapes into the compensating-factors engine inputs. Read-only: only maps
 * values the scenario actually documents — absent stays absent (the engine
 * never scores unknown data favorably).
 */

export function factsFromScenario(scenario: Scenario, calc: CalculationSummary): CompensatingScenarioFacts {
  const facts: CompensatingScenarioFacts = {};
  if (calc.ltv?.value != null) facts.requestedLtv = calc.ltv.value;
  if (calc.dti?.value != null) facts.calculatedDti = calc.dti.value;
  if (scenario.fico != null) facts.fico = scenario.fico;

  const reserves = calc.results.find((r) => r.key === "available_reserves_months");
  if (reserves?.value != null) facts.actualReservesMonths = reserves.value;

  const ce = scenario.creditEvents;
  if (ce) {
    const lateCounts = [ce.mortgageLates30x12, ce.mortgageLates60x12, ce.mortgageLates90x12].filter(
      (n): n is number => n != null
    );
    if (lateCounts.length > 0) facts.mortgageLates12mo = lateCounts.reduce((a, b) => a + b, 0);
    else if (ce.mortgageLatesCategory === "none") facts.mortgageLates12mo = 0;
  }

  if (scenario.selfEmploymentMonths != null) facts.tenureMonths = scenario.selfEmploymentMonths;
  if (calc.qualifyingMonthlyIncome?.value != null) facts.qualifyingMonthlyIncome = calc.qualifyingMonthlyIncome.value;

  return facts;
}

export function snapshotFromEvaluation(evaluation: ProgramEvaluation): ProgramRequirementSnapshot {
  return {
    maxAllowableLtv: evaluation.maxLtv,
    requiredReservesMonths: evaluation.estimatedReservesRequiredMonths,
    maxAllowableDti: evaluation.maxDti,
    minFico: evaluation.minFico > 0 ? evaluation.minFico : undefined,
  };
}
