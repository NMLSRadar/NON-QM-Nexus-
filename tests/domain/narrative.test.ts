import { describe, expect, it } from "vitest";
import { whyThisLender, potentialIssues, aiNarrative } from "@/domain/matching/narrative";
import { MatchStatus, RuleOutcome, RuleSeverity } from "@/domain/types/enums";
import type { ProgramEvaluation } from "@/domain/types/results";

function makeEvaluation(overrides: Partial<ProgramEvaluation> = {}): ProgramEvaluation {
  return {
    programId: "p1",
    lenderId: "l1",
    programName: "Test Program",
    lenderName: "Test Lender",
    isSampleData: false,
    status: MatchStatus.Eligible,
    matchScore: 88,
    scoreBreakdown: [],
    maxLtv: 80,
    maxLoanAmount: 2_000_000,
    minFico: 660,
    maxDti: 50,
    estimatedReservesRequiredMonths: 6,
    documentationType: "dscr",
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase"],
    occupancies: ["investment"],
    propertyTypes: ["single_family"],
    citizenshipEligible: ["us_citizen"],
    foreignNationalSpecialist: false,
    itinSpecialist: false,
    bankStatementCleanExecution: false,
    bankStatementFlexible: false,
    interestOnlyAvailable: false,
    ruleResults: [],
    failedRules: [],
    warnings: [],
    manualReviewItems: [],
    guidelineVersion: "v1.0",
    effectiveDate: "2026-01-01",
    sourceCitation: "test",
    disclaimer: "test",
    ...overrides,
  };
}

describe("narrative — grounded only in real rule/evaluation data, never invented", () => {
  it("whyThisLender only includes real Pass rule explanations for THIS program", () => {
    const e = makeEvaluation({
      ruleResults: [
        { ruleId: "r1", ruleName: "LTV", category: "ltv", outcome: RuleOutcome.Pass, severity: RuleSeverity.Hard, userExplanation: "Requested LTV 80% <= maximum 85%." },
        { ruleId: "r2", ruleName: "FICO", category: "fico", outcome: RuleOutcome.Fail, severity: RuleSeverity.Hard, userExplanation: "FICO too low." },
      ],
    });
    const why = whyThisLender(e);
    expect(why).toContain("Requested LTV 80% <= maximum 85%.");
    expect(why).not.toContain("FICO too low."); // a Fail must never appear as a "why" reason
  });

  it("whyThisLender deduplicates identical explanations and caps at maxItems", () => {
    const dup = { ruleId: "r", ruleName: "x", category: "ltv", outcome: RuleOutcome.Pass, severity: RuleSeverity.Hard, userExplanation: "Same reason." };
    const e = makeEvaluation({ ruleResults: Array.from({ length: 10 }, (_, i) => ({ ...dup, ruleId: `r${i}` })) });
    expect(whyThisLender(e, 3).length).toBeLessThanOrEqual(3);
    expect(new Set(whyThisLender(e, 3)).size).toBe(whyThisLender(e, 3).length);
  });

  it("potentialIssues surfaces real warnings/manual-review items, empty when there are none", () => {
    const clean = makeEvaluation();
    expect(potentialIssues(clean)).toEqual([]);

    const withWarning = makeEvaluation({
      warnings: [{ ruleId: "w1", ruleName: "Reserves", category: "reserves", outcome: RuleOutcome.Warning, severity: RuleSeverity.Soft, userExplanation: "Reserves below required." }],
    });
    expect(potentialIssues(withWarning)).toContain("Reserves below required.");
  });

  it("aiNarrative references only real fields already on the evaluation", () => {
    const e = makeEvaluation({ lenderName: "Orion Lending", matchScore: 93, maxLtv: 85 });
    const text = aiNarrative(e, 0);
    expect(text).toContain("Orion Lending");
    expect(text).toContain("93%");
    expect(text).toContain("85% LTV");
  });

  it("aiNarrative includes the runner-up clause only when a runnerUpName is passed in, and only when concerns exist it says so", () => {
    const withIssue = makeEvaluation({
      warnings: [{ ruleId: "w1", ruleName: "x", category: "reserves", outcome: RuleOutcome.Warning, severity: RuleSeverity.Soft, userExplanation: "Check reserves." }],
    });
    const text = aiNarrative(withIssue, 0, "Champion Funding");
    expect(text).toContain("Champion Funding");
    expect(text).toMatch(/noted below/i);

    // The caller (best-lender-matches.tsx) is responsible for only ever
    // passing a runnerUpName for rank 0 — aiNarrative itself just renders
    // whatever it's given, so omitting the argument is what keeps it out.
    const noRunnerUp = aiNarrative(makeEvaluation(), 1);
    expect(noRunnerUp).not.toContain("is also competitive");
  });
});
