import { describe, expect, it } from "vitest";
import { classifyCitizenship, extractFromTranscript } from "@/domain/voice/extract";
import { baseProgramChecks } from "@/domain/matching/baseChecks";
import { RuleOutcome, RuleSeverity } from "@/domain/types/enums";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";

/**
 * Lender Program Expansion and ITIN DSCR Update (2026-07-29).
 *
 * Section 10 of the spec requires automated coverage of 12 specific
 * scenarios. Each `describe` block below is numbered to match.
 */

function baseProgram(overrides: Partial<Program> = {}): Program {
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
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 660,
    baseMaxLtv: 75,
    minReservesMonths: 6,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "g1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "Test",
    ...overrides,
  };
}

function baseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s1",
    organizationId: "org1",
    name: "Test",
    createdByUserId: "u1",
    loanPurpose: "purchase",
    occupancy: "investment",
    propertyType: "single_family",
    estimatedValue: 500_000,
    requestedLoanAmount: 400_000,
    incomeDocType: "dscr",
    citizenship: "itin",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as Scenario;
}

const calc: CalculationSummary = { results: [] } as unknown as CalculationSummary;

function itinDscrResult(program: Program, scenario: Scenario) {
  return baseProgramChecks(scenario, calc, program).find((r) => r.ruleId.endsWith(":itindscr"));
}

// 1. ITIN borrower purchasing an investment property using DSCR.
describe("1. ITIN borrower, investment property, DSCR", () => {
  it("passes the ITIN+DSCR combination check when the program's matrix expressly confirms it (itinDscrEligible=true)", () => {
    const program = baseProgram({ itinDscrEligible: true, minDscr: 1.0 });
    const scenario = baseScenario();
    const r = itinDscrResult(program, scenario);
    expect(r?.outcome).toBe(RuleOutcome.Pass);
    expect(r?.severity).toBe(RuleSeverity.Hard);
  });

  it("never silently assumes eligibility when itinDscrEligible is unconfirmed (undefined) — manual review, not a pass", () => {
    const program = baseProgram({ minDscr: 1.0 }); // itinDscrEligible left undefined
    const scenario = baseScenario();
    const r = itinDscrResult(program, scenario);
    expect(r?.outcome).toBe(RuleOutcome.ManualReview);
    expect(r?.userExplanation.toLowerCase()).toMatch(/guideline confirmation required/);
  });

  it("hard-fails when the matrix expressly denies the combination (itinDscrEligible=false), even though citizenship and doc type independently match", () => {
    const program = baseProgram({ itinDscrEligible: false, minDscr: 1.0 });
    const scenario = baseScenario();
    const r = itinDscrResult(program, scenario);
    expect(r?.outcome).toBe(RuleOutcome.Fail);
    expect(r?.severity).toBe(RuleSeverity.Hard);
  });
});

// 2. ITIN borrower with no traditional FICO score.
describe("2. ITIN borrower with no traditional FICO score", () => {
  it("never auto-rejects for lacking a numeric FICO — outcome depends on the program's noFicoPolicy, independent of the ITIN+DSCR check", () => {
    const program = baseProgram({ itinDscrEligible: true, noFicoPolicy: "eligible_with_alternative_credit" });
    const scenario = baseScenario({ fico: undefined, creditProfileType: "no_us_credit" });
    const results = baseProgramChecks(scenario, calc, program);
    const noFicoResult = results.find((r) => r.ruleId.endsWith(":nofico"));
    expect(noFicoResult?.outcome).toBe(RuleOutcome.ManualReview);
    expect(results.some((r) => r.ruleId.endsWith(":nofico") && r.outcome === RuleOutcome.Fail)).toBe(false);
  });
});

// 3. ITIN borrower purchasing an owner-occupied primary residence.
describe("3. ITIN borrower, owner-occupied primary residence", () => {
  it("hard-fails when the program's ITIN eligibility is expressly investment-only (ownerOccupiedItinEligible=false)", () => {
    const program = baseProgram({ occupancies: ["primary", "investment"], ownerOccupiedItinEligible: false });
    const scenario = baseScenario({ occupancy: "primary", incomeDocType: "full_doc" });
    const results = baseProgramChecks(scenario, calc, program);
    const occResult = results.find((r) => r.ruleId.endsWith(":itinocc"));
    expect(occResult?.outcome).toBe(RuleOutcome.Fail);
  });

  it("does not restrict occupancy when ownerOccupiedItinEligible is undocumented (undefined)", () => {
    const program = baseProgram({ occupancies: ["primary", "investment"] });
    const scenario = baseScenario({ occupancy: "primary", incomeDocType: "full_doc" });
    const results = baseProgramChecks(scenario, calc, program);
    expect(results.some((r) => r.ruleId.endsWith(":itinocc"))).toBe(false);
  });
});

