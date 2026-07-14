import { LoanPurpose } from "../types/enums";
import type { Scenario } from "../types/scenario";
import type { CalcResult } from "../types/results";
import { min, money, ratioAsPercent } from "../money";

export type LtvBasis = "lower_of_price_or_value" | "appraised_value" | "purchase_price";

/**
 * Determine the property value basis used for LTV on a purchase. Refinances
 * always use estimated (appraised) value because there is no purchase price.
 */
export function propertyValueBasis(scenario: Scenario, basis: LtvBasis): number | null {
  const price = scenario.purchasePrice;
  const value = scenario.estimatedValue;

  if (scenario.loanPurpose !== LoanPurpose.Purchase) {
    return value ?? null;
  }

  switch (basis) {
    case "purchase_price":
      return price ?? value ?? null;
    case "appraised_value":
      return value ?? price ?? null;
    case "lower_of_price_or_value":
    default:
      if (price != null && value != null) return min(price, value).toNumber();
      return price ?? value ?? null;
  }
}

export function calcLtv(scenario: Scenario, basis: LtvBasis = "lower_of_price_or_value"): CalcResult {
  const value = propertyValueBasis(scenario, basis);
  const loan = scenario.requestedLoanAmount ?? null;
  const ltv = loan != null && value != null ? ratioAsPercent(loan, value, 3) : null;

  return {
    key: "ltv",
    label: "Loan-to-Value (LTV)",
    value: ltv,
    unit: "percent",
    formula: "LTV = requested loan amount ÷ applicable property value × 100",
    inputs: {
      requestedLoanAmount: loan,
      applicablePropertyValue: value,
      basis,
      loanPurpose: scenario.loanPurpose ?? null,
    },
    notes:
      scenario.loanPurpose === LoanPurpose.Purchase
        ? [`Purchase basis: ${basis.replace(/_/g, " ")}.`]
        : ["Refinance uses estimated/appraised value as the basis."],
  };
}

export function calcCltv(scenario: Scenario, basis: LtvBasis = "lower_of_price_or_value"): CalcResult {
  const value = propertyValueBasis(scenario, basis);
  const requestedLoan = scenario.requestedLoanAmount ?? 0;
  const existingLiens = scenario.existingLienBalance ?? 0;

  // For a purchase the requested loan is the only lien unless subordinate
  // financing is present. For a refinance, total liens = requested loan +
  // any liens that remain (subordinate financing). We model total liens as
  // the greater of (requested loan) and (requested loan + retained subordinate
  // liens); callers supply existingLienBalance as retained subordinate liens.
  const totalLiens = money(requestedLoan).plus(existingLiens).toNumber();
  const cltv = value != null ? ratioAsPercent(totalLiens, value, 3) : null;

  return {
    key: "cltv",
    label: "Combined Loan-to-Value (CLTV)",
    value: cltv,
    unit: "percent",
    formula: "CLTV = (requested loan + subordinate/retained liens) ÷ applicable property value × 100",
    inputs: {
      requestedLoanAmount: requestedLoan,
      subordinateOrRetainedLiens: existingLiens,
      totalLiens,
      applicablePropertyValue: value,
      basis,
    },
  };
}
