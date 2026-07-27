import { describe, expect, it } from "vitest";
import { baseProgramChecks, deriveMaxLtv } from "@/domain/matching/baseChecks";
import { RuleOutcome, RuleSeverity } from "@/domain/types/enums";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";

// Real guideline nuances extracted directly from uploaded Orion Lending
// documents: mortgage/housing-history 30-day-late requirements ("0x30x12",
// "1x30x12 allowed with LLPA") and a per-citizenship LTV cap distinct from
// a program's general ceiling (COIN X Section 6.10: Non-Permanent Resident
// Aliens capped at 75% LTV even though the base program allows more).

function baseProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "prog_1",
    lenderId: "lender_1",
    organizationId: "org_1",
    name: "Test Program",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase"],
    occupancies: ["investment"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen", "non_permanent_resident"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 640,
    baseMaxLtv: 80,
    minReservesMonths: 6,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "gv_1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "Test citation",
    ...overrides,
  };
}

function baseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "scn_1",
    organizationId: "org_1",
    name: "Test",
    createdByUserId: "user_1",
    loanPurpose: "purchase",
    occupancy: "investment",
    propertyType: "single_family",
    requestedLoanAmount: 500_000,
    fico: 700,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("Mortgage/housing-history 30-day-late evaluation (real guideline language: 0x30x12, 1x30x12 allowed with LLPA)", () => {
  it("is never evaluated when the program hasn't documented a ceiling (undefined, not silently assumed clean)", () => {
    const program = baseProgram({ maxMortgageLates30x12: undefined });
    const scenario = baseScenario({ creditEvents: { mortgageLates30x12: 2 } });
    const results = baseProgramChecks(scenario, { results: [], ltv: { value: 70, source: "test" } } as never, program);
    expect(results.some((r) => r.ruleName.includes("housing history"))).toBe(false);
  });

  it("is never evaluated when the scenario never stated a lates count", () => {
    const program = baseProgram({ maxMortgageLates30x12: 1 });
    const scenario = baseScenario({ creditEvents: undefined });
    const results = baseProgramChecks(scenario, { results: [], ltv: { value: 70, source: "test" } } as never, program);
    expect(results.some((r) => r.ruleName.includes("housing history"))).toBe(false);
  });

  it("a clean history (0x30x12, program ceiling 1) passes cleanly", () => {
    const program = baseProgram({ maxMortgageLates30x12: 1 });
    const scenario = baseScenario({ creditEvents: { mortgageLates30x12: 0 } });
    const results = baseProgramChecks(scenario, { results: [], ltv: { value: 70, source: "test" } } as never, program);
    const r = results.find((x) => x.ruleName.includes("housing history"));
    expect(r?.outcome).toBe(RuleOutcome.Pass);
    expect(r?.severity).toBe(RuleSeverity.Soft);
  });

  it("landing exactly at the ceiling (1x30x12, program allows 1 with LLPA) is a soft warning, not a plain pass", () => {
    const program = baseProgram({ maxMortgageLates30x12: 1 });
    const scenario = baseScenario({ creditEvents: { mortgageLates30x12: 1 } });
    const results = baseProgramChecks(scenario, { results: [], ltv: { value: 70, source: "test" } } as never, program);
    const r = results.find((x) => x.ruleName.includes("housing history"));
    expect(r?.outcome).toBe(RuleOutcome.Warning);
    expect(r?.userExplanation).toContain("LLPA");
  });

  it("exceeding the ceiling (2x30x12, program allows max 1) is a hard fail", () => {
    const program = baseProgram({ maxMortgageLates30x12: 1 });
    const scenario = baseScenario({ creditEvents: { mortgageLates30x12: 2 } });
    const results = baseProgramChecks(scenario, { results: [], ltv: { value: 70, source: "test" } } as never, program);
    const r = results.find((x) => x.ruleName.includes("housing history"));
    expect(r?.outcome).toBe(RuleOutcome.Fail);
    expect(r?.severity).toBe(RuleSeverity.Hard);
  });

  it("a program requiring a clean 0x30x12 history (maxMortgageLates30x12 = 0) fails even a single late", () => {
    const program = baseProgram({ maxMortgageLates30x12: 0 });
    const scenario = baseScenario({ creditEvents: { mortgageLates30x12: 1 } });
    const results = baseProgramChecks(scenario, { results: [], ltv: { value: 70, source: "test" } } as never, program);
    const r = results.find((x) => x.ruleName.includes("housing history"));
    expect(r?.outcome).toBe(RuleOutcome.Fail);
  });
});

describe("Per-citizenship LTV cap (real guideline nuance: a specific citizenship classification capped below the general ceiling)", () => {
  it("a documented citizenship cap tightens the derived max LTV below the program's base ceiling", () => {
    // Mirrors COIN X Section 6.10: base program allows 80%, but
    // Non-Permanent Resident Aliens are explicitly capped at 75%.
    const program = baseProgram({ baseMaxLtv: 80, citizenshipLtvCaps: { non_permanent_resident: 75 } });
    const scenario = baseScenario({ citizenship: "non_permanent_resident" });
    expect(deriveMaxLtv(scenario, program)).toBe(75);
  });

  it("a citizenship with no documented cap still gets the program's full base ceiling", () => {
    // Mirrors Titan Flex Section 5.12: "eligible for all products and
    // programs" with no separate LTV language — the base ceiling applies
    // unchanged, never silently reduced just because a cap exists for a
    // DIFFERENT citizenship classification on this program.
    const program = baseProgram({ baseMaxLtv: 90, citizenshipLtvCaps: { non_permanent_resident: 75 } });
    const scenario = baseScenario({ citizenship: "us_citizen" });
    expect(deriveMaxLtv(scenario, program)).toBe(90);
  });

  it("a citizenship cap can never grant a HIGHER LTV than the base/matrix-derived cap", () => {
    const program = baseProgram({ baseMaxLtv: 70, citizenshipLtvCaps: { non_permanent_resident: 90 } });
    const scenario = baseScenario({ citizenship: "non_permanent_resident" });
    expect(deriveMaxLtv(scenario, program)).toBe(70);
  });

  it("no citizenship stated on the scenario means no cap is applied (never guessed)", () => {
    const program = baseProgram({ baseMaxLtv: 80, citizenshipLtvCaps: { non_permanent_resident: 75 } });
    const scenario = baseScenario({ citizenship: undefined });
    expect(deriveMaxLtv(scenario, program)).toBe(80);
  });

  it("still composes correctly with the existing FICO-tiered ltvMatrix", () => {
    const program = baseProgram({
      baseMaxLtv: 85,
      ltvMatrix: [{ minFico: 700, maxLtv: 80 }, { minFico: 640, maxLtv: 70 }],
      citizenshipLtvCaps: { non_permanent_resident: 75 },
    });
    // FICO 720 -> matrix caps at 80; citizenship cap (75) is the more
    // restrictive of the two and wins.
    const scenario = baseScenario({ citizenship: "non_permanent_resident", fico: 720 });
    expect(deriveMaxLtv(scenario, program)).toBe(75);
  });
});