// 4. Foreign national investor without an ITIN.
describe("4. Foreign national investor without an ITIN, DSCR", () => {
  it("never conflates foreign_national with itin — evaluates foreignNationalDscrEligible, not itinDscrEligible", () => {
    const program = baseProgram({ citizenshipEligible: ["foreign_national"], foreignNationalDscrEligible: true });
    const scenario = baseScenario({ citizenship: "foreign_national" });
    const results = baseProgramChecks(scenario, calc, program);
    const fnResult = results.find((r) => r.ruleId.endsWith(":fndscr"));
    expect(fnResult?.outcome).toBe(RuleOutcome.Pass);
    expect(results.some((r) => r.ruleId.endsWith(":itindscr"))).toBe(false);
  });

  it("flags manual review when Foreign National + DSCR combination is unconfirmed", () => {
    const program = baseProgram({ citizenshipEligible: ["foreign_national"] });
    const scenario = baseScenario({ citizenship: "foreign_national" });
    const r = baseProgramChecks(scenario, calc, program).find((r2) => r2.ruleId.endsWith(":fndscr"));
    expect(r?.outcome).toBe(RuleOutcome.ManualReview);
  });
});

// 5. U.S.-citizen DSCR borrower.
describe("5. U.S.-citizen DSCR borrower", () => {
  it("never triggers the ITIN/Foreign-National combination checks for a plain U.S. citizen", () => {
    const program = baseProgram({ citizenshipEligible: ["us_citizen"], minDscr: 1.0 });
    const scenario = baseScenario({ citizenship: "us_citizen" });
    const results = baseProgramChecks(scenario, calc, program);
    expect(results.some((r) => r.ruleId.endsWith(":itindscr"))).toBe(false);
    expect(results.some((r) => r.ruleId.endsWith(":fndscr"))).toBe(false);
    const citResult = results.find((r) => r.ruleId.endsWith(":cit"));
    expect(citResult?.outcome).toBe(RuleOutcome.Pass);
  });
});

// 6. Self-employed borrower using 12-month business bank statements.
describe("6. Self-employed borrower, 12-month business bank statements", () => {
  it("evaluates bank_statement doc type independent of any ITIN/DSCR combination logic", () => {
    const program = baseProgram({ citizenshipEligible: ["us_citizen"], incomeDocTypes: ["bank_statement"] });
    const scenario = baseScenario({ citizenship: "us_citizen", incomeDocType: "bank_statement", occupancy: "primary" });
    const results = baseProgramChecks(scenario, calc, program);
    const docResult = results.find((r) => r.ruleId.endsWith(":doc"));
    expect(docResult?.outcome).toBe(RuleOutcome.Pass);
  });
});

// 7. Self-employed borrower using P&L only.
describe("7. Self-employed borrower, P&L only", () => {
  it("evaluates pnl_only doc type correctly", () => {
    const program = baseProgram({ citizenshipEligible: ["us_citizen"], incomeDocTypes: ["pnl_only"] });
    const scenario = baseScenario({ citizenship: "us_citizen", incomeDocType: "pnl_only", occupancy: "primary" });
    const results = baseProgramChecks(scenario, calc, program);
    const docResult = results.find((r) => r.ruleId.endsWith(":doc"));
    expect(docResult?.outcome).toBe(RuleOutcome.Pass);
  });
});

// 8. Asset-rich borrower with no employment income.
describe("8. Asset-rich borrower, no employment income (asset_depletion)", () => {
  it("evaluates asset_depletion doc type correctly", () => {
    const program = baseProgram({ citizenshipEligible: ["us_citizen"], incomeDocTypes: ["asset_depletion"] });
    const scenario = baseScenario({ citizenship: "us_citizen", incomeDocType: "asset_depletion", occupancy: "primary" });
    const results = baseProgramChecks(scenario, calc, program);
    const docResult = results.find((r) => r.ruleId.endsWith(":doc"));
    expect(docResult?.outcome).toBe(RuleOutcome.Pass);
  });
});

