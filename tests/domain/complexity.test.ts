import { describe, expect, it } from "vitest";
import { classifyScenarioComplexity } from "../../src/domain/complexity";
import type { Scenario } from "../../src/domain/types/scenario";

function baseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s1",
    organizationId: "org1",
    name: "Test",
    createdByUserId: "u1",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("classifyScenarioComplexity", () => {
  it("classifies a clean, straightforward scenario as low complexity", () => {
    const s = baseScenario({
      fico: 760,
      loanPurpose: "purchase",
      propertyType: "single_family",
      occupancy: "primary",
      citizenship: "us_citizen",
      incomeDocType: "full_doc",
      estimatedValue: 400_000,
      requestedLoanAmount: 280_000, // 70% LTV
    });
    const r = classifyScenarioComplexity(s);
    expect(r.level).toBe("low");
    expect(r.score).toBeLessThanOrEqual(2);
  });

  it("classifies a high-risk scenario as high complexity", () => {
    const s = baseScenario({
      fico: 590,
      loanPurpose: "cash_out_refinance",
      propertyType: "non_warrantable_condo",
      occupancy: "investment",
      citizenship: "itin",
      incomeDocType: "pnl_only",
      estimatedValue: 300_000,
      requestedLoanAmount: 285_000, // 95% LTV
      dscr: { monthlyLease: 1500, principalAndInterest: 2000 }, // DSCR 0.75
      creditEvents: { mortgageLatesCategory: "late_30" },
      firstTimeHomebuyer: true,
    });
    const r = classifyScenarioComplexity(s);
    expect(r.level).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(6);
  });

  it("produces only short fragment reasons", () => {
    const s = baseScenario({
      fico: 600,
      incomeDocType: "bank_statement",
      citizenship: "foreign_national",
      loanPurpose: "cash_out_refinance",
      propertyType: "condo",
    });
    const r = classifyScenarioComplexity(s);
    expect(r.reasons.length).toBeGreaterThan(0);
    for (const reason of r.reasons) {
      expect(reason.split(" ").length).toBeLessThanOrEqual(4);
    }
  });

  it("flags missing data as mild uncertainty, not a crash", () => {
    const r = classifyScenarioComplexity(baseScenario({}));
    expect(["low", "moderate", "high"]).toContain(r.level);
    expect(r.reasons.some((x) => x.includes("FICO"))).toBe(true);
    expect(r.reasons.some((x) => x.includes("Income"))).toBe(true);
  });

  it("labels a non-permanent resident accurately and never as a foreign national", () => {
    const r = classifyScenarioComplexity(
      baseScenario({
        fico: 760,
        citizenship: "non_permanent_resident",
        incomeDocType: "full_doc",
        propertyType: "single_family",
        occupancy: "primary",
      }),
    );
    expect(r.reasons).toContain("Non-permanent resident");
    expect(r.reasons).not.toContain("Foreign national");
  });
});