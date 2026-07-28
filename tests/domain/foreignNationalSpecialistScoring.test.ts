import { describe, expect, it } from "vitest";
import { computeScore } from "@/domain/matching/score";
import { RuleOutcome, RuleSeverity } from "@/domain/types/enums";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary, RuleEvaluationResult } from "@/domain/types/results";

// Per user direction (2026-07-28): specific Foreign National lenders
// (Acra Lending, Angel Oak, A&D Mortgage, LendSure, HomeXpress, Champions
// Funding) should be prioritized for Foreign National scenarios. Implemented
// as a small, DISCLOSED editorial scoring factor (never a silent ranking
// override, never a substitute for real eligibility) — see
// Program.foreignNationalSpecialist and score.ts.
function baseProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "p1",
    lenderId: "l1",
    organizationId: "org1",
    name: "Test Program",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase"],
    occupancies: ["investment"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["foreign_national"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 660,
    baseMaxLtv: 75,
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

function baseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    loanPurpose: "purchase",
    occupancy: "investment",
    propertyType: "single_family",
    citizenship: "foreign_national",
    fico: 700,
    estimatedValue: 1_000_000,
    requestedLoanAmount: 700_000,
    ...overrides,
  } as Scenario;
}

const emptyCalc: CalculationSummary = { ltv: { value: 70 }, results: [] } as unknown as CalculationSummary;
const noRules: RuleEvaluationResult[] = [];

describe("Foreign National specialist scoring — editorial, disclosed, never a hard-fail override", () => {
  it("adds a small, labeled scoring factor when the program is flagged AND the scenario is foreign_national", () => {
    const program = baseProgram({ foreignNationalSpecialist: true });
    const { breakdown } = computeScore(baseScenario(), emptyCalc, program, noRules);
    const factor = breakdown.find((b) => b.factor === "Foreign National specialist");
    expect(factor).toBeDefined();
    expect(factor?.points).toBe(5);
    expect(factor?.note).toMatch(/editorial/i);
  });

  it("does NOT add the factor for a non-foreign-national scenario, even if the program is flagged", () => {
    const program = baseProgram({ foreignNationalSpecialist: true });
    const { breakdown } = computeScore(baseScenario({ citizenship: "us_citizen" }), emptyCalc, program, noRules);
    expect(breakdown.find((b) => b.factor === "Foreign National specialist")).toBeUndefined();
  });

  it("does NOT add the factor for a foreign_national scenario when the program isn't flagged", () => {
    const program = baseProgram({ foreignNationalSpecialist: false });
    const { breakdown } = computeScore(baseScenario(), emptyCalc, program, noRules);
    expect(breakdown.find((b) => b.factor === "Foreign National specialist")).toBeUndefined();
  });

  it("never rescues a program that hard-fails real eligibility — the boost cannot overcome the hard-fail cap", () => {
    const program = baseProgram({ foreignNationalSpecialist: true });
    const hardFailRules: RuleEvaluationResult[] = [
      {
        ruleId: "r1",
        ruleName: "Citizenship",
        category: "borrower",
        outcome: RuleOutcome.Fail,
        severity: RuleSeverity.Hard,
        userExplanation: "foreign_national borrowers are not eligible for this program.",
      },
    ];
    const { score } = computeScore(baseScenario(), emptyCalc, program, hardFailRules);
    expect(score).toBeLessThanOrEqual(20);
  });
});

describe("ITIN specialist scoring — the identical editorial-signal pattern, applied to ITIN", () => {
  it("adds a small, labeled scoring factor when the program is flagged AND the scenario is itin", () => {
    const program = baseProgram({ citizenshipEligible: ["itin"], itinSpecialist: true });
    const { breakdown } = computeScore(baseScenario({ citizenship: "itin" }), emptyCalc, program, noRules);
    const factor = breakdown.find((b) => b.factor === "ITIN specialist");
    expect(factor).toBeDefined();
    expect(factor?.points).toBe(5);
    expect(factor?.note).toMatch(/editorial/i);
  });

  it("does NOT add the factor for a non-ITIN scenario, even if the program is flagged", () => {
    const program = baseProgram({ citizenshipEligible: ["itin"], itinSpecialist: true });
    const { breakdown } = computeScore(baseScenario({ citizenship: "us_citizen" }), emptyCalc, program, noRules);
    expect(breakdown.find((b) => b.factor === "ITIN specialist")).toBeUndefined();
  });

  it("does NOT add the factor for an ITIN scenario when the program isn't flagged", () => {
    const program = baseProgram({ citizenshipEligible: ["itin"], itinSpecialist: false });
    const { breakdown } = computeScore(baseScenario({ citizenship: "itin" }), emptyCalc, program, noRules);
    expect(breakdown.find((b) => b.factor === "ITIN specialist")).toBeUndefined();
  });

  it("the two specialist flags are independent — an ITIN-flagged program gets no Foreign National factor and vice versa", () => {
    const itinProgram = baseProgram({ citizenshipEligible: ["itin"], itinSpecialist: true, foreignNationalSpecialist: false });
    const { breakdown: itinBreakdown } = computeScore(baseScenario({ citizenship: "itin" }), emptyCalc, itinProgram, noRules);
    expect(itinBreakdown.find((b) => b.factor === "Foreign National specialist")).toBeUndefined();

    const fnProgram = baseProgram({ foreignNationalSpecialist: true, itinSpecialist: false });
    const { breakdown: fnBreakdown } = computeScore(baseScenario(), emptyCalc, fnProgram, noRules);
    expect(fnBreakdown.find((b) => b.factor === "ITIN specialist")).toBeUndefined();
  });

  it("never rescues a program that hard-fails real eligibility", () => {
    const program = baseProgram({ citizenshipEligible: ["itin"], itinSpecialist: true });
    const hardFailRules: RuleEvaluationResult[] = [
      {
        ruleId: "r1",
        ruleName: "Citizenship",
        category: "borrower",
        outcome: RuleOutcome.Fail,
        severity: RuleSeverity.Hard,
        userExplanation: "itin borrowers are not eligible for this program.",
      },
    ];
    const { score } = computeScore(baseScenario({ citizenship: "itin" }), emptyCalc, program, hardFailRules);
    expect(score).toBeLessThanOrEqual(20);
  });
});
