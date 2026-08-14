// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BestLenderMatches, ScenarioPricingGuidance } from "@/app/scenarios/[id]/best-lender-matches";
import type { ProgramEvaluation } from "@/domain/types/results";
import { MatchStatus } from "@/domain/types/enums";

/**
 * Regression suite for the scenario-results lender-display rule (product
 * spec: "Scenario Results Page Cleanup and Lender Display Logic"):
 *   - eligible lenders always render before ineligible ones
 *   - 3+ eligible lenders suppresses ineligible lenders entirely
 *   - 1-2 eligible lenders show up to 5 labeled near-match/ineligible ones
 *   - 0 eligible lenders shows the strongest near-matches
 *   - a locked (higher-tier) eligible lender still counts toward the
 *     3-eligible threshold and still renders, just without guideline detail
 * This must never regress back to showing every ineligible lender, or to
 * silently dropping a locked eligible lender from the count.
 */

function makeEvaluation(overrides: Partial<ProgramEvaluation> = {}): ProgramEvaluation {
  return {
    programId: overrides.programId ?? "p1",
    lenderId: "l1",
    lenderTierLevel: 1,
    programName: "Test Program",
    lenderName: "Test Lender",
    isSampleData: false,
    status: MatchStatus.Eligible,
    matchScore: 80,
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
    itinDscrConfirmed: false,
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

function ineligible(id: string, reason: string): ProgramEvaluation {
  return makeEvaluation({
    programId: id,
    lenderName: `Ineligible Lender ${id}`,
    status: MatchStatus.Ineligible,
    matchScore: 20,
    failedRules: [
      {
        ruleId: `${id}-rule`,
        ruleName: "test rule",
        category: "ltv",
        outcome: "fail" as never,
        severity: "hard" as never,
        userExplanation: reason,
      },
    ],
  });
}

function eligible(id: string, lenderTierLevel = 1): ProgramEvaluation {
  return makeEvaluation({ programId: id, lenderName: `Eligible Lender ${id}`, lenderTierLevel });
}

describe("Scenario results — Calculation Summary removed", () => {
  it("never renders a Calculation Summary heading regardless of lender counts", () => {
    render(<BestLenderMatches evaluations={[eligible("1"), eligible("2"), eligible("3")]} tierLevel={3} />);
    expect(screen.queryByText(/calculation summary/i)).not.toBeInTheDocument();
  });
});

describe("Scenario results — eligible-lender suppression rule", () => {
  it("Test Case A/B: 3+ eligible lenders show zero ineligible lenders", () => {
    const evals = [eligible("1"), eligible("2"), eligible("3"), ineligible("x", "FICO below minimum")];
    render(<BestLenderMatches evaluations={evals} tierLevel={3} />);
    expect(screen.getByText("Eligible Lender 1")).toBeInTheDocument();
    expect(screen.getByText("Eligible Lender 2")).toBeInTheDocument();
    expect(screen.getByText("Eligible Lender 3")).toBeInTheDocument();
    expect(screen.queryByText(/ineligible lender x/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/currently ineligible/i)).not.toBeInTheDocument();
  });

  it("Test Case C: 2 eligible lenders show up to 5 labeled near-match/ineligible lenders with reasons", () => {
    const evals = [
      eligible("1"),
      eligible("2"),
      ineligible("x", "FICO below minimum"),
      ineligible("y", "LTV exceeds maximum"),
    ];
    render(<BestLenderMatches evaluations={evals} tierLevel={3} />);
    expect(screen.getByText("Eligible Lender 1")).toBeInTheDocument();
    expect(screen.getByText("Eligible Lender 2")).toBeInTheDocument();
    expect(screen.getAllByText(/currently ineligible/i).length).toBeGreaterThan(0);
    expect(screen.getByText("FICO below minimum")).toBeInTheDocument();
    expect(screen.getByText("LTV exceeds maximum")).toBeInTheDocument();
  });

  it("never shows more than 5 near-match/ineligible lenders", () => {
    const evals = [eligible("1"), ...Array.from({ length: 8 }, (_, i) => ineligible(`x${i}`, `reason ${i}`))];
    render(<BestLenderMatches evaluations={evals} tierLevel={3} />);
    expect(screen.getAllByText("Currently Ineligible")).toHaveLength(5);
  });

  it("Test Case E: 0 eligible lenders shows the strongest near-match lenders with reasons", () => {
    const evals = [ineligible("x", "Reserve requirement not met"), ineligible("y", "Documentation type not supported")];
    render(<BestLenderMatches evaluations={evals} tierLevel={3} />);
    expect(screen.getByText("Reserve requirement not met")).toBeInTheDocument();
    expect(screen.getByText("Documentation type not supported")).toBeInTheDocument();
    expect(screen.getByText(/strongest near-match lenders/i)).toBeInTheDocument();
  });
});

describe("Scenario results — score-based pricing guidance", () => {
  it("shows the strong-scenario message when five or more lenders score at least 83", () => {
    const evals = [83, 84, 86, 88, 90].map((matchScore, i) => makeEvaluation({ programId: `s${i}`, matchScore }));
    render(<ScenarioPricingGuidance evaluations={evals} />);
    expect(screen.getByText("Strong Non-QM Scenario")).toBeInTheDocument();
    expect(screen.getByText(/rate and pricing should carry more weight/i)).toBeInTheDocument();
  });

  it("shows balanced guidance when the average score is 60 through 82", () => {
    const evals = [62, 70, 78].map((matchScore, i) => makeEvaluation({ programId: `m${i}`, matchScore }));
    render(<ScenarioPricingGuidance evaluations={evals} />);
    expect(screen.getByText("Pricing and Execution Matter Equally")).toBeInTheDocument();
    expect(screen.getByText(/matching the file to the right lender/i)).toBeInTheDocument();
  });

  it("prioritizes guidelines when the average score is 45 or lower", () => {
    const evals = [35, 40, 45].map((matchScore, i) => makeEvaluation({ programId: `l${i}`, matchScore }));
    render(<ScenarioPricingGuidance evaluations={evals} />);
    expect(screen.getByText("Guidelines Matter More Than Rate")).toBeInTheDocument();
    expect(screen.getByText(/does not matter if the deal cannot get done/i)).toBeInTheDocument();
  });

  it("shows no special disclaimer for the unspecified 46 through 59 average range", () => {
    render(<ScenarioPricingGuidance evaluations={[makeEvaluation({ matchScore: 52 })]} />);
    expect(screen.queryByLabelText("Scenario pricing guidance")).not.toBeInTheDocument();
  });
});

describe("Scenario results — membership-tier protection (locked eligible lenders)", () => {
  it("Test Case F: a locked higher-tier eligible lender still counts toward the 3-eligible threshold and suppresses ineligible lenders", () => {
    const evals = [
      eligible("1", 1),
      eligible("2", 1),
      eligible("3", 3), // Tier 3, viewer is only Tier 1 — locked
      ineligible("x", "FICO below minimum"),
    ];
    render(<BestLenderMatches evaluations={evals} tierLevel={1} />);
    // All three eligible lenders are visible...
    expect(screen.getByText("Eligible Lender 1")).toBeInTheDocument();
    expect(screen.getByText("Eligible Lender 2")).toBeInTheDocument();
    expect(screen.getByText("Eligible Lender 3")).toBeInTheDocument();
    // ...the third is locked (guideline detail hidden, upgrade prompt shown)...
    expect(screen.getByText(/upgrade to unlock this lender/i)).toBeInTheDocument();
    expect(screen.queryByText("FICO below minimum")).not.toBeInTheDocument();
    // ...and because 3 eligible lenders were identified, ineligible ones are suppressed.
    expect(screen.queryByText(/currently ineligible/i)).not.toBeInTheDocument();
  });

  it("does not lock a lender the viewer's tier already covers", () => {
    const evals = [eligible("1", 2)];
    render(<BestLenderMatches evaluations={evals} tierLevel={2} />);
    expect(screen.queryByText(/upgrade to unlock this lender/i)).not.toBeInTheDocument();
  });
});
