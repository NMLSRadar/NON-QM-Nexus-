import type { PnlDetails } from "../types/scenario";
import type { CalcResult } from "../types/results";
import { money, round2, safeDivide } from "../money";

/**
 * P&L-only qualifying income.
 *
 * Base formula (configurable):
 *   net business income × ownership% ÷ covered months = monthly qualifying income
 *
 * Net income is taken directly when provided, otherwise derived as
 * grossRevenue − expenseAmount.
 */
export function calcPnlIncome(details: PnlDetails): CalcResult {
  const netIncome =
    details.netIncome != null
      ? money(details.netIncome)
      : money(details.grossRevenue ?? 0).minus(details.expenseAmount ?? 0);

  const ownershipPct = details.ownershipPercent ?? 100;
  const ownershipFactor = money(ownershipPct).dividedBy(100);
  const months = details.periodMonths > 0 ? details.periodMonths : 12;

  const monthly = safeDivide(netIncome.times(ownershipFactor), months);
  const value = monthly ? round2(monthly) : null;

  const notes: string[] = [];
  notes.push("P&L Only: tax returns are never required; the P&L is the income document. CPA attestation, when applicable, confirms tax filing only.");
  if (details.bankDepositVariancePercent != null && Math.abs(details.bankDepositVariancePercent) > 10) {
    notes.push(
      `P&L revenue vs. bank deposits vary by ${details.bankDepositVariancePercent}% — reconcile before qualifying.`,
    );
  }
  if (details.obviousExpensesMissing) {
    notes.push("Obvious industry expense categories appear missing from the P&L — underwriter scrutiny likely.");
  }
  if (!details.supportingBankStatements) {
    notes.push("No supporting business bank statements indicated — most programs require them alongside a P&L.");
  }
  if (details.preparer === "borrower") {
    notes.push("P&L prepared by borrower; many programs require CPA/EA preparation.");
  }

  return {
    key: "pnl_income",
    label: "P&L Qualifying Income",
    value,
    unit: "usd",
    formula: "income = net business income × ownership% ÷ covered months",
    inputs: {
      netIncome: netIncome.toNumber(),
      grossRevenue: details.grossRevenue ?? null,
      expenseAmount: details.expenseAmount ?? null,
      ownershipPercent: ownershipPct,
      coveredMonths: months,
    },
    notes,
  };
}
