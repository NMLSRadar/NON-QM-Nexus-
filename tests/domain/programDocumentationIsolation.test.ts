import { describe, expect, it } from "vitest";
import { evaluateProgram } from "@/domain/matching/evaluateProgram";
import { aiNarrative, whyThisLender } from "@/domain/matching/narrative";
import { generateRestructuringOptions } from "@/domain/matching/restructure";
import { normalizeIncomeDocType, resolveDocumentationProfile } from "@/domain/matching/documentationProfile";
import type { CalculationSummary } from "@/domain/types/results";
import type { Lender, Program, Rule } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";

const lender: Lender = { id: "lender", organizationId: "org", name: "Scoped Lender", isSampleData: false, active: true, tierLevel: 1 };

function criteria(overrides: Record<string, unknown> = {}) {
  return {
    loanPurposes: ["purchase"] as const,
    occupancies: ["primary"] as const,
    propertyTypes: ["single_family"] as const,
    eligibleStates: "ALL" as const,
    citizenshipEligible: ["us_citizen"] as const,
    vestingEligible: ["individual"] as const,
    minLoanAmount: 100_000,
    maxLoanAmount: 1_500_000,
    minFico: 680,
    maxDti: 50,
    baseMaxLtv: 80,
    minReservesMonths: 6,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [] as string[],
    ...overrides,
  };
}

function bundledProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "bundled",
    lenderId: lender.id,
    organizationId: "org",
    name: "Alternative Documentation Family",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["bank_statement", "wvoe_only"],
    loanPurposes: ["purchase", "cash_out_refinance"],
    occupancies: ["primary", "investment"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 4_000_000,
    minFico: 620,
    maxDti: 55,
    baseMaxLtv: 90,
    minReservesMonths: 3,
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "family-v1",
    guidelineVersionLabel: "Family v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "Broad family sheet",
    ...overrides,
  };
}

function withWvoeProfile(overrides: Record<string, unknown> = {}): Program {
  return bundledProgram({
    documentationProfiles: {
      wvoe_only: {
        documentationType: "wvoe_only",
        displayName: "WVOE Only",
        verificationStatus: "human_verified",
        guidelineVersionId: "wvoe-v1",
        guidelineVersionLabel: "WVOE v1",
        effectiveDate: "2026-08-01",
        lastVerifiedDate: "2026-08-19",
        sourceCitation: "WVOE matrix page 4",
        sourcePage: 4,
        sourceSection: "Written VOE",
        ruleIds: [],
        criteria: criteria(overrides) as never,
      },
      bank_statement: {
        documentationType: "bank_statement",
        displayName: "Bank Statement",
        verificationStatus: "human_verified",
        guidelineVersionId: "bs-v1",
        guidelineVersionLabel: "Bank Statement v1",
        effectiveDate: "2026-08-01",
        sourceCitation: "Bank Statement matrix page 2",
        ruleIds: [],
        criteria: criteria({ baseMaxLtv: 90, minFico: 620, maxDti: 55, maxLoanAmount: 4_000_000, minReservesMonths: 3 }) as never,
      },
    },
  });
}

function scenario(doc: Scenario["incomeDocType"], ltv: number): Scenario {
  return {
    id: "scenario",
    organizationId: "org",
    name: `${doc} ${ltv}`,
    createdByUserId: "user",
    loanPurpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    estimatedValue: 1_000_000,
    requestedLoanAmount: ltv * 10_000,
    fico: 700,
    incomeDocType: doc,
    citizenship: "us_citizen",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
  };
}

function calc(ltv: number): CalculationSummary {
  const result = { key: "ltv", label: "LTV", value: ltv, unit: "percent", formula: "loan/value", inputs: {} } as const;
  return { ltv: result, results: [result] };
}

