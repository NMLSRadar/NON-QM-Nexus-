import { describe, expect, it } from "vitest";
import { classifyCitizenship, classifyCreditProfile, extractFromTranscript } from "@/domain/voice/extract";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import { hasValidCreditProfile } from "@/domain/validation/scenarioSchema";
import { deriveMaxLtv } from "@/domain/matching/baseChecks";
import { baseProgramChecks } from "@/domain/matching/baseChecks";
import { RuleOutcome, RuleSeverity } from "@/domain/types/enums";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";

/**
 * F-1 Visa Classification + No-FICO Voice Recognition fix (2026-07-28).
 *
 * Covers: F-1 visa -> Foreign National classification (never blank, never
 * misclassified as U.S. citizen / permanent resident / ITIN / EAD
 * non-permanent resident); "No FICO" and its real semantic variations as a
 * VALID nonnumeric credit-profile Vital (never a validation failure); visa
 * type preserved separately from citizenship; lender-matching never
 * auto-rejects a no-FICO scenario; and the required regression protections.
 */

// ---------------------------------------------------------------------------
// Section 1: F-1 visa -> Foreign National, every listed semantic variation.
// ---------------------------------------------------------------------------
describe("F-1 visa recognized as Foreign National (every spec-listed variation)", () => {
  const phrases = [
    "F-1 visa",
    "F1 visa",
    "F one visa",
    "here on an F-1",
    "borrower has an F-1",
    "borrower is studying in the united states on a visa",
    "foreign student",
    "international student",
    "non-u.s. student studying in America",
    "borrower is here temporarily for school",
    "borrower does not have permanent residency and is here on an F-1 visa",
    "student visa",
    "international student visa",
  ];
  for (const p of phrases) {
    it(`classifies "${p}" as foreign_national`, () => {
      const m = classifyCitizenship(p.toLowerCase());
      expect(m?.value).toBe("foreign_national");
    });
  }

  it("never leaves citizenship blank for a plain F-1 mention", () => {
    const x = extractFromTranscript("The borrower is here on an F-1 visa and has no FICO.");
    expect(x.citizenship).toBeDefined();
    expect(x.citizenship?.value).toBe("foreign_national");
  });

  it("never misclassifies an F-1 borrower as U.S. citizen, permanent resident, or ITIN", () => {
    for (const p of ["F-1 visa", "F1 visa", "international student", "foreign student"]) {
      const m = classifyCitizenship(p.toLowerCase());
      expect(m?.value).not.toBe("us_citizen");
      expect(m?.value).not.toBe("permanent_resident");
      expect(m?.value).not.toBe("itin");
    }
  });
});

// ---------------------------------------------------------------------------
// Section 4: visa type preserved SEPARATELY from citizenship classification.
// ---------------------------------------------------------------------------
describe("Visa type preserved separately (F-1)", () => {
  it("preserves visaType='F-1' for a literal F-1/F1/F-one mention", () => {
    for (const p of ["F-1 visa", "F1 visa", "F one visa", "F-one visa", "here on an F-1"]) {
      const m = classifyCitizenship(p.toLowerCase());
      expect(m?.value).toBe("foreign_national");
      expect(m?.visaType).toBe("F-1");
    }
  });

  it("does not force visaType for purely descriptive student phrasing (no literal F-1 code stated)", () => {
    const m = classifyCitizenship("international student");
    expect(m?.value).toBe("foreign_national");
    expect(m?.visaType).toBeUndefined();
  });

  it("flows visaType through extraction end-to-end", () => {
    const x = extractFromTranscript("Purchase, single-family primary residence, $500,000 value, $400,000 loan, DSCR, F-1 visa, no FICO.");
    expect(x.citizenship?.visaType).toBe("F-1");
  });

  it("carries visaType into the built ScenarioInput", () => {
    const x = extractFromTranscript(
      "Purchase of a single-family investment property worth $500,000, loan amount $400,000, DSCR income documentation, F-1 visa, no FICO.",
    );
    const a = assess(x);
    expect(a.readyToAnalyze).toBe(true);
    const input = buildScenarioInput(x, a);
    expect(input.citizenship).toBe("foreign_national");
    expect(input.visaType).toBe("F-1");
    expect(input.fico).toBeUndefined();
    expect(input.creditProfileType).toBe("no_fico");
  });
});

