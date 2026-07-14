import type { BankStatementDetails } from "../types/scenario";
import type { CalcResult } from "../types/results";
import { money, round2 } from "../money";

export interface BankStatementConfig {
  /** If a program floors/overrides the expense factor, supply it here (percent). */
  expenseFactorOverridePercent?: number;
  /** Whether ownership percentage is applied (business statements typically yes). */
  applyOwnership?: boolean;
}

/**
 * Bank-statement qualifying income.
 *
 * Base formula (configurable per program):
 *   eligible monthly deposits
 *     × ownership% (when applicable)
 *     × (1 − expense factor)
 *   = estimated qualifying monthly income
 *
 * NOTE: this deterministic function never invents an expense factor. If none is
 * provided it defaults to 50% (a conservative placeholder) and flags it, so the
 * result is never silently optimistic.
 */
export function calcBankStatementIncome(
  details: BankStatementDetails,
  config: BankStatementConfig = {},
): CalcResult {
  const deposits = money(details.averageMonthlyEligibleDeposits ?? 0);

  const ownershipApplies = config.applyOwnership ?? details.personalOrBusiness === "business";
  const ownershipPct = ownershipApplies ? (details.ownershipPercent ?? 100) : 100;
  const ownershipFactor = money(ownershipPct).dividedBy(100);

  const rawExpense = config.expenseFactorOverridePercent ?? details.expenseFactorPercent;
  const usedDefaultExpense = rawExpense == null;
  const expensePct = rawExpense ?? 50;
  const expenseFactor = money(expensePct).dividedBy(100);

  const income = deposits
    .times(ownershipFactor)
    .times(money(1).minus(expenseFactor));

  const notes: string[] = [];
  if (usedDefaultExpense) {
    notes.push("No verified expense factor supplied; a conservative 50% default was applied. Verify with a CPA/EA-provided factor.");
  }
  if (details.expenseFactorSource && details.expenseFactorSource !== "cpa" && details.expenseFactorSource !== "ea") {
    notes.push("Expense factor is not CPA/EA-sourced; manual review may be required.");
  }
  if (details.hasCashDeposits || details.hasAtmDeposits) {
    notes.push("Cash/ATM deposits present — subject to program-specific treatment and manual review.");
  }
  if (details.depositsDeclining) {
    notes.push("Deposits are declining — trend analysis and possibly the lower period may apply.");
  }
  if (details.combiningMultipleAccounts || details.hasComingling) {
    notes.push("Multiple accounts / co-mingling flagged — deposits must be de-duplicated and transfers excluded.");
  }

  return {
    key: "bank_statement_income",
    label: "Bank-Statement Qualifying Income",
    value: round2(income),
    unit: "usd",
    formula: "income = eligible monthly deposits × ownership% × (1 − expense factor)",
    inputs: {
      averageMonthlyEligibleDeposits: details.averageMonthlyEligibleDeposits ?? 0,
      ownershipPercent: ownershipPct,
      ownershipApplied: ownershipApplies,
      expenseFactorPercent: expensePct,
      months: details.months,
      statementType: details.personalOrBusiness,
    },
    notes,
  };
}
