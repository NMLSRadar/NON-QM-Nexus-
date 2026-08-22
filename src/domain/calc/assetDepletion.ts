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
 *   eligible assets = checking/savings/money market × 100%
 *                     + publicly traded stocks × 80%
 *                     + eligible investment-grade bonds × 80%
 *                     + mutual funds × 80%
 *                     + cryptocurrency × 60%
 *                     + vested retirement accounts × 70%
 *                     + legacy unclassified brokerage assets
 *                     + real-estate equity (if configured)
 *   net eligible    = eligible assets − down payment − closing costs − reserves (as configured)
 *   monthly income  = net eligible ÷ divisor months
 */
export function calcAssetDepletion(
  details: AssetDepletionDetails,
  config: AssetDepletionConfig = {},
): CalcResult {
  const legacyEligiblePct = money(config.eligibleAssetPercentOverride ?? details.eligibleAssetPercent ?? 100).dividedBy(100);
  const retirementAdditionalHaircut = money(config.retirementHaircutPercent ?? 0).dividedBy(100);

  const checkingEligible = money(details.checkingSavings ?? 0);
  const legacyBrokerageEligible = money(details.brokerage ?? 0).times(legacyEligiblePct);
  const stockAmount = details.publiclyTradedStocks ?? details.stocksBonds ?? 0;
  const stocksEligible = money(stockAmount).times(0.8);
  const bondsEligible = details.bondsInvestmentGrade === true
    ? money(details.bonds ?? 0).times(0.8)
    : ZERO;
  const mutualFundsEligible = money(details.mutualFunds ?? 0).times(0.8);

  // Retirement accounts (401(k), IRA, SEP and KEOGH): 70% of the vested balance.
  const vested = money(details.retirementVestedPercent ?? 100).dividedBy(100);
  const retirementBase = money(details.retirement ?? 0)
    .times(vested)
    .times(0.7)
    .times(money(1).minus(retirementAdditionalHaircut));

  const cryptocurrencyEligible = money(details.cryptocurrency ?? 0).times(0.6);
  const realEstate = config.includeRealEstateEquity ? money(details.realEstateEquity ?? 0) : ZERO;

  const eligibleAssets = sum([
    checkingEligible,
    legacyBrokerageEligible,
    stocksEligible,
    bondsEligible,
    mutualFundsEligible,
    cryptocurrencyEligible,
    retirementBase,
    realEstate,
  ]);

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
  if ((details.bonds ?? 0) > 0 && details.bondsInvestmentGrade !== true) {
    notes.push("Bonds excluded: only eligible investment-grade bonds receive 80% credit; below-investment-grade corporate and municipal bonds are ineligible.");
  }
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
    formula: "income = (cash at 100% + publicly traded stocks at 80% + eligible investment-grade bonds at 80% + mutual funds at 80% + cryptocurrency at 60% + vested retirement at 70% + optional eligible assets − deductions) ÷ divisor months",
    inputs: {
      checkingSavingsEligible: round2(checkingEligible),
      legacyBrokerageEligible: round2(legacyBrokerageEligible),
      publiclyTradedStocksEligible: round2(stocksEligible),
      bondsEligible: round2(bondsEligible),
      mutualFundsEligible: round2(mutualFundsEligible),
      cryptocurrencyEligible: round2(cryptocurrencyEligible),
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
