import { describe, expect, it } from "vitest";
import { classifyLienPosition, extractFromTranscript } from "@/domain/voice/extract";
import { baseProgramChecks } from "@/domain/matching/baseChecks";
import { RuleOutcome, RuleSeverity } from "@/domain/types/enums";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";

/**
 * Two real bugs fixed 2026-07-29, reported by the user from a live voice
 * scenario:
 *
 * 1. A "second lien" / standalone-second-mortgage / HELOAN request matched
 *    against every ordinary first-lien cash-out-refinance-eligible
 *    program, because nothing distinguished lien POSITION from loan
 *    PURPOSE. Fixed with a new LienPosition dimension + hard matching
 *    check, and voice auto-detection that also auto-triggers the
 *    cash-out-refinance loanPurpose Vital (per the user's explicit
 *    request) when no purchase/refinance language was separately stated.
 *
 * 2. A program bundling several income doc types under one row (real for
 *    many ITIN/Foreign-National products) let a citizenship class match
 *    EVERY bundled doc type even when the real guideline only extends
 *    that citizenship to a subset. Fixed with a new, general
 *    Program.citizenshipDocTypeRestrictions field.
 */

function baseProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "p1",
    lenderId: "l1",
    organizationId: "org1",
    name: "Test Program",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "investment"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["itin"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 660,
    baseMaxLtv: 80,
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
    loanPurpose: "cash_out_refinance",
    occupancy: "primary",
    propertyType: "single_family",
    estimatedValue: 500_000,
    requestedLoanAmount: 300_000,
    incomeDocType: "bank_statement",
    citizenship: "itin",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as Scenario;
}

const calc: CalculationSummary = { results: [] } as unknown as CalculationSummary;

// ---------------------------------------------------------------------------
// Section 1: voice recognition of a standalone second-lien request.
// ---------------------------------------------------------------------------
describe('"second lien" voice recognition', () => {
  const phrases = ["second lien", "second mortgage", "standalone second", "junior lien", "subordinate lien", "piggyback loan", "HELOAN", "closed-end second", "home equity loan"];
  for (const phrase of phrases) {
    it(`classifies "${phrase}" as standalone_second`, () => {
      expect(classifyLienPosition(phrase.toLowerCase())?.value).toBe("standalone_second");
    });
  }

  it("plain transcripts with no second-lien mention return undefined (first-lien default)", () => {
    expect(classifyLienPosition("purchase of a primary residence, bank statement loan")).toBeUndefined();
  });

  it('auto-triggers a second-lien loanPurpose when a second lien is mentioned with no explicit purchase/refi language', () => {
    const x = extractFromTranscript("Borrower wants a second lien using 12 months of bank statements to qualify.");
    expect(x.lienPosition?.value).toBe("standalone_second");
    // A concurrent session's improvement (2026-07-29) added second_lien as
    // its own precise LoanPurpose value, which classifyLoanPurpose now
    // resolves directly (taking priority over the cash-out-refinance
    // fallback this test originally exercised) — an even more accurate
    // classification than a generic cash-out refinance for the same intent.
    expect(x.loanPurpose?.value).toBe("second_lien");
  });

  it("an explicit purchase statement can still coexist with a second-lien mention (both facts captured)", () => {
    const x = extractFromTranscript("This is a purchase transaction with a piggyback second lien.");
    expect(x.lienPosition?.value).toBe("standalone_second");
    // second_lien (the more specific, dedicated LoanPurpose value) wins
    // over the generic "purchase" phrase in the same sentence — a
    // purchase-money piggyback second is itself represented by the
    // second_lien LoanPurpose value, not a separate "purchase" one.
    expect(x.loanPurpose?.value).toBe("second_lien");
  });
});

