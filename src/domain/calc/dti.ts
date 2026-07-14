import type { Scenario } from "../types/scenario";
import type { CalcResult } from "../types/results";
import { money, ratioAsPercent } from "../money";

/**
 * DTI = total qualifying monthly obligations ÷ total qualifying monthly income.
 *
 * Obligations = proposed subject-property housing payment (PITIA) + other
 * monthly liabilities. Income is the resolved qualifying monthly income for the
 * scenario's documentation method (passed in so DTI never re-derives income).
 */
export function calcDti(scenario: Scenario, qualifyingMonthlyIncome: number | null): CalcResult {
  const housing = scenario.monthlyHousingPayment ?? 0;
  const otherLiabilities = scenario.monthlyLiabilities ?? 0;
  const totalObligations = money(housing).plus(otherLiabilities).toNumber();

  const dti =
    qualifyingMonthlyIncome != null && qualifyingMonthlyIncome > 0
      ? ratioAsPercent(totalObligations, qualifyingMonthlyIncome, 2)
      : null;

  return {
    key: "dti",
    label: "Debt-to-Income (DTI)",
    value: dti,
    unit: "percent",
    formula: "DTI = (proposed housing payment + other monthly liabilities) ÷ qualifying monthly income × 100",
    inputs: {
      proposedHousingPayment: housing,
      otherMonthlyLiabilities: otherLiabilities,
      totalMonthlyObligations: totalObligations,
      qualifyingMonthlyIncome: qualifyingMonthlyIncome ?? null,
    },
    notes:
      qualifyingMonthlyIncome == null
        ? ["DTI not computed: no qualifying income (e.g. DSCR programs qualify on the property, not borrower income)."]
        : undefined,
  };
}
