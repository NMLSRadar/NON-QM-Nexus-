import { describe, expect, it } from "vitest";
import {
  calc1099Income,
  calcAssetDepletion,
  calcMonthlyPrincipalAndInterest,
  calcPnlIncome,
  calcToolkitLtv,
  resolveToolkitLtvCap,
  solveMaximumPurchasePrice,
} from "@/domain/calc";

describe("Loan Officer Toolkit domain invariants", () => {
  it("enforces a 90% maximum LTV for Non-QM and Bank Statement", () => {
    expect(resolveToolkitLtvCap({ documentationType: "non_qm", condoClassification: "not_condo" }).maximumLtv).toBe(90);
    expect(resolveToolkitLtvCap({ documentationType: "bank_statement", condoClassification: "not_condo" }).minimumDownPercent).toBe(10);
  });

  it("uses the strictest condominium cap across catalog lenders", () => {
    expect(resolveToolkitLtvCap({ documentationType: "non_qm", condoClassification: "warrantable" }).maximumLtv).toBe(85);
    expect(resolveToolkitLtvCap({ documentationType: "bank_statement", condoClassification: "non_warrantable" }).maximumLtv).toBe(80);
    expect(resolveToolkitLtvCap({ documentationType: "other", condoClassification: "warrantable", programMaximumLtv: 75 }).maximumLtv).toBe(75);
  });

  it("calculates 1099 monthly income with two-year averaging and expenses", () => {
    const result = calc1099Income({ yearOneTotal: 180_000, yearTwoTotal: 210_000, months: 24, expenseFactorPercent: 20 });
    expect(result.averagedAnnualIncome).toBe(195_000);
    expect(result.expenseAmountUsed).toBe(39_000);
    expect(result.qualifyingMonthlyIncome).toBe(13_000);
    expect(result.declining).toBe(false);
  });

  it("returns stable amortizing payment math", () => {
    expect(calcMonthlyPrincipalAndInterest(600_000, 7.25, 30)).toBe(4093.06);
    expect(calcMonthlyPrincipalAndInterest(120_000, 0, 30)).toBe(333.33);
  });

  it("carries the approved P&L Only documentation rule", () => {
    const result = calcPnlIncome({ periodMonths: 12, grossRevenue: 600_000, expenseAmount: 240_000, ownershipPercent: 100 });
    expect(result.value).toBe(30_000);
    expect(result.notes?.join(" ")).toContain("tax returns are never required");
    expect(result.notes?.join(" ")).toContain("CPA attestation");
  });

  it("credits cryptocurrency at exactly 60% in asset depletion", () => {
    const result = calcAssetDepletion({ cryptocurrency: 100_000, assetDivisorMonths: 120 });
    expect(result.inputs?.cryptocurrencyEligible).toBe(60_000);
    expect(result.inputs?.eligibleAssets).toBe(60_000);
    expect(result.value).toBe(500);
  });

  it("applies the required asset-depletion eligibility percentages", () => {
    const result = calcAssetDepletion({
      checkingSavings: 100_000,
      publiclyTradedStocks: 100_000,
      bonds: 100_000,
      bondsInvestmentGrade: true,
      mutualFunds: 100_000,
      cryptocurrency: 100_000,
      retirement: 100_000,
      assetDivisorMonths: 100,
    });

    expect(result.inputs?.checkingSavingsEligible).toBe(100_000);
    expect(result.inputs?.publiclyTradedStocksEligible).toBe(80_000);
    expect(result.inputs?.bondsEligible).toBe(80_000);
    expect(result.inputs?.mutualFundsEligible).toBe(80_000);
    expect(result.inputs?.cryptocurrencyEligible).toBe(60_000);
    expect(result.inputs?.retirementAdjusted).toBe(70_000);
    expect(result.inputs?.eligibleAssets).toBe(470_000);
    expect(result.value).toBe(4_700);
  });

  it("excludes below-investment-grade bonds", () => {
    const result = calcAssetDepletion({ bonds: 100_000, bondsInvestmentGrade: false, assetDivisorMonths: 120 });
    expect(result.inputs?.bondsEligible).toBe(0);
    expect(result.inputs?.eligibleAssets).toBe(0);
    expect(result.value).toBe(0);
    expect(result.notes?.join(" ")).toContain("below-investment-grade");
  });

  it("calculates LTV, CLTV and the strictest applicable cap", () => {
    const result = calcToolkitLtv({ purchasePrice: 850_000, appraisedValue: 875_000, loanAmount: 680_000, subordinateLiens: 20_000, documentationType: "non_qm", condoClassification: "warrantable" });
    expect(result.valueBasis).toBe(850_000);
    expect(result.ltv).toBe(80);
    expect(result.cltv).toBeCloseTo(82.353, 3);
    expect(result.cap.maximumLtv).toBe(85);
    expect(result.maximumLoanAmount).toBe(722_500);
  });

  it("subtracts fixed monthly property expenses from Reverse Solver capacity", () => {
    const withoutHousingExpenses = solveMaximumPurchasePrice({ availableCash: 1_000_000, closingCostPercent: 3, reserveAmount: 0, documentationType: "non_qm", condoClassification: "not_condo", qualifyingMonthlyIncome: 14_000, monthlyLiabilities: 2_500, maximumDtiPercent: 50, proposedMonthlyPaymentPer100k: 682.18 });
    const withHousingExpenses = solveMaximumPurchasePrice({ availableCash: 1_000_000, closingCostPercent: 3, reserveAmount: 0, documentationType: "non_qm", condoClassification: "not_condo", qualifyingMonthlyIncome: 14_000, monthlyLiabilities: 2_500, maximumDtiPercent: 50, proposedMonthlyPaymentPer100k: 682.18, monthlyHousingExpenses: 1_150 });
    expect(withHousingExpenses.constraintLimits.income).toBeLessThan(withoutHousingExpenses.constraintLimits.income!);
    expect(withHousingExpenses.assumptions.join(" ")).toContain("$1150");
  });

  it("selects the lowest independently evaluated Reverse Solver constraint", () => {
    const result = solveMaximumPurchasePrice({
      availableCash: 120_000,
      closingCostPercent: 3,
      reserveAmount: 30_000,
      documentationType: "non_qm",
      condoClassification: "not_condo",
      qualifyingMonthlyIncome: 18_000,
      monthlyLiabilities: 1_800,
      maximumDtiPercent: 50,
      qualifyingMonthlyRent: 6_000,
      minimumDscr: 1,
      proposedMonthlyPaymentPer100k: 750,
    });
    expect(result.bindingConstraint).toBe("cash");
    expect(result.maximumPurchasePrice).toBeCloseTo(692_307.69, 2);
    expect(result.appliedMaximumLtv).toBe(90);
    expect(result.requiredDownPayment).toBeCloseTo(69_230.77, 2);
  });
});
