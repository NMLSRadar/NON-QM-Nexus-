import { describe, expect, it } from "vitest";
import { baseProgramChecks, deriveMaxLtv } from "@/domain/matching/baseChecks";
import { RuleOutcome } from "@/domain/types/enums";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";

// Regression coverage for a real reported bug: a lender's program allowed up
// to 90% LTV generally, but its own guidelines cap a warrantable condo at
// 85% LTV and a non-warrantable condo at 80% LTV. Because the engine had no
// concept of a property-type-specific LTV cap, condo scenarios were matched
// against the lender's full 90% ceiling instead of the real, tighter
// condo-specific one. propertyTypeLtvCaps fixes this the same way
// citizenshipLtvCaps fixes per-citizenship caps — an ADDITIONAL cap that
// only ever tightens, never loosens, the base/matrix-derived ceiling.

function baseProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "prog_1",
    lenderId: "lender_1",
    organizationId: "org_1",
    name: "Test Program",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase"],
    occupancies: ["primary"],
    propertyTypes: ["single_family", "condo", "non_warrantable_condo"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 640,
    baseMaxLtv: 90,
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
    occupancy: "primary",
    propertyType: "single_family",
    requestedLoanAmount: 500_000,
    fico: 700,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("Per-property-type LTV cap (real guideline nuance: condo LTV capped below the program's general ceiling)", () => {
  it("a warrantable condo cap tightens the derived max LTV below the program's 90% base ceiling", () => {
    const program = baseProgram({
      baseMaxLtv: 90,
      propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 },
    });
    const scenario = baseScenario({ propertyType: "condo" });
    expect(deriveMaxLtv(scenario, program)).toBe(85);
  });

  it("a non-warrantable condo cap is tighter still", () => {
    const program = baseProgram({
      baseMaxLtv: 90,
      propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 },
    });
    const scenario = baseScenario({ propertyType: "non_warrantable_condo" });
    expect(deriveMaxLtv(scenario, program)).toBe(80);
  });

  it("a property type with no documented cap still gets the program's full base ceiling", () => {
    const program = baseProgram({
      baseMaxLtv: 90,
      propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 },
    });
    const scenario = baseScenario({ propertyType: "single_family" });
    expect(deriveMaxLtv(scenario, program)).toBe(90);
  });

  it("a property-type cap can never grant a HIGHER LTV than the base/matrix-derived cap", () => {
    const program = baseProgram({ baseMaxLtv: 70, propertyTypeLtvCaps: { condo: 90 } });
    const scenario = baseScenario({ propertyType: "condo" });
    expect(deriveMaxLtv(scenario, program)).toBe(70);
  });

  it("no property type stated on the scenario means no cap is applied (never guessed)", () => {
    const program = baseProgram({ baseMaxLtv: 90, propertyTypeLtvCaps: { condo: 85 } });
    const scenario = baseScenario({ propertyType: undefined });
    expect(deriveMaxLtv(scenario, program)).toBe(90);
  });

  it("composes correctly with the existing FICO-tiered ltvMatrix and citizenship cap — most restrictive wins", () => {
    const program = baseProgram({
      baseMaxLtv: 95,
      ltvMatrix: [{ minFico: 700, maxLtv: 90 }],
      citizenshipLtvCaps: { us_citizen: 88 },
      propertyTypeLtvCaps: { condo: 85 },
    });
    const scenario = baseScenario({ propertyType: "condo", citizenship: "us_citizen", fico: 720 });
    expect(deriveMaxLtv(scenario, program)).toBe(85);
  });

  it("end-to-end: the reported bug — a scenario at 88% LTV on a condo must FAIL a program whose condo cap is 85%, even though the program's general ceiling is 90%", () => {
    const program = baseProgram({
      baseMaxLtv: 90,
      propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 },
    });
    const scenario = baseScenario({ propertyType: "condo", requestedLoanAmount: 440_000 });
    const calc = { results: [], ltv: { value: 88, source: "test" } } as never;
    const results = baseProgramChecks(scenario, calc, program);
    const ltvResult = results.find((r) => r.ruleName === "Maximum LTV");
    expect(ltvResult?.outcome).toBe(RuleOutcome.Fail);
    expect(ltvResult?.userExplanation).toContain("85");
  });
});
