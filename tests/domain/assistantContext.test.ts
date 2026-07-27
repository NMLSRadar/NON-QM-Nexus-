import { describe, expect, it } from "vitest";
import { buildGuidelineContext } from "@/lib/ai/assistantContext";
import type { ProgramCatalog } from "@/domain/analyze";
import type { Lender, Program } from "@/domain/types/program";

function makeLender(overrides: Partial<Lender> = {}): Lender {
  return {
    id: "l1",
    organizationId: "org1",
    name: "Test Lender",
    isSampleData: false,
    active: true,
    tierLevel: 1,
    ...overrides,
  };
}

function makeProgram(overrides: Partial<Program> = {}): Program {
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
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual", "llc"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 660,
    baseMaxLtv: 80,
    minReservesMonths: 6,
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: ["none"],
    guidelineVersionId: "gv1",
    guidelineVersionLabel: "v1.0",
    effectiveDate: "2026-01-01",
    sourceCitation: "test",
    ...overrides,
  };
}

describe("assistant context — only ever a compact, real serialization of the catalog", () => {
  it("includes a real active lender's real program with the real fields the AI is told to cite", () => {
    const catalog: ProgramCatalog = { lenders: [makeLender()], programs: [makeProgram()], rules: [] };
    const context = buildGuidelineContext(catalog);
    const parsed = JSON.parse(context);
    expect(parsed.lender).toBe("Test Lender");
    expect(parsed.program).toBe("Test Program");
    expect(parsed.maxLtv).toBe(80);
    expect(parsed.vestingEligible).toContain("llc");
  });

  it("excludes sample-data lenders/programs — the assistant must never present demo data as real", () => {
    const catalog: ProgramCatalog = {
      lenders: [makeLender({ id: "sample-lender", isSampleData: true })],
      programs: [makeProgram({ lenderId: "sample-lender", isSampleData: true })],
      rules: [],
    };
    expect(buildGuidelineContext(catalog)).not.toContain("Test Program");
  });

  it("excludes inactive lenders/programs", () => {
    const catalog: ProgramCatalog = {
      lenders: [makeLender({ active: false })],
      programs: [makeProgram()],
      rules: [],
    };
    expect(buildGuidelineContext(catalog)).not.toContain("Test Program");
  });

  it("returns a clear no-data message rather than an empty string when the account has nothing visible", () => {
    const context = buildGuidelineContext({ lenders: [], programs: [], rules: [] });
    expect(context.length).toBeGreaterThan(0);
    expect(context.toLowerCase()).toContain("no lender programs");
  });
});
