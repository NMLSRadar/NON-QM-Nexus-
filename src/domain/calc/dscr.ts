import type { DscrDetails } from "../types/scenario";
import type { CalcResult } from "../types/results";
import { max, min, money, round2, roundTo, safeDivide } from "../money";

export type DscrRentBasis = "lower_of_lease_or_market" | "higher_of_lease_or_market" | "market_only" | "lease_only";
export type DscrDenominator = "pitia" | "itia"; // ITIA for eligible interest-only structures

export interface DscrConfig {
  rentBasis?: DscrRentBasis;
  denominator?: DscrDenominator;
}

/** Qualifying monthly rent per the configured basis. */
export function qualifyingRent(details: DscrDetails, basis: DscrRentBasis): number {
  const lease = details.monthlyLease ?? 0;
  const market = details.marketRent ?? 0;
  switch (basis) {
    case "lease_only":
      return lease;
    case "market_only":
      return market;
    case "higher_of_lease_or_market":
      return max(lease, market).toNumber();
    case "lower_of_lease_or_market":
    default:
      // If either is zero/unknown, fall back to the populated one.
      if (lease === 0) return market;
      if (market === 0) return lease;
      return min(lease, market).toNumber();
  }
}

/**
 * DSCR = qualifying monthly rent ÷ qualifying monthly housing expense.
 * Housing expense (denominator) is PITIA, or ITIA when an eligible
 * interest-only structure is used (principal excluded).
 */
export function calcDscr(details: DscrDetails, config: DscrConfig = {}): CalcResult {
  const basis = config.rentBasis ?? "lower_of_lease_or_market";
  const denom = config.denominator ?? "pitia";

  const rent = qualifyingRent(details, basis);

  const monthlyTaxes = money(details.annualTaxes ?? 0).dividedBy(12);
  const monthlyHazard = money(details.annualHazardInsurance ?? 0).dividedBy(12);
  const monthlyFlood = money(details.annualFloodInsurance ?? 0).dividedBy(12);
  const hoa = money(details.monthlyHoa ?? 0);

  const principalAndInterest =
    denom === "itia"
      ? money(details.interestOnlyPayment ?? 0)
      : money(details.principalAndInterest ?? 0).plus(0); // P&I for PITIA

  const housingExpense = principalAndInterest
    .plus(monthlyTaxes)
    .plus(monthlyHazard)
    .plus(monthlyFlood)
    .plus(hoa);

  const dscr = safeDivide(rent, housingExpense);
  const value = dscr ? roundTo(dscr, 3) : null;

  const notes: string[] = [];
  if (details.shortTermRental) {
    notes.push("Short-term-rental income — many programs require a 12-month operating history or a market-rent haircut.");
  }
  if (value != null && value < 1) {
    notes.push("DSCR below 1.00 indicates negative cash flow; program-specific minimums (often 0.75–1.00) apply.");
  }

  return {
    key: "dscr",
    label: "Debt-Service-Coverage Ratio (DSCR)",
    value,
    unit: "ratio",
    formula: `DSCR = qualifying rent (${basis.replace(/_/g, " ")}) ÷ housing expense (${denom.toUpperCase()})`,
    inputs: {
      qualifyingRent: rent,
      rentBasis: basis,
      denominator: denom,
      principalAndInterestOrIo: principalAndInterest.toNumber(),
      monthlyTaxes: round2(monthlyTaxes),
      monthlyHazard: round2(monthlyHazard),
      monthlyFlood: round2(monthlyFlood),
      monthlyHoa: hoa.toNumber(),
      housingExpense: round2(housingExpense),
    },
    notes,
  };
}
