import { describe, expect, it } from "vitest";
import { classifyBankStatementComplexity } from "@/domain/matching/bankStatementComplexity";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s1",
    organizationId: "org1",
    name: "Test",
    createdByUserId: "u1",
    loanPurpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    citizenship: "us_citizen",
    fico: 740,
    vesting: "individual",
    incomeDocType: "bank_statement",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  } as Scenario;
}

function calc(ltv?: number): CalculationSummary {
  return { ltv: ltv != null ? { value: ltv } : undefined, results: [] } as unknown as CalculationSummary;
}

describe("Bank statement file complexity classifier", () => {
  it("classifies a strong, conservative, no-complication file as Clean and Straightforward", () => {
    const result = classifyBankStatementComplexity(scenario({ fico: 760 }), calc(70));
    expect(result.classification).toBe("clean");
    expect(result.label).toBe("Clean and Straightforward");
    expect(result.flags).toHaveLength(0);
  });

  it("a single moderate flag (LTV > 80) alone classifies as Moderate Guideline Complexity", () => {
    const result = classifyBankStatementComplexity(scenario(), calc(85));
    expect(result.classification).toBe("moderate_complexity");
  });

  it("does not treat first-time-homebuyer status as generic complexity at 80% LTV or below", () => {
    const result = classifyBankStatementComplexity(scenario({ firstTimeHomebuyer: true }), calc(75));
    expect(result.classification).toBe("clean");
    expect(result.flags.some((flag) => flag.label.includes("First-time homebuyer"))).toBe(false);
  });

  it("shows the 12-month rental-history notice for a first-time homebuyer above 80% LTV", () => {
    const result = classifyBankStatementComplexity(scenario({ firstTimeHomebuyer: true }), calc(85));
    expect(result.classification).toBe("moderate_complexity");
    expect(result.flags).toContainEqual({ label: "First-time homebuyer above 80% LTV", severity: "moderate" });
    expect(result.explanation).toContain(
      "The majority of lenders may request 12 months of proof of payment for the borrower's rental history because they are a first-time homebuyer above 80.01% LTV.",
    );
  });

  it("multiple compounding moderate flags classify as High Guideline Complexity", () => {
    const result = classifyBankStatementComplexity(
      scenario({
        fico: 670, // moderate
        firstTimeHomebuyer: true, // moderate above 80% LTV
        vesting: "llc", // moderate
      }),
      calc(85),
    );
    expect(result.classification).toBe("high_complexity");
  });

  it("a declining deposit trend (a HIGH-severity flag) alone pushes to High Guideline Complexity", () => {
    const result = classifyBankStatementComplexity(
      scenario({ bankStatement: { personalOrBusiness: "business", months: 12, depositsDeclining: true } }),
      calc(75),
    );
    expect(result.classification).toBe("high_complexity");
  });

  it("a recent bankruptcy (a SEVERE flag) alone triggers Manual Review Recommended", () => {
    const result = classifyBankStatementComplexity(
      scenario({ creditEvents: { bankruptcyMonthsSinceDischarge: 12 } }),
      calc(75),
    );
    expect(result.classification).toBe("manual_review_recommended");
  });

  it("three or more HIGH-severity flags together trigger Manual Review Recommended even with no single severe flag", () => {
    const result = classifyBankStatementComplexity(
      scenario({
        citizenship: "foreign_national", // high
        creditEvents: { mortgageLates30x12: 1 }, // high
        bankStatement: { personalOrBusiness: "business", months: 12, depositsDeclining: true, hasComingling: true }, // high, high
      }),
      calc(70),
    );
    expect(result.classification).toBe("manual_review_recommended");
  });

  it("the explanation quotes the real flags that drove the classification", () => {
    const result = classifyBankStatementComplexity(scenario(), calc(85));
    expect(result.explanation.toLowerCase()).toContain("ltv");
  });

  it("an aggressive expense factor request (below 20%) is a real HIGH flag", () => {
    const result = classifyBankStatementComplexity(
      scenario({ bankStatement: { personalOrBusiness: "business", months: 12, expenseFactorPercent: 10 } }),
      calc(75),
    );
    expect(result.classification).toBe("high_complexity");
    expect(result.flags.some((f) => f.label.includes("expense factor"))).toBe(true);
  });

  it("a recently formed business (< 24 months) is a real HIGH flag", () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 6);
    const result = classifyBankStatementComplexity(
      scenario({
        bankStatement: { personalOrBusiness: "business", months: 12, businessStartDate: recent.toISOString() },
      }),
      calc(70),
    );
    expect(result.classification).toBe("high_complexity");
  });

  it("non-warrantable condo alone is a moderate flag, not clean", () => {
    const result = classifyBankStatementComplexity(scenario({ propertyType: "non_warrantable_condo" }), calc(75));
    expect(result.classification).toBe("moderate_complexity");
  });
});