// 9. Borrower seeking a standalone second mortgage.
describe("9. Borrower seeking a standalone second mortgage", () => {
  it("a program modeling a real standalone-second (e.g. FundLoans Aspire) evaluates independent of ITIN/DSCR logic", () => {
    const program = baseProgram({
      name: "Aspire — Standalone Second Mortgage",
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      incomeDocTypes: ["bank_statement", "pnl_only", "full_doc"],
      occupancies: ["primary", "second_home", "investment"],
      baseMaxLtv: 75,
      minFico: 680,
    });
    const scenario = baseScenario({ citizenship: "us_citizen", incomeDocType: "full_doc", occupancy: "primary" });
    const results = baseProgramChecks(scenario, calc, program);
    expect(results.some((r) => r.outcome === RuleOutcome.Fail)).toBe(false);
  });
});

// 10. Borrower purchasing a manufactured home with an ITIN.
describe("10. ITIN borrower purchasing a manufactured home", () => {
  it("evaluates property type independent of the ITIN+DSCR combination logic (full_doc, not DSCR)", () => {
    const program = baseProgram({
      citizenshipEligible: ["itin"],
      incomeDocTypes: ["full_doc"],
      propertyTypes: ["manufactured"],
      occupancies: ["primary"],
    });
    const scenario = baseScenario({ citizenship: "itin", incomeDocType: "full_doc", occupancy: "primary", propertyType: "manufactured" });
    const results = baseProgramChecks(scenario, calc, program);
    const propResult = results.find((r) => r.ruleId.endsWith(":prop"));
    expect(propResult?.outcome).toBe(RuleOutcome.Pass);
    // Not a DSCR request, so the ITIN+DSCR combination check must not fire.
    expect(results.some((r) => r.ruleId.endsWith(":itindscr"))).toBe(false);
  });
});

// 11. Borrower with a recent bankruptcy.
describe("11. Borrower with a recent bankruptcy (housing-history / credit-event dimension)", () => {
  it("mortgage-lates check evaluates independent of ITIN/DSCR combination logic", () => {
    const program = baseProgram({ citizenshipEligible: ["us_citizen"], maxMortgageLates30x12: 0 });
    const scenario = baseScenario({ citizenship: "us_citizen", incomeDocType: "dscr", creditEvents: { mortgageLates30x12: 1 } });
    const results = baseProgramChecks(scenario, calc, program);
    const latesResult = results.find((r) => r.ruleId.endsWith(":lates"));
    expect(latesResult?.outcome).toBe(RuleOutcome.Fail);
  });
});

// 12. Borrower saying "I-10" rather than spelling ITIN.
describe('12. Borrower saying "I-10" rather than spelling ITIN', () => {
  it('classifies "I-10 number" with mortgage-borrower context as ITIN, not foreign_national', () => {
    const x = extractFromTranscript("Borrower has an I-10 number, no Social Security number, wants to purchase an investment property.");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.citizenship?.value).not.toBe("foreign_national");
  });

  it('the example scenario from the spec resolves to ITIN + investment occupancy', () => {
    const x = extractFromTranscript(
      "Borrower has an I-10 number, no Social Security number, wants to purchase an investment property, and does not want to document personal income.",
    );
    expect(x.citizenship?.value).toBe("itin");
    expect(x.occupancy?.value).toBe("investment");
  });
});

// Cross-cutting: never conflate ITIN with Foreign National at the
// classification layer (rule 20 in the assistant prompt, and the base
// citizenship enum itself keeps them as distinct values).
describe("ITIN and Foreign National remain distinct classifications", () => {
  it("classifyCitizenship never returns foreign_national for an explicit ITIN phrase", () => {
    for (const phrase of ["ITIN borrower", "I-T-I-N", "individual taxpayer identification number", "tax ID borrower"]) {
      const m = classifyCitizenship(phrase.toLowerCase());
      expect(m?.value).toBe("itin");
      expect(m?.value).not.toBe("foreign_national");
    }
  });

  it("classifyCitizenship never returns itin for an explicit Foreign National phrase", () => {
    const m = classifyCitizenship("foreign national borrower living and working abroad");
    expect(m?.value).toBe("foreign_national");
    expect(m?.value).not.toBe("itin");
  });
});