describe("documentation program isolation", () => {
  it.each([
    ["WVOE", "wvoe_only"],
    ["Written Verification of Employment", "wvoe_only"],
    ["Asset Utilization", "asset_depletion"],
    ["P&L Only", "pnl_only"],
    ["1099", "1099"],
  ])("normalizes %s to %s", (value, expected) => {
    expect(normalizeIncomeDocType(value)).toBe(expected);
  });

  it("fails closed for a bundled row without a WVOE profile", () => {
    const evaluation = evaluateProgram(scenario("wvoe_only", 80), calc(80), bundledProgram(), lender, []);
    expect(evaluation.guidelineVerificationRequired).toBe(true);
    expect(evaluation.status).toBe("manual_review");
    expect(evaluation.matchScore).toBe(0);
    expect(evaluation.maxLtv).toBeUndefined();
    expect(evaluation.minFico).toBeUndefined();
    expect(evaluation.maxDti).toBeUndefined();
    expect(evaluation.maxLoanAmount).toBeUndefined();
    expect(evaluation.estimatedReservesRequiredMonths).toBeUndefined();
    expect(evaluation.documentationType).toBe("WVOE Only");
    expect(whyThisLender(evaluation)).toEqual([]);
    expect(aiNarrative(evaluation, 0)).toContain("no sibling program limits were substituted");
  });

  it("uses only the WVOE profile, never the 90% family or Bank Statement values", () => {
    const evaluation = evaluateProgram(scenario("wvoe_only", 80), calc(80), withWvoeProfile(), lender, []);
    expect(evaluation.guidelineVerificationRequired).toBe(false);
    expect(evaluation.maxLtv).toBe(80);
    expect(evaluation.minFico).toBe(680);
    expect(evaluation.maxDti).toBe(50);
    expect(evaluation.maxLoanAmount).toBe(1_500_000);
    expect(evaluation.estimatedReservesRequiredMonths).toBe(6);
    expect(evaluation.incomeDocTypes).toEqual(["wvoe_only"]);
    expect(evaluation.sourceCitation).toBe("WVOE matrix page 4");
    expect(whyThisLender(evaluation).join(" ")).toContain("maximum 80%");
    expect(whyThisLender(evaluation).join(" ")).not.toContain("maximum 90%");
  });

  it("rejects 85% WVOE even though the sibling Bank Statement profile allows 90%", () => {
    const evaluation = evaluateProgram(scenario("wvoe_only", 85), calc(85), withWvoeProfile(), lender, []);
    expect(evaluation.status).toBe("ineligible");
    expect(evaluation.maxLtv).toBe(80);
    expect(evaluation.failedRules.some((rule) => rule.category === "ltv" && rule.userExplanation.includes("exceeds maximum 80%"))).toBe(true);
  });

  it("calculates an 80% counter-offer only from the WVOE profile and never unlocks an unprofiled sibling row", () => {
    const scoped = withWvoeProfile();
    const unprofiled = bundledProgram({ id: "unprofiled-sibling", name: "Unprofiled Family" });
    const options = generateRestructuringOptions(
      scenario("wvoe_only", 85),
      [{ program: scoped, lender }, { program: unprofiled, lender }],
      [],
      new Date("2026-08-19T12:00:00Z"),
    );
    const ltvOption = options.find((option) => option.suggestedValue.startsWith("80% LTV"));
    expect(ltvOption).toBeDefined();
    expect(ltvOption?.programsPotentiallyUnlockedIds).toContain(scoped.id);
    expect(ltvOption?.programsPotentiallyUnlockedIds).not.toContain(unprofiled.id);
  });

  it("does not execute broad program rules unless the profile explicitly scopes them", () => {
    const broadRule: Rule = {
      id: "bank-only-rule",
      lenderId: lender.id,
      programId: "bundled",
      guidelineVersionId: "family-v1",
      category: "features",
      name: "Sibling rule",
      conditions: { all: [] },
      outcomeWhenTrue: "pass",
      outcomeWhenFalse: "fail",
      severity: "hard",
      userExplanation: "Bank Statement sibling rule leaked.",
      verificationStatus: "human_verified",
    };
    const evaluation = evaluateProgram(scenario("wvoe_only", 80), calc(80), withWvoeProfile(), lender, [broadRule]);
    expect(evaluation.ruleResults.some((rule) => rule.ruleId === broadRule.id)).toBe(false);
  });

  it("keeps a genuine single-document record backward compatible", () => {
    const single = bundledProgram({ incomeDocTypes: ["wvoe_only"], baseMaxLtv: 80, minFico: 680, maxDti: 50, maxLoanAmount: 1_500_000, minReservesMonths: 6 });
    const resolution = resolveDocumentationProfile(single, "wvoe_only");
    expect(resolution.status).toBe("resolved");
    const evaluation = evaluateProgram(scenario("wvoe_only", 80), calc(80), single, lender, []);
    expect(evaluation.guidelineVerificationRequired).toBe(false);
    expect(evaluation.maxLtv).toBe(80);
  });

  it("fails closed when a real single-document WVOE record has no verified maximum DTI", () => {
    const single = bundledProgram({
      incomeDocTypes: ["wvoe_only"],
      baseMaxLtv: 80,
      minFico: 680,
      maxDti: undefined,
      maxLoanAmount: 1_500_000,
      minReservesMonths: 6,
    });
    const evaluation = evaluateProgram(scenario("wvoe_only", 80), calc(80), single, lender, []);
    expect(evaluation.guidelineVerificationRequired).toBe(true);
    expect(evaluation.profileVerificationIssues?.join(" ")).toContain("maximum DTI");
    expect(evaluation.maxLtv).toBeUndefined();
  });

  it.each(["bank_statement", "1099", "pnl_only", "asset_depletion", "wvoe_only"] as const)(
    "never lets a bundled %s advertisement qualify without its own profile",
    (doc) => {
      const program = bundledProgram({ incomeDocTypes: ["bank_statement", "1099", "pnl_only", "asset_depletion", "wvoe_only"] });
      const evaluation = evaluateProgram(scenario(doc, 80), calc(80), program, lender, []);
      expect(evaluation.guidelineVerificationRequired).toBe(true);
      expect(evaluation.matchScore).toBe(0);
      expect(evaluation.maxLtv).toBeUndefined();
    },
  );
});
