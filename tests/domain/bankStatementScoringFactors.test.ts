import { describe, expect, it } from "vitest";
import { computeScore } from "@/domain/matching/score";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary, RuleEvaluationResult } from "@/domain/types/results";

// Per the "Bank Statement Guideline-First Lender Intelligence" spec
// (2026-07-28): a clean-file-execution boost (e.g. United Wholesale
// Mortgage) must ONLY apply on a "clean" file, and a guideline-flexibility
// boost (Orion, GreenBox, Acra, Forward Lending, Cake Mortgage, LendSure,
// Champions Funding) must ONLY apply on a moderate/high/manual-review file
// — never the other way around, and never overriding real eligibility.
function baseProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "p1",
    lenderId: "l1",
    organizationId: "org1",
    name: "Test Bank Statement Program",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase"],
    occupancies: ["primary"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 3_000_000,
    minFico: 660,
    baseMaxLtv: 90,
    minReservesMonths: 6,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "g1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "test",
    ...overrides,
  };
}

const scenario: Scenario = { loanPurpose: "purchase", incomeDocType: "bank_statement" } as Scenario;
const emptyCalc: CalculationSummary = { ltv: { value: 70 }, results: [] } as unknown as CalculationSummary;
const noRules: RuleEvaluationResult[] = [];

describe("Bank statement clean-file execution boost", () => {
  it("applies when the program is flagged AND the file is classified clean", () => {
    const program = baseProgram({ bankStatementCleanExecution: true });
    const { breakdown } = computeScore(scenario, emptyCalc, program, noRules, "clean");
    const factor = breakdown.find((b) => b.factor === "Bank statement clean-file execution");
    expect(factor).toBeDefined();
    expect(factor?.points).toBe(5);
  });

  it("does NOT apply when the file is moderate/high/manual-review complexity, even if flagged", () => {
    const program = baseProgram({ bankStatementCleanExecution: true });
    for (const tier of ["moderate_complexity", "high_complexity", "manual_review_recommended"] as const) {
      const { breakdown } = computeScore(scenario, emptyCalc, program, noRules, tier);
      expect(breakdown.find((b) => b.factor === "Bank statement clean-file execution"), tier).toBeUndefined();
    }
  });

  it("does NOT apply for a non-bank-statement program even on a clean file", () => {
    const program = baseProgram({ bankStatementCleanExecution: true, incomeDocTypes: ["dscr"] });
    const { breakdown } = computeScore(scenario, emptyCalc, program, noRules, "clean");
    expect(breakdown.find((b) => b.factor === "Bank statement clean-file execution")).toBeUndefined();
  });
});

describe("Bank statement guideline-flexibility boost", () => {
  it("applies when the program is flagged AND the file has any complexity tier above clean", () => {
    const program = baseProgram({ bankStatementFlexible: true });
    for (const tier of ["moderate_complexity", "high_complexity", "manual_review_recommended"] as const) {
      const { breakdown } = computeScore(scenario, emptyCalc, program, noRules, tier);
      const factor = breakdown.find((b) => b.factor === "Bank statement guideline flexibility");
      expect(factor, tier).toBeDefined();
      expect(factor?.points, tier).toBe(5);
    }
  });

  it("does NOT apply on a clean file, even if flagged", () => {
    const program = baseProgram({ bankStatementFlexible: true });
    const { breakdown } = computeScore(scenario, emptyCalc, program, noRules, "clean");
    expect(breakdown.find((b) => b.factor === "Bank statement guideline flexibility")).toBeUndefined();
  });

  it("never rescues a program that hard-fails real eligibility, no matter how complex the file is", () => {
    const program = baseProgram({ bankStatementFlexible: true });
    const hardFailRules: RuleEvaluationResult[] = [
      {
        ruleId: "r1",
        ruleName: "LTV",
        category: "ltv",
        outcome: "fail",
        severity: "hard",
        userExplanation: "Requested LTV exceeds the maximum for this program.",
      },
    ];
    const { score } = computeScore(scenario, emptyCalc, program, hardFailRules, "high_complexity");
    expect(score).toBeLessThanOrEqual(20);
  });
});

describe("The two boosts are mutually exclusive by classification, never both fire on the same evaluation", () => {
  it("a program flagged for BOTH never gets both factors at once", () => {
    const program = baseProgram({ bankStatementCleanExecution: true, bankStatementFlexible: true });
    const { breakdown: cleanBreakdown } = computeScore(scenario, emptyCalc, program, noRules, "clean");
    expect(cleanBreakdown.find((b) => b.factor === "Bank statement clean-file execution")).toBeDefined();
    expect(cleanBreakdown.find((b) => b.factor === "Bank statement guideline flexibility")).toBeUndefined();

    const { breakdown: complexBreakdown } = computeScore(scenario, emptyCalc, program, noRules, "high_complexity");
    expect(complexBreakdown.find((b) => b.factor === "Bank statement guideline flexibility")).toBeDefined();
    expect(complexBreakdown.find((b) => b.factor === "Bank statement clean-file execution")).toBeUndefined();
  });
});
