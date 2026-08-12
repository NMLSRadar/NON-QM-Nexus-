import { describe, expect, it } from "vitest";
import { analyzeScenario } from "@/domain/analyze";
import { MatchStatus } from "@/domain/types/enums";
import type { Lender, Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";

function lender(id: string, name: string): Lender {
  return {
    id,
    organizationId: "org1",
    name,
    tierLevel: 1,
    active: true,
    isSampleData: false,
    createdAt: "",
    updatedAt: "",
  } as Lender;
}

function program(id: string, lenderId: string, overrides: Partial<Program> = {}): Program {
  return {
    id,
    lenderId,
    organizationId: "org1",
    name: id,
    isSampleData: false,
    active: true,
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase"],
    occupancies: ["investment"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 660,
    baseMaxLtv: 80,
    minReservesMonths: 0,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "g1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "Test",
    ...overrides,
  };
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s1",
    organizationId: "org1",
    name: "ITIN matching regression",
    createdByUserId: "u1",
    loanPurpose: "purchase",
    occupancy: "investment",
    propertyType: "single_family",
    estimatedValue: 500_000,
    requestedLoanAmount: 350_000,
    incomeDocType: "dscr",
    citizenship: "itin",
    fico: 720,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as Scenario;
}

function statusByProgram(result: ReturnType<typeof analyzeScenario>, programId: string) {
  return result.evaluations.find((evaluation) => evaluation.programId === programId)?.status;
}

describe("ITIN recommendations require a confirmed program-level documentation combination", () => {
  it("recommends confirmed ITIN DSCR programs and hard-excludes ordinary/unconfirmed DSCR programs", () => {
    const lenders = [lender("l-confirmed", "Confirmed ITIN DSCR"), lender("l-general", "General DSCR")];
    const programs = [
      program("confirmed", "l-confirmed", { itinDscrEligible: true, minDscr: 1 }),
      program("general", "l-general", { minDscr: 1 }),
    ];

    const result = analyzeScenario(scenario(), { lenders, programs, rules: [] });

    expect(statusByProgram(result, "confirmed")).not.toBe(MatchStatus.Ineligible);
    expect(statusByProgram(result, "general")).toBe(MatchStatus.Ineligible);
  });

  it("recommends only explicitly confirmed ITIN bank-statement programs", () => {
    const lenders = [lender("l-itin", "ITIN Bank Statement"), lender("l-general", "General Bank Statement")];
    const programs = [
      program("itin-bank", "l-itin", {
        incomeDocTypes: ["bank_statement"],
        citizenshipDocTypeRestrictions: { itin: ["bank_statement"] },
        minDscr: undefined,
      }),
      program("general-bank", "l-general", {
        incomeDocTypes: ["bank_statement"],
        minDscr: undefined,
      }),
    ];

    const result = analyzeScenario(
      scenario({ incomeDocType: "bank_statement", occupancy: "primary" }),
      { lenders, programs: programs.map((p) => ({ ...p, occupancies: ["primary", "investment"] })), rules: [] },
    );

    expect(statusByProgram(result, "itin-bank")).not.toBe(MatchStatus.Ineligible);
    expect(statusByProgram(result, "general-bank")).toBe(MatchStatus.Ineligible);
  });
});
