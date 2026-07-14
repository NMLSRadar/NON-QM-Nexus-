import type { Scenario } from "../types/scenario";
import type { CalcResult } from "../types/results";
import { money, safeDivide, sum } from "../money";

/**
 * Available reserves expressed in months of the proposed housing payment (PITIA).
 * Reserves = eligible liquid assets ÷ monthly housing payment.
 *
 * Retirement assets are typically counted at a haircut; we include them at 70%
 * by default and disclose that. Down payment/closing needs are the caller's
 * responsibility to net out via `postCloseLiquid` if desired.
 */
export function calcAvailableReserves(scenario: Scenario, retirementHaircutPercent = 30): CalcResult {
  const liquid = scenario.liquidAssets ?? 0;
  const retirement = money(scenario.retirementAssets ?? 0)
    .times(money(100 - retirementHaircutPercent).dividedBy(100))
    .toNumber();
  const other = scenario.otherEligibleAssets ?? 0;
  const totalEligible = sum([liquid, retirement, other]).toNumber();

  const housing = scenario.monthlyHousingPayment ?? 0;
  const monthsQ = housing > 0 ? safeDivide(totalEligible, housing) : null;
  const months = monthsQ ? monthsQ.toDecimalPlaces(1).toNumber() : null;

  return {
    key: "available_reserves_months",
    label: "Available Reserves",
    value: months,
    unit: "months",
    formula: "reserves (months) = (liquid + retirement×(1−haircut) + other eligible) ÷ monthly housing payment",
    inputs: {
      liquidAssets: liquid,
      retirementAssets: scenario.retirementAssets ?? 0,
      retirementHaircutPercent,
      otherEligibleAssets: other,
      totalEligibleReserves: totalEligible,
      monthlyHousingPayment: housing,
    },
  };
}
