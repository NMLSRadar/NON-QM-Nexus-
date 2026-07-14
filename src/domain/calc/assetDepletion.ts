import type { AssetDepletionDetails } from "../types/scenario";
import type { CalcResult } from "../types/results";
import { money, round2, safeDivide, sum, ZERO } from "../money";

export interface AssetDepletionConfig {
  eligibleAssetPercentOverride?: number; // haircut on non-retirement assets (0-100)
  retirementHaircutPercent?: number; // additional haircut on retirement (0-100)
  divisorMonthsOverride?: number;
  deductClosingCosts?: boolean;
  deductDownPayment?: boolean;
  deductReserves?: boolean;
  includeRealEstateEquity?: boolean;
}

/**
 * Asset-depletion qualifying income.
 *
 *   eligible assets = (liquid + brokerage + stocks/bonds) × eligible%
 *                     + retirement × (1 − retirement haircut) [age-dependent]
 *                     + real-estate equity (if configured)
 *   net eligible    = eligible assets − down payment − closing costs − reserves (as configured)
 *   monthly income  = net eligible ÷ divisor months
 */
export function calcAssetDepletion(
  details: AssetDepletionDetails,
  config: AssetDepletionConfig = {},
): CalcResult {
  const eligiblePct = money(config.eligibleAssetPercentOverride ?? details.eligibleAssetPercent ?? 100).dividedBy(100);
  const retirementHaircut = money(config.retirementHaircutPercent ?? 0).dividedBy(100);

  const nonRetirement = sum([
    details.checkingSavings ?? 0,
    details.brokerage ?? 0,
    details.stocksBonds ?? 0,
  ]).times(eligiblePct);

  // Retirement assets: apply vested %, then any age-based haircut.
  const vested = money(details.retirementVestedPercent ?? 100).dividedBy(100);
  const retirementBase = money(details.retirement ?? 0).times(vested).times(money(1).minus(retirementHaircut));

  const realEstate = config.includeRealEstateEquity ? money(details.realEstateEquity ?? 0) : ZERO;

  const eligibleAssets = nonRetirement.plus(retirementBase).plus(realEstate);

  let netEligible = eligibleAssets;
  const deductions: Record<string, number> = {};
  if (config.deductDownPayment && details.requiredDownPayment) {
    netEligible = netEligible.minus(details.requiredDownPayment);
    deductions.downPayment = details.requiredDownPayment;
  }
  if (config.deductClosingCosts && details.closingCosts) {
    netEligible = netEligible.minus(details.closingCosts);
    deductions.closingCosts = details.closingCosts;
  }
  if (config.deductReserves && details.requiredReserves) {
    netEligible = netEligible.minus(details.requiredReserves);
    deductions.reserves = details.requiredReserves;
  }
  if (netEligible.isNegative()) netEligible = ZERO;

  const divisor = config.divisorMonthsOverride ?? details.assetDivisorMonths ?? 120;
  const monthly = safeDivide(netEligible, divisor);
  const value = monthly ? round2(monthly) : null;

  const notes: string[] = [];
  if (details.assetsAlsoUsedToClose) {
    notes.push("Assets are also being used to close — down payment/closing costs/reserves must be netted out to avoid double-counting.");
  }
  if (details.borrowerAge != null && details.borrowerAge < 59.5 && (details.retirement ?? 0) > 0) {
    notes.push("Borrower under 59½ with retirement assets — many programs discount retirement funds due to withdrawal penalties.");
  }

  return {
    key: "asset_depletion_income",
    label: "Asset-Depletion Qualifying Income",
    value,
    unit: "usd",
    formula: "income = (eligible non-retirement + adjusted retirement + optional RE equity − deductions) ÷ divisor months",
    inputs: {
      nonRetirementEligible: round2(nonRetirement),
      retirementAdjusted: round2(retirementBase),
      realEstateEquityIncluded: config.includeRealEstateEquity ? (details.realEstateEquity ?? 0) : 0,
      eligibleAssets: round2(eligibleAssets),
      netEligible: round2(netEligible),
      divisorMonths: divisor,
      ...deductions,
    },
    notes,
  };
}
