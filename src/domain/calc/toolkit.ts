import { money, round2, roundTo, safeDivide } from "../money";

export function calcMonthlyPrincipalAndInterest(loanAmount: number, annualRatePercent: number, termYears: number): number {
  const principal = money(loanAmount);
  const months = money(termYears).times(12);
  if (principal.lte(0) || months.lte(0)) return 0;
  const monthlyRate = money(annualRatePercent).dividedBy(100).dividedBy(12);
  if (monthlyRate.isZero()) return round2(principal.dividedBy(months));
  const factor = monthlyRate.times(monthlyRate.plus(1).pow(months.toNumber())).dividedBy(
    monthlyRate.plus(1).pow(months.toNumber()).minus(1),
  );
  return round2(principal.times(factor));
}

export type CondoClassification = "not_condo" | "warrantable" | "non_warrantable";
export type DocumentationType = "non_qm" | "bank_statement" | "other";

export interface LtvCapInput {
  documentationType: DocumentationType;
  condoClassification: CondoClassification;
  programMaximumLtv?: number;
}

export interface LtvCapResult {
  maximumLtv: number;
  minimumDownPercent: number;
  evaluatedCaps: Array<{ label: string; maximumLtv: number }>;
  bindingReason: string;
}

/** Catalog-wide invariant resolver. The strictest applicable cap always wins. */
export function resolveToolkitLtvCap(input: LtvCapInput): LtvCapResult {
  const caps: Array<{ label: string; maximumLtv: number }> = [];
  if (input.programMaximumLtv != null) {
    caps.push({ label: "Selected program", maximumLtv: input.programMaximumLtv });
  }
  if (input.documentationType === "non_qm" || input.documentationType === "bank_statement") {
    caps.push({ label: "Non-QM / Bank Statement minimum 10% down", maximumLtv: 90 });
  }
  if (input.condoClassification === "warrantable") {
    caps.push({ label: "Warrantable condominium", maximumLtv: 85 });
  }
  if (input.condoClassification === "non_warrantable") {
    caps.push({ label: "Non-warrantable condominium", maximumLtv: 80 });
  }
  if (caps.length === 0) caps.push({ label: "No toolkit overlay", maximumLtv: 100 });
  const binding = caps.reduce((lowest, cap) => (cap.maximumLtv < lowest.maximumLtv ? cap : lowest));
  return {
    maximumLtv: binding.maximumLtv,
    minimumDownPercent: roundTo(money(100).minus(binding.maximumLtv), 3),
    evaluatedCaps: caps,
    bindingReason: binding.label,
  };
}

export interface ToolkitLtvInput extends LtvCapInput {
  purchasePrice: number;
  appraisedValue: number;
  loanAmount: number;
  subordinateLiens?: number;
  requestedCashOut?: number;
  estimatedCosts?: number;
  payoffAmount?: number;
}

export interface ToolkitLtvResult {
  valueBasis: number;
  ltv: number | null;
  cltv: number | null;
  maximumLoanAmount: number;
  requiredDownPayment: number;
  netCashOut: number;
  cap: LtvCapResult;
}

export function calcToolkitLtv(input: ToolkitLtvInput): ToolkitLtvResult {
  const valueBasis = Math.min(input.purchasePrice || input.appraisedValue, input.appraisedValue || input.purchasePrice);
  const cap = resolveToolkitLtvCap(input);
  const ltvRatio = valueBasis > 0 ? money(input.loanAmount).dividedBy(valueBasis).times(100) : null;
  const cltvRatio = valueBasis > 0
    ? money(input.loanAmount).plus(input.subordinateLiens ?? 0).dividedBy(valueBasis).times(100)
    : null;
  const maximumLoan = money(valueBasis).times(money(cap.maximumLtv).dividedBy(100));
  return {
    valueBasis: round2(valueBasis),
    ltv: ltvRatio == null ? null : roundTo(ltvRatio, 3),
    cltv: cltvRatio == null ? null : roundTo(cltvRatio, 3),
    maximumLoanAmount: round2(maximumLoan),
    requiredDownPayment: round2(money(valueBasis).minus(maximumLoan)),
    netCashOut: round2(
      money(input.requestedCashOut ?? input.loanAmount)
        .minus(input.payoffAmount ?? 0)
        .minus(input.estimatedCosts ?? 0),
    ),
    cap,
  };
}

export interface Income1099Input {
  yearOneTotal: number;
  yearTwoTotal?: number;
  months: 12 | 24;
  expenseFactorPercent?: number;
  documentedAnnualExpenses?: number;
}

export interface Income1099Result {
  averagedAnnualIncome: number;
  qualifyingMonthlyIncome: number;
  expenseAmountUsed: number;
  yearOverYearChangePercent: number | null;
  declining: boolean;
  formula: string;
}

