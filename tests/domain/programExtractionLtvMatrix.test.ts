import { describe, expect, it } from "vitest";
import { extractedProgramSchema, EXTRACTION_SYSTEM_PROMPT } from "@/domain/validation/programExtractionSchema";

// Regression test for a real, user-caught bug (2026-07-28): the AI
// guideline extractor had no way to represent a FICO-tiered LTV matrix
// (e.g. Orion Titan Flex — "700 FICO/90% LTV up to $1M ... 660 FICO/80%
// LTV up to $2M") and was forced to collapse it into one minFico/
// baseMaxLtv pair, consistently picking the FICO tied to the highest LTV
// tier rather than the program's true floor — silently hard-excluding
// every real borrower who qualified at a lower FICO/lower LTV. Fixed by
// adding an optional ltvMatrix array to the extraction schema (mirroring
// the real Program.ltvMatrix the matching engine already consumes) and
// instructing the extraction prompt to always populate minFico as the
// LOWEST tier and baseMaxLtv as the HIGHEST tier when a matrix exists.
function baseProgram() {
  return {
    name: "Test Program",
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase"],
    occupancies: ["primary"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 660,
    baseMaxLtv: 90,
    minReservesMonths: 6,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "Section 4",
  };
}

describe("Program extraction schema — ltvMatrix support", () => {
  it("accepts a program with no ltvMatrix (flat single-tier programs still work)", () => {
    const result = extractedProgramSchema.safeParse(baseProgram());
    expect(result.success).toBe(true);
  });

  it("accepts a real multi-tier FICO/LTV matrix with occupancy and loan-amount breakpoints", () => {
    const program = {
      ...baseProgram(),
      ltvMatrix: [
        { minFico: 700, maxLtv: 90, occupancy: "primary", maxLoanAmount: 1_000_000 },
        { minFico: 660, maxLtv: 80, occupancy: "primary", maxLoanAmount: 2_000_000 },
        { minFico: 680, maxLtv: 85, occupancy: "second_home", maxLoanAmount: 1_000_000 },
      ],
    };
    const result = extractedProgramSchema.safeParse(program);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ltvMatrix).toHaveLength(3);
    }
  });

  it("rejects a matrix entry with an out-of-range FICO or LTV (same strict validation as every other field)", () => {
    const badFico = { ...baseProgram(), ltvMatrix: [{ minFico: 200, maxLtv: 90 }] };
    expect(extractedProgramSchema.safeParse(badFico).success).toBe(false);

    const badLtv = { ...baseProgram(), ltvMatrix: [{ minFico: 700, maxLtv: 150 }] };
    expect(extractedProgramSchema.safeParse(badLtv).success).toBe(false);
  });

  it("the extraction prompt explicitly instructs true-floor/true-ceiling summary fields when a matrix exists", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/ltvMatrix/);
    expect(EXTRACTION_SYSTEM_PROMPT.toLowerCase()).toMatch(/lowest minfico/);
    expect(EXTRACTION_SYSTEM_PROMPT.toLowerCase()).toMatch(/highest maxltv/);
  });
});