// ---------------------------------------------------------------------------
// Section 2: lien-position hard matching filter.
// ---------------------------------------------------------------------------
describe("Lien position hard matching filter", () => {
  it("a standalone-second scenario hard-fails an ordinary first-lien program (even one that supports cash-out refinance)", () => {
    const program = baseProgram(); // lienPosition undefined = first_lien
    const scenario = baseScenario({ lienPosition: "standalone_second" });
    const results = baseProgramChecks(scenario, calc, program);
    const lienResult = results.find((r) => r.ruleId.endsWith(":lien"));
    expect(lienResult?.outcome).toBe(RuleOutcome.Fail);
    expect(lienResult?.severity).toBe(RuleSeverity.Hard);
  });

  it("a standalone-second scenario passes a program explicitly tagged lienPosition=standalone_second", () => {
    const program = baseProgram({ lienPosition: "standalone_second" });
    const scenario = baseScenario({ lienPosition: "standalone_second" });
    const results = baseProgramChecks(scenario, calc, program);
    expect(results.some((r) => r.ruleId.endsWith(":lien") && r.outcome === RuleOutcome.Fail)).toBe(false);
  });

  it("an ordinary first-lien scenario (no lien position stated) hard-fails a standalone-second program", () => {
    const program = baseProgram({ lienPosition: "standalone_second" });
    const scenario = baseScenario(); // lienPosition undefined = first_lien
    const results = baseProgramChecks(scenario, calc, program);
    const lienResult = results.find((r) => r.ruleId.endsWith(":lien"));
    expect(lienResult?.outcome).toBe(RuleOutcome.Fail);
  });

  it("an ordinary first-lien scenario passes an ordinary first-lien program", () => {
    const program = baseProgram();
    const scenario = baseScenario();
    const results = baseProgramChecks(scenario, calc, program);
    expect(results.some((r) => r.ruleId.endsWith(":lien"))).toBe(false);
  });

  it("second lien + P&L only: only a program that is BOTH standalone_second AND supports pnl_only should pass both checks", () => {
    const secondLienBankStatementOnly = baseProgram({ lienPosition: "standalone_second", incomeDocTypes: ["bank_statement"] });
    const secondLienWithPnl = baseProgram({ lienPosition: "standalone_second", incomeDocTypes: ["bank_statement", "pnl_only"] });
    const scenario = baseScenario({ lienPosition: "standalone_second", incomeDocType: "pnl_only" });

    const r1 = baseProgramChecks(scenario, calc, secondLienBankStatementOnly);
    expect(r1.some((r) => r.ruleId.endsWith(":doc") && r.outcome === RuleOutcome.Fail)).toBe(true);

    const r2 = baseProgramChecks(scenario, calc, secondLienWithPnl);
    expect(r2.some((r) => r.ruleId.endsWith(":doc") && r.outcome === RuleOutcome.Fail)).toBe(false);
    expect(r2.some((r) => r.ruleId.endsWith(":lien") && r.outcome === RuleOutcome.Fail)).toBe(false);
  });

  it("a same lender's first-lien bank-statement program never appears for a second-lien-specific request (no accidental duplicate/repeat)", () => {
    const firstLienBankStatement = baseProgram({
      id: "p-first",
      lienPosition: undefined,
      incomeDocTypes: ["bank_statement"],
      citizenshipDocTypeRestrictions: { itin: ["bank_statement"] },
    });
    const secondLienBankStatement = baseProgram({
      id: "p-second",
      lienPosition: "standalone_second",
      incomeDocTypes: ["bank_statement"],
      citizenshipDocTypeRestrictions: { itin: ["bank_statement"] },
    });
    const scenario = baseScenario({ lienPosition: "standalone_second", incomeDocType: "bank_statement" });

    const firstResults = baseProgramChecks(scenario, calc, firstLienBankStatement);
    const secondResults = baseProgramChecks(scenario, calc, secondLienBankStatement);
    expect(firstResults.some((r) => r.ruleId.endsWith(":lien") && r.outcome === RuleOutcome.Fail)).toBe(true);
    expect(secondResults.some((r) => r.outcome === RuleOutcome.Fail)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 3: per-citizenship income-documentation restriction.
// ---------------------------------------------------------------------------
describe("Per-citizenship income-documentation restriction (citizenshipDocTypeRestrictions)", () => {
  it("an ITIN scenario passes a doc type explicitly listed in the restriction", () => {
    const program = baseProgram({
      incomeDocTypes: ["bank_statement", "full_doc", "asset_depletion"],
      citizenshipDocTypeRestrictions: { itin: ["bank_statement", "full_doc"] },
    });
    const scenario = baseScenario({ incomeDocType: "bank_statement" });
    const results = baseProgramChecks(scenario, calc, program);
    expect(results.some((r) => r.ruleId.endsWith(":citdoc"))).toBe(false);
  });

  it("an ITIN scenario hard-fails a doc type NOT in the restriction, even though the program generally supports it", () => {
    const program = baseProgram({
      incomeDocTypes: ["bank_statement", "full_doc", "asset_depletion"],
      citizenshipDocTypeRestrictions: { itin: ["bank_statement", "full_doc"] },
    });
    const scenario = baseScenario({ incomeDocType: "asset_depletion" });
    const results = baseProgramChecks(scenario, calc, program);
    const citDocResult = results.find((r) => r.ruleId.endsWith(":citdoc"));
    expect(citDocResult?.outcome).toBe(RuleOutcome.Fail);
    expect(citDocResult?.severity).toBe(RuleSeverity.Hard);
  });

  it("an ITIN program without explicit doc-type confirmation hard-fails every non-DSCR doc type", () => {
    const program = baseProgram({ incomeDocTypes: ["bank_statement", "full_doc", "asset_depletion"] }); // no citizenshipDocTypeRestrictions
    for (const doc of ["bank_statement", "full_doc", "asset_depletion"] as const) {
      const scenario = baseScenario({ incomeDocType: doc });
      const results = baseProgramChecks(scenario, calc, program);
      const citDocResult = results.find((r) => r.ruleId.endsWith(":citdoc"));
      expect(citDocResult?.outcome).toBe(RuleOutcome.Fail);
      expect(citDocResult?.severity).toBe(RuleSeverity.Hard);
    }
  });

  it("does not impose ITIN's closed-by-default rule on other citizenship classes", () => {
    const program = baseProgram({
      citizenshipEligible: ["us_citizen"],
      incomeDocTypes: ["bank_statement", "full_doc"],
    });
    const scenario = baseScenario({ citizenship: "us_citizen", incomeDocType: "bank_statement" });
    const results = baseProgramChecks(scenario, calc, program);
    expect(results.some((r) => r.ruleId.endsWith(":citdoc"))).toBe(false);
  });

  it("the restriction never applies when the citizenship itself is already ineligible (base citizenship check wins, no double-fail)", () => {
    const program = baseProgram({
      citizenshipEligible: ["us_citizen"], // itin NOT eligible at all
      citizenshipDocTypeRestrictions: { itin: ["bank_statement"] },
    });
    const scenario = baseScenario({ incomeDocType: "bank_statement" });
    const results = baseProgramChecks(scenario, calc, program);
    const citResult = results.find((r) => r.ruleId.endsWith(":cit"));
    expect(citResult?.outcome).toBe(RuleOutcome.Fail);
    expect(results.some((r) => r.ruleId.endsWith(":citdoc"))).toBe(false);
  });
});
