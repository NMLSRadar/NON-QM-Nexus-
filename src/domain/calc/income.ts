import { IncomeDocType } from "../types/enums";
import type { Scenario } from "../types/scenario";
import type { CalcResult } from "../types/results";
import { calcBankStatementIncome } from "./bankStatement";
import { calcPnlIncome } from "./pnl";
import { calcAssetDepletion } from "./assetDepletion";

/**
 * Resolve the borrower's qualifying monthly income based on the scenario's
 * income-documentation method. Returns null for DSCR (which qualifies on the
 * property, not borrower income) and when insufficient data is present.
 */
export function calcQualifyingMonthlyIncome(scenario: Scenario): CalcResult | null {
  switch (scenario.incomeDocType) {
    case IncomeDocType.BankStatement:
      return scenario.bankStatement ? calcBankStatementIncome(scenario.bankStatement) : null;
    case IncomeDocType.ProfitAndLoss:
      return scenario.pnl ? calcPnlIncome(scenario.pnl) : null;
    case IncomeDocType.AssetDepletion:
      return scenario.assetDepletion
        ? calcAssetDepletion(scenario.assetDepletion, {
            deductClosingCosts: true,
            deductDownPayment: true,
            deductReserves: true,
          })
        : null;
    case IncomeDocType.Dscr:
      return null; // property-qualified
    case IncomeDocType.FullDoc:
    case IncomeDocType.Income1099:
    case IncomeDocType.WvoeOnly:
      if (scenario.documentedMonthlyIncome == null) return null;
      return {
        key: "documented_income",
        label: "Documented Qualifying Income",
        value: scenario.documentedMonthlyIncome,
        unit: "usd",
        formula: "income = documented monthly qualifying income (per income documents)",
        inputs: {
          documentedMonthlyIncome: scenario.documentedMonthlyIncome,
          incomeDocType: scenario.incomeDocType,
        },
        notes: ["Subject to underwriter income calculation from the actual documents."],
      };
    default:
      return null;
  }
}