// ---------------------------------------------------------------------------
// Section 2/3/9: "No FICO" and its real semantic variations as a VALID
// nonnumeric credit-profile Vital.
// ---------------------------------------------------------------------------
describe("No-FICO / nonnumeric credit-profile recognition", () => {
  const noFicoPhrases = [
    "the borrower does not have a FICO score",
    "no FICO",
    "no credit score",
    "the borrower has not established credit",
    "the borrower has no established tradelines",
    "the borrower does not have a social security-based credit profile",
    "credit score is unavailable",
    "FICO is not applicable",
    "N/A FICO",
    "no U.S. credit score",
    "the borrower has never used credit in the united states",
    "the borrower recently arrived in the united states and has no FICO",
  ];
  for (const p of noFicoPhrases) {
    it(`recognizes "${p}" as a resolved nonnumeric credit profile`, () => {
      const m = classifyCreditProfile(p.toLowerCase());
      expect(m).toBeDefined();
      expect(["no_fico", "no_us_credit", "insufficient_credit_history", "unknown"]).toContain(m?.value);
    });
  }

  it('"foreign credit only" resolves to foreign_credit', () => {
    expect(classifyCreditProfile("foreign credit only")?.value).toBe("foreign_credit");
  });

  it('"no domestic credit history" resolves to no_us_credit', () => {
    expect(classifyCreditProfile("the borrower has no domestic credit history")?.value).toBe("no_us_credit");
  });

  it("does not populate creditProfileType when a numeric FICO was already found", () => {
    const x = extractFromTranscript("Purchase, primary residence, $500,000 value, $400,000 loan, credit score 720, no FICO mentioned again.");
    expect(x.fico?.value).toBe(720);
    expect(x.creditProfileType).toBeUndefined();
  });

  it("populates creditProfileType='no_fico' for the spec's own worked example", () => {
    const x = extractFromTranscript("The borrower is here on an F-1 visa and does not have a FICO score.");
    expect(x.fico).toBeUndefined();
    expect(x.creditProfileType?.value).toBe("no_fico");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.citizenship?.visaType).toBe("F-1");
  });
});

