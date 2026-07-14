import { IncomeDocType } from "../types/enums";
import type { Scenario } from "../types/scenario";
import type { CalcResult, CalculationSummary } from "../types/results";
import { calcCltv, calcLtv } from "./ltv";
import { calcDti } from "./dti";
import { calcDscr } from "./dscr";
import { calcQualifyingMonthlyIncome } from "./income";
import { calcAvailableReserves } from "./reserves";

export * from "./ltv";
export * from "./dti";
export * from "./dscr";
export * from "./bankStatement";
export * from "./pnl";
export * from "./assetDepletion";
export * from "./income";
export * from "./reserves";

/**
 * Run the full deterministic calculation suite for a scenario. Order matters:
 * income is resolved first because DTI consumes it. Every entry carries its own
 * formula + inputs for full traceability.
 */
export function runCalculations(scenario: Scenario): CalculationSummary {
  const results: CalcResult[] = [];

  const ltv = calcLtv(scenario);
  const cltv = calcCltv(scenario);
  results.push(ltv, cltv);

  const income = calcQualifyingMonthlyIncome(scenario);
  if (income) results.push(income);

  const dti = calcDti(scenario, income?.value ?? null);
  results.push(dti);

  let dscr: CalcResult | undefined;
  if (scenario.incomeDocType === IncomeDocType.Dscr && scenario.dscr) {
    dscr = calcDscr(scenario.dscr, {
      denominator: scenario.interestOnlyRequested ? "itia" : "pitia",
    });
    results.push(dscr);
  }

  const reserves = calcAvailableReserves(scenario);
  results.push(reserves);

  return {
    ltv,
    cltv,
    dti,
    dscr,
    qualifyingMonthlyIncome: income ?? undefined,
    results,
  };
}