export function calc1099Income(input: Income1099Input): Income1099Result {
  const yearOne = money(input.yearOneTotal);
  const hasSecondYear = input.months === 24 && input.yearTwoTotal != null;
  const yearTwo = money(hasSecondYear ? input.yearTwoTotal! : input.yearOneTotal);
  const averagedGross = hasSecondYear ? yearOne.plus(yearTwo).dividedBy(2) : yearOne;
  const expense = input.documentedAnnualExpenses != null
    ? money(input.documentedAnnualExpenses)
    : averagedGross.times(money(input.expenseFactorPercent ?? 0).dividedBy(100));
  const annual = averagedGross.minus(expense);
  const monthly = annual.dividedBy(12);
  const change = hasSecondYear && !yearOne.isZero()
    ? yearTwo.minus(yearOne).dividedBy(yearOne).times(100)
    : null;
  return {
    averagedAnnualIncome: round2(averagedGross),
    qualifyingMonthlyIncome: round2(monthly),
    expenseAmountUsed: round2(expense),
    yearOverYearChangePercent: change == null ? null : roundTo(change, 2),
    declining: change != null ? change.isNegative() : false,
    formula: "qualifying monthly income = (averaged 1099 income − documented or factor-based expenses) ÷ 12",
  };
}

export interface ReverseSolverInput {
  availableCash: number;
  closingCostPercent: number;
  reserveAmount: number;
  documentationType: DocumentationType;
  condoClassification: CondoClassification;
  programMaximumLtv?: number;
  qualifyingMonthlyIncome?: number;
  monthlyLiabilities?: number;
  maximumDtiPercent?: number;
  qualifyingMonthlyRent?: number;
  minimumDscr?: number;
  proposedMonthlyPaymentPer100k?: number;
}

export interface ReverseSolverResult {
  maximumPurchasePrice: number;
  maximumLoanAmount: number;
  requiredDownPayment: number;
  bindingConstraint: "cash" | "income" | "dscr";
  constraintLimits: { cash: number; income: number | null; dscr: number | null };
  appliedMaximumLtv: number;
  minimumDownPercent: number;
  assumptions: string[];
}

/**
 * Deterministic first-release reverse solver. Each track independently derives
 * a purchase-price ceiling; the minimum valid ceiling is the binding result.
 */
export function solveMaximumPurchasePrice(input: ReverseSolverInput): ReverseSolverResult {
  const cap = resolveToolkitLtvCap(input);
  const downFraction = money(100).minus(cap.maximumLtv).dividedBy(100);
  const closingFraction = money(input.closingCostPercent).dividedBy(100);
  const cashAvailableForPrice = money(input.availableCash).minus(input.reserveAmount);
  const cashDenominator = downFraction.plus(closingFraction);
  const cashLimitDecimal = cashDenominator.lte(0)
    ? money(0)
    : cashAvailableForPrice.dividedBy(cashDenominator);
  const cashLimit = round2(cashLimitDecimal.isNegative() ? 0 : cashLimitDecimal);

  const paymentPer100k = money(input.proposedMonthlyPaymentPer100k ?? 750);
  const ltvFraction = money(cap.maximumLtv).dividedBy(100);

  let incomeLimit: number | null = null;
  if (input.qualifyingMonthlyIncome != null && input.maximumDtiPercent != null) {
    const maxHousing = money(input.qualifyingMonthlyIncome)
      .times(money(input.maximumDtiPercent).dividedBy(100))
      .minus(input.monthlyLiabilities ?? 0);
    const loan = maxHousing.lte(0) ? money(0) : maxHousing.dividedBy(paymentPer100k).times(100_000);
    const purchase = safeDivide(loan, ltvFraction);
    incomeLimit = purchase == null ? null : round2(purchase);
  }

  let dscrLimit: number | null = null;
  if (input.qualifyingMonthlyRent != null && input.minimumDscr != null && input.minimumDscr > 0) {
    const maxPayment = money(input.qualifyingMonthlyRent).dividedBy(input.minimumDscr);
    const loan = maxPayment.dividedBy(paymentPer100k).times(100_000);
    const purchase = safeDivide(loan, ltvFraction);
    dscrLimit = purchase == null ? null : round2(purchase);
  }

  const candidates: Array<{ type: "cash" | "income" | "dscr"; value: number }> = [
    { type: "cash", value: cashLimit },
  ];
  if (incomeLimit != null) candidates.push({ type: "income", value: incomeLimit });
  if (dscrLimit != null) candidates.push({ type: "dscr", value: dscrLimit });
  const binding = candidates.reduce((lowest, candidate) => (candidate.value < lowest.value ? candidate : lowest));
  const purchase = money(binding.value);
  const loan = purchase.times(ltvFraction);
  const down = purchase.minus(loan);

  return {
    maximumPurchasePrice: round2(purchase),
    maximumLoanAmount: round2(loan),
    requiredDownPayment: round2(down),
    bindingConstraint: binding.type,
    constraintLimits: { cash: cashLimit, income: incomeLimit, dscr: dscrLimit },
    appliedMaximumLtv: cap.maximumLtv,
    minimumDownPercent: cap.minimumDownPercent,
    assumptions: [
      `Closing costs assumed at ${roundTo(input.closingCostPercent, 2)}%.`,
      `Payment factor assumed at $${round2(paymentPer100k)} per $100,000 of loan amount.`,
      `${cap.bindingReason} is the binding LTV overlay.`,
    ],
  };
}
