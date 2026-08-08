import { describe, expect, it } from "vitest";
import type { Lender, Program } from "@/domain/types/program";
import {
  canonicalizePrograms,
  programMatchesCategory,
  sortLendersAlphabetically,
  sortProgramsByLenderThenName,
} from "@/app/programs/program-directory-utils";

function makeLender(id: string, name: string): Lender {
  return {
    id,
    organizationId: "org",
    name,
    isSampleData: false,
    active: true,
    tierLevel: 1,
  };
}

function makeProgram(overrides: Partial<Program> & Pick<Program, "id" | "lenderId" | "name">): Program {
  return {
    organizationId: "org",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["full_doc"],
    loanPurposes: ["purchase"],
    occupancies: ["primary"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100000,
    maxLoanAmount: 1000000,
    minFico: 660,
    baseMaxLtv: 80,
    minReservesMonths: 0,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "version-1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "verified test source",
    ...overrides,
  };
}

describe("program directory ordering and counting", () => {
  it("sorts lender names A-Z without using tier, popularity, or input order", () => {
    const lenders = [
      makeLender("3", "Zephyr Mortgage"),
      makeLender("1", "ACC Mortgage"),
      makeLender("2", "Acra Lending"),
      makeLender("4", "Oaktree Funding"),
    ];
    lenders[0]!.tierLevel = 1;
    lenders[1]!.tierLevel = 3;

    expect(sortLendersAlphabetically(lenders).map((lender) => lender.name)).toEqual([
      "ACC Mortgage",
      "Acra Lending",
      "Oaktree Funding",
      "Zephyr Mortgage",
    ]);
  });

  it("sorts programs by lender A-Z first and program A-Z second", () => {
    const lenders = [makeLender("b", "Cake Mortgage"), makeLender("a", "Acra Lending")];
    const programs = [
      makeProgram({ id: "3", lenderId: "b", name: "DSCR" }),
      makeProgram({ id: "2", lenderId: "a", name: "ITIN DSCR" }),
      makeProgram({ id: "1", lenderId: "a", name: "Asset Depletion" }),
    ];

    expect(sortProgramsByLenderThenName(programs, lenders).map((program) => program.name)).toEqual([
      "Asset Depletion",
      "ITIN DSCR",
      "DSCR",
    ]);
  });

  it("deduplicates repeated canonical rows and accidental same lender/program/version records", () => {
    const original = makeProgram({ id: "canonical", lenderId: "acra", name: "ITIN DSCR" });
    const repeatedQueryRow = { ...original };
    const accidentalDuplicate = makeProgram({ id: "duplicate", lenderId: "acra", name: "ITIN DSCR" });
    const legitimateDistinctProgram = makeProgram({ id: "distinct", lenderId: "acra", name: "ITIN Asset Depletion" });
    const distinctVersion = makeProgram({
      id: "new-version",
      lenderId: "acra",
      name: "ITIN DSCR",
      guidelineVersionId: "version-2",
      guidelineVersionLabel: "v2",
      effectiveDate: "2026-07-01",
    });

    expect(canonicalizePrograms([original, repeatedQueryRow, accidentalDuplicate, legitimateDistinctProgram, distinctVersion])).toHaveLength(3);
  });
});

describe("program directory category recognition", () => {
  it("recognizes Bank Statement and DSCR from structured documentation types", () => {
    expect(programMatchesCategory(makeProgram({ id: "1", lenderId: "a", name: "Select", incomeDocTypes: ["bank_statement"] }), "bank_statement")).toBe(true);
    expect(programMatchesCategory(makeProgram({ id: "2", lenderId: "a", name: "Investor Cash Flow", incomeDocTypes: ["dscr"] }), "dscr")).toBe(true);
  });

  it("keeps individual ITIN variants separate while grouping all of them under ITIN", () => {
    const names = ["ITIN Asset Depletion", "ITIN Bank Statement", "ITIN DSCR", "ITIN Full Documentation"];
    const programs = names.map((name, index) => makeProgram({ id: String(index), lenderId: "a", name }));
    expect(programs.filter((program) => programMatchesCategory(program, "itin")).map((program) => program.name)).toEqual(names);
  });

  it("recognizes official asset and WVOE terminology without renaming programs", () => {
    for (const name of ["Asset Utilization", "Asset Depletion", "Asset Qualifier", "Asset-Based Qualification", "Asset Dissipation", "Asset Amortization"]) {
      expect(programMatchesCategory(makeProgram({ id: name, lenderId: "a", name }), "asset")).toBe(true);
    }
    for (const name of ["WVOE", "Written Verification of Employment", "VOE Only", "Verification of Employment Loan", "Wage Earner VOE", "Written VOE"]) {
      expect(programMatchesCategory(makeProgram({ id: name, lenderId: "a", name }), "wvoe")).toBe(true);
    }
  });
});
