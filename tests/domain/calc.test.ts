import { describe, expect, it } from "vitest";
import { calcLtv, calcCltv } from "@/domain/calc/ltv";
import { calcDti } from "@/domain/calc/dti";
import { calcDscr } from "@/domain/calc/dscr";
import { calcBankStatementIncome } from "@/domain/calc/bankStatement";
import { calcPnlIncome } from "@/domain/calc/pnl";
import { calcAssetDepletion } from "@/domain/calc/assetDepletion";
import { calcAvailableReserves } from "@/domain/calc/reserves";
import type { Scenario } from "@/domain/types/scenario";

function scenario(overrides: Partial<Scenario>): Scenario {
  return {
    id: "t",
    organizationId: "org_demo",
    name: "test",
    createdByUserId: "u",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("LTV", () => {
  it("uses lower of price or value on purchase by default", () => {
    const r = calcLtv(scenario({ loanPurpose: "purchase", purchasePrice: 400_000, estimatedValue: 410_000, requestedLoanAmount: 300_000 }));
    expect(r.value).toBe(75); // 300k / 400k
  });

  it("can be configured to use appraised value", () => {
    const r = calcLtv(
      scenario({ loanPurpose: "purchase", purchasePrice: 400_000, estimatedValue: 410_000, requestedLoanAmount: 300_000 }),
      "appraised_value",
    );
    expect(r.value).toBeCloseTo(73.171, 3);
  });

  it("uses estimated value on refinance", () => {
    const r = calcLtv(scenario({ loanPurpose: "cash_out_refinance", estimatedValue: 500_000, requestedLoanAmount: 350_000 }));
    expect(r.value).toBe(70);
  });

  it("returns null when value missing", () => {
    const r = calcLtv(scenario({ loanPurpose: "purchase", requestedLoanAmount: 300_000 }));
    expect(r.value).toBeNull();
  });

  it("avoids floating-point drift", () => {
    const r = calcLtv(scenario({ loanPurpose: "purchase", purchasePrice: 300_000, estimatedValue: 300_000, requestedLoanAmount: 100_000 }));
    expect(r.value).toBeCloseTo(33.333, 3);
  });
});

describe("CLTV", () => {
  it("includes subordinate liens", () => {
    const r = calcCltv(scenario({ loanPurpose: "purchase", purchasePrice: 400_000, estimatedValue: 400_000, requestedLoanAmount: 300_000, existingLienBalance: 40_000 }));
    expect(r.value).toBe(85);
  });

  it("equals LTV when no subordinate liens", () => {
    const s = scenario({ loanPurpose: "purchase", purchasePrice: 400_000, estimatedValue: 400_000, requestedLoanAmount: 300_000 });
    expect(calcCltv(s).value).toBe(calcLtv(s).value);
  });
});

describe("DTI", () => {
  it("computes obligations / income", () => {
    const r = calcDti(scenario({ monthlyHousingPayment: 3_000, monthlyLiabilities: 1_000 }), 10_000);
    expect(r.value).toBe(40);
  });

  it("is null with no income", () => {
    const r = calcDti(scenario({ monthlyHousingPayment: 3_000 }), null);
    expect(r.value).toBeNull();
  });

  it("is null with zero income (no divide-by-zero)", () => {
    const r = calcDti(scenario({ monthlyHousingPayment: 3_000 }), 0);
    expect(r.value).toBeNull();
  });
});

describe("DSCR", () => {
  const details = {
    monthlyLease: 2_000,
    marketRent: 2_100,
    principalAndInterest: 1_200,
    annualTaxes: 2_400,
    annualHazardInsurance: 1_200,
    monthlyHoa: 100,
  };

  it("uses lower of lease or market by default with PITIA", () => {
    // housing expense = 1200 + 200 + 100 + 100 = 1600; rent = 2000
    const r = calcDscr(details);
    expect(r.value).toBe(1.25);
  });

  it("supports market-only basis", () => {
    const r = calcDscr(details, { rentBasis: "market_only" });
    expect(r.value).toBe(1.313); // 2100/1600 = 1.3125, rounded half-up to 3 places
  });

  it("supports ITIA denominator for interest-only", () => {
    const r = calcDscr({ ...details, interestOnlyPayment: 900 }, { denominator: "itia" });
    // housing = 900 + 200 + 100 + 100 = 1300
    expect(r.value).toBeCloseTo(1.538, 3);
  });

  it("returns null when housing expense is zero", () => {
    const r = calcDscr({ monthlyLease: 2_000 });
    expect(r.value).toBeNull();
  });

  it("falls back to the populated rent when one side is missing", () => {
    const r = calcDscr({ marketRent: 1_600, principalAndInterest: 1_600 });
    expect(r.value).toBe(1);
  });
});

describe("Bank-statement income", () => {
  it("applies ownership and expense factor for business statements", () => {
    const r = calcBankStatementIncome({
      personalOrBusiness: "business",
      months: 12,
      ownershipPercent: 50,
      averageMonthlyEligibleDeposits: 42_000,
      expenseFactorPercent: 30,
      expenseFactorSource: "cpa",
    });
    // 42000 × 0.5 × 0.7 = 14700
    expect(r.value).toBe(14_700);
  });

  it("does not apply ownership to personal statements", () => {
    const r = calcBankStatementIncome({
      personalOrBusiness: "personal",
      months: 12,
      ownershipPercent: 50,
      averageMonthlyEligibleDeposits: 10_000,
      expenseFactorPercent: 0,
    });
    expect(r.value).toBe(10_000);
  });

  it("defaults to a conservative 50% expense factor and flags it", () => {
    const r = calcBankStatementIncome({
      personalOrBusiness: "business",
      months: 24,
      ownershipPercent: 100,
      averageMonthlyEligibleDeposits: 20_000,
    });
    expect(r.value).toBe(10_000);
    expect(r.notes?.some((n) => n.includes("50%"))).toBe(true);
  });

  it("allows a program-level expense-factor override", () => {
    const r = calcBankStatementIncome(
      { personalOrBusiness: "business", months: 12, ownershipPercent: 100, averageMonthlyEligibleDeposits: 10_000, expenseFactorPercent: 20 },
      { expenseFactorOverridePercent: 40 },
    );
    expect(r.value).toBe(6_000);
  });
});

describe("P&L income", () => {
  it("divides net income by covered months with ownership", () => {
    const r = calcPnlIncome({ periodMonths: 12, netIncome: 180_000, ownershipPercent: 100 });
    expect(r.value).toBe(15_000);
  });

  it("derives net income from gross - expenses when not given", () => {
    const r = calcPnlIncome({ periodMonths: 12, grossRevenue: 300_000, expenseAmount: 120_000 });
    expect(r.value).toBe(15_000);
  });

  it("applies partial ownership", () => {
    const r = calcPnlIncome({ periodMonths: 12, netIncome: 120_000, ownershipPercent: 50 });
    expect(r.value).toBe(5_000);
  });

  it("flags borrower-prepared P&L", () => {
    const r = calcPnlIncome({ periodMonths: 12, netIncome: 120_000, preparer: "borrower" });
    expect(r.notes?.some((n) => n.toLowerCase().includes("cpa"))).toBe(true);
  });
});

describe("Asset depletion", () => {
  it("computes income with deductions and divisor", () => {
    const r = calcAssetDepletion(
      {
        checkingSavings: 300_000,
        brokerage: 200_000,
        retirement: 900_000,
        retirementVestedPercent: 100,
        requiredDownPayment: 180_000,
        closingCosts: 15_000,
        requiredReserves: 20_400,
        assetDivisorMonths: 120,
      },
      { deductClosingCosts: true, deductDownPayment: true, deductReserves: true },
    );
    // (500000 + 900000 - 215400) / 120 = 9871.666.. → 9871.67
    expect(r.value).toBe(9_871.67);
  });

  it("applies retirement haircut and vesting", () => {
    const r = calcAssetDepletion(
      { retirement: 100_000, retirementVestedPercent: 80, assetDivisorMonths: 100 },
      { retirementHaircutPercent: 25 },
    );
    // 100000 × 0.8 × 0.75 / 100 = 600
    expect(r.value).toBe(600);
  });

  it("floors net eligible assets at zero", () => {
    const r = calcAssetDepletion(
      { checkingSavings: 10_000, requiredDownPayment: 50_000, assetDivisorMonths: 120 },
      { deductDownPayment: true },
    );
    expect(r.value).toBe(0);
  });

  it("applies eligible-asset percentage haircut to non-retirement assets", () => {
    const r = calcAssetDepletion({ checkingSavings: 120_000, eligibleAssetPercent: 50, assetDivisorMonths: 60 });
    expect(r.value).toBe(1_000);
  });
});

describe("Reserves", () => {
  it("computes months of reserves with retirement haircut", () => {
    const r = calcAvailableReserves(scenario({ liquidAssets: 30_000, retirementAssets: 10_000, monthlyHousingPayment: 3_000 }));
    // (30000 + 7000) / 3000 = 12.3
    expect(r.value).toBe(12.3);
  });

  it("is null without a housing payment", () => {
    const r = calcAvailableReserves(scenario({ liquidAssets: 30_000 }));
    expect(r.value).toBeNull();
  });
});
