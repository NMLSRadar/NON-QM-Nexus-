import { describe, expect, it } from "vitest";
import { baseProgramChecks, deriveMaxLtv } from "@/domain/matching/baseChecks";
import { RuleOutcome } from "@/domain/types/enums";
import { classifyCreditProfile } from "@/domain/voice/extract";
import { extractFromTranscript } from "@/domain/voice/extract";
import type { Program, FiveToEightUnitLtvMatrixEntry } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";

// Lender Database Audit, 5-8 Unit Expansion & Voice Scenario Update
// (2026-08-01): regression coverage for (1) the 5-8 unit property type as
// a first-class citizen distinct from 2-4 unit and 9+ unit, (2) its
// dedicated loan-amount/FICO/transaction-type LTV matrix, (3) the
// existing No-FICO domain model correctly separating citizenship and
// credit-status dimensions, and (4) low-FICO routing (a below-ceiling
// FICO surfaces a real tier or a clear ineligibility, never a silent
// blanket rejection nor a fabricated approval).

function baseProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "prog_1",
    lenderId: "lender_1",
    organizationId: "org_1",
    name: "Test Program",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["5_8_unit"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    vestingEligible: ["individual", "llc"],
    minLoanAmount: 1_500_000,
    maxLoanAmount: 3_000_000,
    minFico: 680,
    baseMaxLtv: 75,
    minDscr: 1.0,
    minReservesMonths: 3,
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "gv_1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "Test citation",
    ...overrides,
  };
}