// ---------------------------------------------------------------------------
// Section 9: corrected validation — a null numeric FICO is VALID when
// creditProfileType is a recognized nonnumeric status; never a failure.
// ---------------------------------------------------------------------------
describe("hasValidCreditProfile — corrected validation rule", () => {
  it("is satisfied by a numeric FICO alone", () => {
    expect(hasValidCreditProfile({ fico: 680 })).toBe(true);
  });
  it("is satisfied by a recognized nonnumeric creditProfileType with fico null", () => {
    for (const t of ["no_fico", "no_us_credit", "foreign_credit", "insufficient_credit_history", "unknown"]) {
      expect(hasValidCreditProfile({ fico: null, creditProfileType: t })).toBe(true);
    }
  });
  it("is NOT satisfied when neither is present", () => {
    expect(hasValidCreditProfile({})).toBe(false);
  });
  it("rejects an unrecognized creditProfileType string", () => {
    expect(hasValidCreditProfile({ creditProfileType: "bogus" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 7: Vital-gate behavior — the credit-profile Vital resolves via
// EITHER fico or creditProfileType; readyToAnalyze is never blocked by a
// legitimately-captured no-FICO status, and the assistant never asks for a
// numeric score once a valid nonnumeric status was captured.
// ---------------------------------------------------------------------------
describe("Voice dialog: no-FICO resolves the credit-profile Vital", () => {
  const fullNoFicoScenario =
    "Purchase of a single-family investment property worth $500,000, loan amount $400,000, DSCR income documentation, F-1 visa, no FICO.";

  it("does not include 'fico' in missing vitals once creditProfileType is captured", () => {
    const x = extractFromTranscript(fullNoFicoScenario);
    const a = assess(x);
    expect(a.missing).not.toContain("fico");
  });

  it("readyToAnalyze is true for an otherwise-complete no-FICO scenario", () => {
    const x = extractFromTranscript(fullNoFicoScenario);
    const a = assess(x);
    expect(a.readyToAnalyze).toBe(true);
  });

  it("never asks the user to enter a numeric credit score once no-FICO is captured", () => {
    const x = extractFromTranscript(fullNoFicoScenario);
    const a = assess(x);
    expect(a.questions.join(" ").toLowerCase()).not.toMatch(/what's the credit score\?$/);
  });

  it("surfaces a visaClassificationNote and noFicoNote explaining what was auto-populated", () => {
    const x = extractFromTranscript(fullNoFicoScenario);
    const a = assess(x);
    expect(a.visaClassificationNote).toMatch(/foreign national/i);
    expect(a.visaClassificationNote).toMatch(/F-1/);
    expect(a.noFicoNote).toMatch(/no fico/i);
    expect(a.noFicoNote).toMatch(/lender/i);
  });

  it("still blocks readyToAnalyze when citizenship was never mentioned at all", () => {
    const x = extractFromTranscript(
      "Purchase of a single-family investment property worth $500,000, loan amount $400,000, DSCR income documentation, no FICO.",
    );
    const a = assess(x);
    expect(a.missing).toContain("citizenship");
    expect(a.readyToAnalyze).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 5: lender-matching logic — never auto-reject a no-FICO scenario;
// the outcome depends entirely on the program's documented noFicoPolicy.
// ---------------------------------------------------------------------------
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
    citizenship: "foreign_national",
    visaType: "F-1",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

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
    citizenshipEligible: ["foreign_national"],
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

const calc: CalculationSummary = { results: [] } as unknown as CalculationSummary;

describe("Lender matching never auto-rejects a no-FICO scenario", () => {
  it('never hard-fails a no-FICO scenario just for lacking a numeric FICO when the program is silent ("guidelines do not specify")', () => {
    const scenario = baseScenario({ creditProfileType: "no_fico" });
    const program = baseProgram(); // no noFicoPolicy documented
    const results = baseProgramChecks(scenario, calc, program);
    const noFicoResult = results.find((r) => r.ruleId.endsWith(":nofico"));
    expect(noFicoResult).toBeDefined();
    expect(noFicoResult?.outcome).toBe(RuleOutcome.ManualReview);
    expect(noFicoResult?.severity).toBe(RuleSeverity.Soft);
    expect(noFicoResult?.userExplanation.toLowerCase()).toMatch(/do not specify/);
    // never a hard-fail rejection
    expect(results.some((r) => r.ruleId.endsWith(":nofico") && r.outcome === RuleOutcome.Fail)).toBe(false);
  });

  it('passes cleanly when the program explicitly documents noFicoPolicy="eligible"', () => {
    const scenario = baseScenario({ creditProfileType: "no_fico" });
    const program = baseProgram({ noFicoPolicy: "eligible" });
    const results = baseProgramChecks(scenario, calc, program);
    const noFicoResult = results.find((r) => r.ruleId.endsWith(":nofico"));
    expect(noFicoResult?.outcome).toBe(RuleOutcome.Pass);
  });

  it('flags alternative-credit documentation as a manual-review item, not a rejection, when noFicoPolicy="eligible_with_alternative_credit"', () => {
    const scenario = baseScenario({ creditProfileType: "foreign_credit" });
    const program = baseProgram({ noFicoPolicy: "eligible_with_alternative_credit" });
    const results = baseProgramChecks(scenario, calc, program);
    const noFicoResult = results.find((r) => r.ruleId.endsWith(":nofico"));
    expect(noFicoResult?.outcome).toBe(RuleOutcome.ManualReview);
    expect(noFicoResult?.userExplanation.toLowerCase()).toMatch(/alternative credit/);
  });

  it('genuinely fails ONLY when the program explicitly requires a numeric U.S. FICO', () => {
    const scenario = baseScenario({ creditProfileType: "no_fico" });
    const program = baseProgram({ noFicoPolicy: "requires_us_fico" });
    const results = baseProgramChecks(scenario, calc, program);
    const noFicoResult = results.find((r) => r.ruleId.endsWith(":nofico"));
    expect(noFicoResult?.outcome).toBe(RuleOutcome.Fail);
    expect(noFicoResult?.severity).toBe(RuleSeverity.Hard);
  });

  it("applies a documented no-FICO LTV cap without loosening the base cap", () => {
    const scenario = baseScenario({ creditProfileType: "no_fico" });
    const program = baseProgram({ baseMaxLtv: 75, noFicoMaxLtv: 65 });
    expect(deriveMaxLtv(scenario, program)).toBe(65);
  });

  it("does not apply the no-FICO LTV cap to a scenario WITH a numeric FICO", () => {
    const scenario = baseScenario({ fico: 700, creditProfileType: undefined });
    const program = baseProgram({ baseMaxLtv: 75, noFicoMaxLtv: 65 });
    expect(deriveMaxLtv(scenario, program)).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Section 12: the eight required statements, with the expected distinctions.
// ---------------------------------------------------------------------------
describe("Required automated tests (spec section 12)", () => {
  it("1. 'The borrower is here on an F-1 visa and has no FICO.'", () => {
    const x = extractFromTranscript("The borrower is here on an F-1 visa and has no FICO.");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.citizenship?.visaType).toBe("F-1");
    expect(x.fico).toBeUndefined();
    expect(x.creditProfileType?.value).toBe("no_fico");
  });

  it("2. 'My client is an international student with no U.S. credit score.'", () => {
    const x = extractFromTranscript("My client is an international student with no U.S. credit score.");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.creditProfileType?.value).toBe("no_us_credit");
  });

  it("3. 'The borrower has an F1 student visa and foreign credit only.'", () => {
    const x = extractFromTranscript("The borrower has an F1 student visa and foreign credit only.");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.citizenship?.visaType).toBe("F-1");
    expect(x.creditProfileType?.value).toBe("foreign_credit");
  });

  it("4. 'They are here for school and have never established U.S. credit.'", () => {
    const x = extractFromTranscript("They are here for school and have never established U.S. credit.");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.creditProfileType?.value).toBe("no_us_credit");
  });

  it("5. 'This is a foreign-national borrower with no credit score.'", () => {
    const x = extractFromTranscript("This is a foreign-national borrower with no credit score.");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.creditProfileType?.value).toBe("no_fico");
  });

  it("6. 'The client has an F-one visa, no FICO, and wants an investment property.'", () => {
    const x = extractFromTranscript("The client has an F-one visa, no FICO, and wants an investment property.");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.citizenship?.visaType).toBe("F-1");
    expect(x.creditProfileType?.value).toBe("no_fico");
    expect(x.occupancy?.value).toBe("investment");
  });

  it("7. 'The borrower has an F-1 visa and a 720 FICO.' — numeric FICO populates, no-FICO does not", () => {
    const x = extractFromTranscript("The borrower has an F-1 visa and a 720 FICO.");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.citizenship?.visaType).toBe("F-1");
    expect(x.fico?.value).toBe(720);
    expect(x.creditProfileType).toBeUndefined();
  });

  it("8. 'The borrower is a non-permanent resident with an EAD and a 680 FICO.' — EAD stays Non-Permanent Resident, never Foreign National", () => {
    const x = extractFromTranscript("The borrower is a non-permanent resident with an EAD and a 680 FICO.");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.citizenship?.value).not.toBe("foreign_national");
    expect(x.fico?.value).toBe(680);
  });
});

// ---------------------------------------------------------------------------
// Section 13: regression protection — existing citizenship/FICO recognition
// (and F-1 OPT staying Non-Permanent Resident) must be untouched.
// ---------------------------------------------------------------------------
describe("Regression protection", () => {
  it("U.S. citizen recognition is unaffected", () => {
    expect(classifyCitizenship("u.s. citizen")?.value).toBe("us_citizen");
  });
  it("Permanent resident recognition is unaffected", () => {
    expect(classifyCitizenship("green card holder")?.value).toBe("permanent_resident");
  });
  it("ITIN recognition is unaffected", () => {
    expect(classifyCitizenship("itin borrower")?.value).toBe("itin");
  });
  it("EAD / Non-Permanent Resident recognition is unaffected", () => {
    expect(classifyCitizenship("ead holder")?.value).toBe("non_permanent_resident");
  });
  it("Plain foreign national phrasing is unaffected", () => {
    expect(classifyCitizenship("foreign national")?.value).toBe("foreign_national");
  });
  it("F-1 OPT / STEM OPT keeps classifying as Non-Permanent Resident, not Foreign National (real employment-authorization extension)", () => {
    expect(classifyCitizenship("f-1 opt")?.value).toBe("non_permanent_resident");
    expect(classifyCitizenship("stem opt")?.value).toBe("non_permanent_resident");
    expect(classifyCitizenship("on the opt")?.value).toBe("non_permanent_resident");
  });
  it("A numeric FICO score is still extracted normally", () => {
    const x = extractFromTranscript("Credit score 742, purchase, primary residence.");
    expect(x.fico?.value).toBe(742);
    expect(x.creditProfileType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Section 11: broad semantic-variation sweep (a representative, generated
// cross-product rather than a literally-1000-line fixture list) — every
// variation must independently resolve to Foreign National + a valid
// credit-profile status, never leaving either Vital blank.
// ---------------------------------------------------------------------------
describe("Broad semantic-variation sweep — F-1 + no-FICO combinations", () => {
  const visaPhrasings = [
    "F-1 visa",
    "F1 visa",
    "F one visa",
    "F-one visa",
    "an F-1",
    "international student",
    "foreign student",
    "student visa",
  ];
  const creditPhrasings = [
    "no FICO",
    "no credit score",
    "does not have a FICO score",
    "has not established credit",
    "credit score is unavailable",
    "FICO is not applicable",
    "no U.S. credit score",
    "foreign credit only",
    "has no domestic credit history",
    "never used credit in the united states",
  ];

  let count = 0;
  for (const visa of visaPhrasings) {
    for (const credit of creditPhrasings) {
      const sentence = `The borrower has an ${visa} and ${credit}.`;
      count++;
      it(`[${count}] "${sentence}" resolves both Vitals`, () => {
        const x = extractFromTranscript(sentence);
        expect(x.citizenship?.value).toBe("foreign_national");
        expect(x.fico).toBeUndefined();
        expect(x.creditProfileType).toBeDefined();
      });
    }
  }

  it(`generated ${count} F-1 x credit-profile combinations`, () => {
    expect(count).toBe(visaPhrasings.length * creditPhrasings.length);
  });
});