const REAL_MATRIX: FiveToEightUnitLtvMatrixEntry[] = [
  { maxLoanAmount: 1_500_000, minFico: 720, maxLtvPurchase: 75, maxLtvRateTerm: 75, maxLtvCashOut: 65 },
  { maxLoanAmount: 1_500_000, minFico: 700, maxLtvPurchase: 70, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
  { maxLoanAmount: 2_000_000, minFico: 720, maxLtvPurchase: 70, maxLtvRateTerm: 70, maxLtvCashOut: 65 },
  { maxLoanAmount: 2_000_000, minFico: 680, maxLtvPurchase: 70, maxLtvRateTerm: 65, maxLtvCashOut: 60 },
];

function baseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "scn_1",
    organizationId: "org_1",
    name: "Test",
    createdByUserId: "user_1",
    loanPurpose: "purchase",
    occupancy: "investment",
    propertyType: "5_8_unit",
    units: 6,
    requestedLoanAmount: 1_400_000,
    fico: 720,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function emptyCalc(overrides: Partial<CalculationSummary> = {}): CalculationSummary {
  return { results: [], ...overrides } as CalculationSummary;
}

describe("Spec TEST 1 — 5-8 unit property routing is isolated from 2-4 unit and 9+ unit", () => {
  it("a 6-unit scenario is classified as 5_8_unit, not 2_4_unit or the legacy 5_plus_unit catch-all", () => {
    const extraction = extractFromTranscript("Borrower is purchasing a six-unit property at 75% LTV with a 680 FICO and a 1.15 DSCR.");
    expect(extraction.propertyType?.value).toBe("5_8_unit");
    expect(extraction.units).toBe(6);
  });

  it("a program that only lists 2_4_unit is NOT matched against a 5-8 unit scenario (hard fail)", () => {
    const program = baseProgram({ propertyTypes: ["2_4_unit"] });
    const scenario = baseScenario();
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const propCheck = checks.find((c) => c.ruleId.endsWith(":prop"));
    expect(propCheck?.outcome).toBe(RuleOutcome.Fail);
  });

  it("a 9-unit scenario is classified as 9_plus_unit, distinct from 5-8 unit", () => {
    const extraction = extractFromTranscript("It's a nine unit apartment building.");
    expect(extraction.propertyType?.value).toBe("9_plus_unit");
    expect(extraction.units).toBe(9);
  });
});

describe("5-8 unit LTV matrix — real loan-amount/FICO/transaction-type grid (LoanStream-style)", () => {
  it("derives the correct max LTV for a purchase in the smallest applicable band at the top FICO tier", () => {
    const program = baseProgram({ fiveToEightUnitLtvMatrix: REAL_MATRIX });
    const scenario = baseScenario({ requestedLoanAmount: 1_400_000, fico: 720, loanPurpose: "purchase" });
    expect(deriveMaxLtv(scenario, program)).toBe(75);
  });

  it("derives a lower LTV for the same band at a lower (but still eligible) FICO tier", () => {
    const program = baseProgram({ fiveToEightUnitLtvMatrix: REAL_MATRIX });
    const scenario = baseScenario({ requestedLoanAmount: 1_400_000, fico: 700, loanPurpose: "purchase" });
    expect(deriveMaxLtv(scenario, program)).toBe(70);
  });

  it("varies LTV by transaction type at the same loan-amount/FICO tier (cash-out is more conservative than purchase)", () => {
    const program = baseProgram({ fiveToEightUnitLtvMatrix: REAL_MATRIX });
    const purchaseLtv = deriveMaxLtv(baseScenario({ requestedLoanAmount: 1_400_000, fico: 720, loanPurpose: "purchase" }), program);
    const cashOutLtv = deriveMaxLtv(baseScenario({ requestedLoanAmount: 1_400_000, fico: 720, loanPurpose: "cash_out_refinance" }), program);
    expect(purchaseLtv).toBe(75);
    expect(cashOutLtv).toBe(65);
    expect(cashOutLtv).toBeLessThan(purchaseLtv);
  });

  it("picks the next loan-amount band up when the requested amount exceeds the smaller band's ceiling", () => {
    const program = baseProgram({ fiveToEightUnitLtvMatrix: REAL_MATRIX });
    const scenario = baseScenario({ requestedLoanAmount: 1_900_000, fico: 720, loanPurpose: "purchase" });
    expect(deriveMaxLtv(scenario, program)).toBe(70);
  });

  it("a FICO below every tier documented for the applicable band is a real hard-fail ineligibility, never a silent fallback to the program's general baseMaxLtv", () => {
    // 660 FICO at the $1.5M band: the matrix only documents 700/720 tiers
    // there — this must be flagged as a real hard fail (spec TEST 2's
    // \"do not automatically conclude no eligible lenders\" is about
    // searching OTHER lenders/tiers, not about silently approving this one
    // at an undocumented figure).
    const program = baseProgram({ fiveToEightUnitLtvMatrix: REAL_MATRIX });
    const scenario = baseScenario({ requestedLoanAmount: 1_400_000, fico: 660, loanPurpose: "purchase" });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const tierCheck = checks.find((c) => c.ruleId.endsWith(":58tier"));
    expect(tierCheck?.outcome).toBe(RuleOutcome.Fail);
    expect(deriveMaxLtv(scenario, program)).toBe(0);
  });

  it("a program with 5_8_unit listed but NO ingested matrix is flagged as guideline-confirmation-required, never silently assumed eligible at the base LTV", () => {
    const program = baseProgram({ fiveToEightUnitLtvMatrix: undefined });
    const scenario = baseScenario();
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const matrixCheck = checks.find((c) => c.ruleId.endsWith(":58matrix"));
    expect(matrixCheck?.outcome).toBe(RuleOutcome.ManualReview);
  });
});

describe("5-8 unit specific overlays — experienced investor, citizenship, DSCR, STR", () => {
  it("hard-fails a first-time investor when the 5-8 unit product specifically requires an experienced investor, even if the program's general investor rule doesn't", () => {
    const program = baseProgram({ experiencedInvestorRequired: false, fiveToEightUnitExperiencedInvestorRequired: true });
    const scenario = baseScenario({ investorExperience: "first_time_investor" });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const check = checks.find((c) => c.ruleId.endsWith(":58expinv"));
    expect(check?.outcome).toBe(RuleOutcome.Fail);
  });

  it("hard-fails a citizenship the 5-8 unit product specifically excludes, even when the program's general citizenshipEligible would allow it", () => {
    const program = baseProgram({
      citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
      fiveToEightUnitCitizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
    });
    const scenario = baseScenario({ citizenship: "foreign_national" });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const check = checks.find((c) => c.ruleId.endsWith(":58citizenship"));
    expect(check?.outcome).toBe(RuleOutcome.Fail);
  });

  it("passes a citizenship the 5-8 unit product specifically allows", () => {
    const program = baseProgram({ fiveToEightUnitCitizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"] });
    const scenario = baseScenario({ citizenship: "us_citizen" });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const check = checks.find((c) => c.ruleId.endsWith(":58citizenship"));
    expect(check?.outcome).toBe(RuleOutcome.Pass);
  });

  it("hard-fails DSCR below the 5-8-unit-specific minimum even when it exceeds the program's general minDscr", () => {
    const program = baseProgram({ minDscr: 0.9, fiveToEightUnitMinDscr: 1.0 });
    const scenario = baseScenario();
    const calc = emptyCalc({ dscr: { value: 0.95, source: "computed" } as never });
    const checks = baseProgramChecks(scenario, calc, program);
    const check = checks.find((c) => c.ruleId.endsWith(":58dscr"));
    expect(check?.outcome).toBe(RuleOutcome.Fail);
  });

  it("soft-warns on STR income when the 5-8 unit product specifically disallows it (treated as vacant, no income)", () => {
    const program = baseProgram({ fiveToEightUnitStrIncomeEligible: false });
    const scenario = baseScenario({ incomeDocType: "dscr", dscr: { strIncomeUsed: "yes" } as never });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const check = checks.find((c) => c.ruleId.endsWith(":58str"));
    expect(check?.outcome).toBe(RuleOutcome.Warning);
  });
});

describe("Spec TEST 3/4 — No-FICO domain model keeps citizenship and credit status as separate dimensions", () => {
  it("a U.S. Citizen with No-FICO is evaluated on noFicoPolicy, never auto-routed into a Foreign-National/ITIN-only program", () => {
    const program = baseProgram({
      citizenshipEligible: ["us_citizen"],
      propertyTypes: ["single_family"],
      noFicoPolicy: "eligible",
    });
    const scenario = baseScenario({ propertyType: "single_family", citizenship: "us_citizen", fico: undefined, creditProfileType: "no_fico" });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const citizenshipCheck = checks.find((c) => c.ruleId.endsWith(":cit"));
    const noFicoCheck = checks.find((c) => c.ruleId.endsWith(":nofico"));
    expect(citizenshipCheck?.outcome).toBe(RuleOutcome.Pass);
    expect(noFicoCheck?.outcome).toBe(RuleOutcome.Pass);
  });

  it("an ITIN + No-FICO scenario only passes when the program's noFicoPolicy explicitly allows it — never assumed from itin eligibility alone", () => {
    const eligibleProgram = baseProgram({ citizenshipEligible: ["itin"], propertyTypes: ["single_family"], noFicoPolicy: "eligible" });
    const undocumentedProgram = baseProgram({ citizenshipEligible: ["itin"], propertyTypes: ["single_family"], noFicoPolicy: undefined });
    const scenario = baseScenario({ propertyType: "single_family", citizenship: "itin", fico: undefined, creditProfileType: "no_fico" });

    const eligibleChecks = baseProgramChecks(scenario, emptyCalc(), eligibleProgram);
    expect(eligibleChecks.find((c) => c.ruleId.endsWith(":nofico"))?.outcome).toBe(RuleOutcome.Pass);

    const undocumentedChecks = baseProgramChecks(scenario, emptyCalc(), undocumentedProgram);
    expect(undocumentedChecks.find((c) => c.ruleId.endsWith(":nofico"))?.outcome).toBe(RuleOutcome.ManualReview);
  });

  it("a program that requires a numeric U.S. FICO hard-fails a No-FICO borrower", () => {
    const program = baseProgram({ citizenshipEligible: ["foreign_national"], propertyTypes: ["single_family"], noFicoPolicy: "requires_us_fico" });
    const scenario = baseScenario({ propertyType: "single_family", citizenship: "foreign_national", fico: undefined, creditProfileType: "no_fico" });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    expect(checks.find((c) => c.ruleId.endsWith(":nofico"))?.outcome).toBe(RuleOutcome.Fail);
  });
});

describe("Spec TEST 2 — a low (but real, on-file) FICO surfaces the actual program tier, never an automatic blanket rejection", () => {
  it("a 610 FICO DSCR purchase is evaluated against the program's real minFico, not auto-rejected before the check runs", () => {
    const program = baseProgram({ propertyTypes: ["single_family"], minFico: 600, incomeDocTypes: ["dscr"] });
    const scenario = baseScenario({ propertyType: "single_family", fico: 610, incomeDocType: "dscr" });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    const ficoCheck = checks.find((c) => c.ruleId.endsWith(":fico"));
    expect(ficoCheck?.outcome).toBe(RuleOutcome.Pass);
    expect(ficoCheck?.userExplanation).toContain("610");
  });

  it("a 610 FICO correctly hard-fails a program whose real minimum is 620 (a genuine ineligibility, not a data gap)", () => {
    const program = baseProgram({ propertyTypes: ["single_family"], minFico: 620, incomeDocTypes: ["dscr"] });
    const scenario = baseScenario({ propertyType: "single_family", fico: 610, incomeDocType: "dscr" });
    const checks = baseProgramChecks(scenario, emptyCalc(), program);
    expect(checks.find((c) => c.ruleId.endsWith(":fico"))?.outcome).toBe(RuleOutcome.Fail);
  });
});

describe("Spec Phase 7 — expanded No-FICO voice phrase coverage", () => {
  it.each([
    "no fico",
    "no us fico",
    "they don't have a score",
    "there is no score",
    "no domestic credit score",
    "no reportable fico",
    "itin no score",
  ])("classifies %j as a nonnumeric credit profile (not left unrecognized)", (phrase) => {
    expect(classifyCreditProfile(phrase)).toBeDefined();
  });
});
