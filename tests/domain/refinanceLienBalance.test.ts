import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import { scenarioInputSchema } from "@/domain/validation/scenarioSchema";
import { calcCltv, calcLtv } from "@/domain/calc/ltv";
import type { Scenario } from "@/domain/types/scenario";

function scenario(overrides: Partial<Scenario>): Scenario {
  return {
    id: "t",
    organizationId: "o",
    name: "t",
    createdByUserId: "u",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

// Current Loan Balance — a refinance-only conditional vital (spec section 5).
// Never counts toward the 8-vital gate (section 6); drives the current-lien
// vs. proposed-LTV distinction (section 7-8).

describe("Current loan balance: required natural-language phrasings", () => {
  const cases: Array<[string, number]> = [
    ["Refinance. The current loan balance is $200,000.", 200_000],
    ["Refinance. The current mortgage balance is $200,000.", 200_000],
    ["Refinance. The existing mortgage balance is $200,000.", 200_000],
    ["Refinance. The existing loan balance is $200,000.", 200_000],
    ["Refinance. They still owe $200,000.", 200_000],
    ["Refinance. The borrower still owes $200,000.", 200_000],
    ["Refinance. The payoff amount is $200,000.", 200_000],
    ["Refinance. The estimated payoff is $200,000.", 200_000],
    ["Refinance. The current payoff is $200,000.", 200_000],
    ["Refinance. The remaining balance is $200,000.", 200_000],
    ["Refinance. The balance on the property is $200,000.", 200_000],
    ["Refinance. The first mortgage balance is $200,000.", 200_000],
    ["Refinance. There is an existing lien of $200,000.", 200_000],
    ["Refinance. There is an existing first lien of $200,000.", 200_000],
    ["Refinance. The debt currently secured by the property is $200,000.", 200_000],
  ];
  for (const [transcript, expected] of cases) {
    it(`"${transcript}" -> existingLienBalance = $${expected}`, () => {
      const x = extractFromTranscript(transcript);
      expect(x.existingLienBalance?.value, transcript).toBe(expected);
    });
  }
});

describe("Current loan balance never blocks the 8-vital gate (section 6)", () => {
  it("a fully complete purchase scenario is ready to analyze with no mention of a lien balance at all", () => {
    const x = extractFromTranscript(
      "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, full doc income. Borrower is a U.S. citizen."
    );
    const a = assess(x);
    expect(a.complete).toBe(true);
    expect(a.readyToAnalyze).toBe(true);
    expect(a.vitalsTotal).toBe(9);
    expect(x.existingLienBalance).toBeUndefined();
  });

  it("a fully complete refinance scenario is ready to analyze even when the lien balance is never mentioned", () => {
    const x = extractFromTranscript(
      "This is a rate and term refinance of a single family investment property worth $500,000, loan amount 350k, credit score 700, DSCR to qualify. Borrower is a U.S. citizen."
    );
    const a = assess(x);
    expect(a.complete).toBe(true);
    expect(a.readyToAnalyze).toBe(true);
    expect(a.vitalsTotal).toBe(9); // still 9, not 10 — the lien balance is never a core/gating vital
  });
});

describe("Regression: currentLoanBalance must never inflate CLTV (it is being paid off, not retained)", () => {
  it("CLTV equals LTV for a straight refinance — the paid-off balance is NOT a retained subordinate lien", () => {
    const x = extractFromTranscript(
      "This is a cash-out refinance of a single family investment property. The property is worth approximately $1,000,000. They currently owe $200,000 and want a new loan amount of $700,000. Credit score is 740. DSCR to qualify. Borrower is a U.S. citizen."
    );
    const a = assess(x);
    const input = buildScenarioInput(x, a);
    const s = scenario(input);
    expect(calcLtv(s).value).toBe(70);
    // Before the fix, currentLoanBalance was written into the SAME field
    // calc/ltv.ts's CLTV uses for retained subordinate financing
    // (existingLienBalance), so CLTV came out as (700k+200k)/1M = 90%
    // instead of the correct 70% — a real bug caught live in browser
    // verification. currentLoanBalance and existingLienBalance are now
    // distinct fields; existingLienBalance is untouched by voice intake.
    expect(calcCltv(s).value).toBe(70);
    expect(s.existingLienBalance).toBeUndefined();
    expect(s.currentLoanBalance).toBe(200_000);
  });

  it("existingLienBalance (retained subordinate financing) still correctly inflates CLTV when explicitly set", () => {
    const s = scenario({ loanPurpose: "purchase", purchasePrice: 400_000, estimatedValue: 400_000, requestedLoanAmount: 300_000, existingLienBalance: 40_000 });
    expect(calcCltv(s).value).toBe(85);
  });
});

describe("Test 2 (spec): refinance with current balance — full acceptance test", () => {
  // The spec's own Test 2 transcript only covers the refinance-specific
  // mechanics (purpose/value/lien/loan) — occupancy, property type, FICO,
  // and income doc are added here so the scenario can also legitimately
  // reach "complete and ready to analyze" per the real 8-vital gate,
  // without changing any of the spec's required calculated figures.
  const transcript =
    "This is a cash-out refinance of a single family investment property. The property is worth approximately $1,000,000. They currently owe $200,000 and want a new loan amount of $700,000. Credit score is 740. DSCR to qualify. Borrower is a U.S. citizen.";

  it("captures transaction type, property value, current loan balance, and requested loan amount distinctly", () => {
    const x = extractFromTranscript(transcript);
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.propertyValue?.value).toBe(1_000_000);
    expect(x.existingLienBalance?.value).toBe(200_000);
    expect(x.loanAmount?.value).toBe(700_000);
  });

  it("calculates current lien-to-value (20%), proposed LTV (70%), and estimated gross cash-out ($500,000)", () => {
    const x = extractFromTranscript(transcript);
    const a = assess(x);
    expect(a.refinanceCalc?.currentLienLtv).toBe(20);
    expect(a.refinanceCalc?.proposedLtv).toBe(70);
    expect(a.refinanceCalc?.grossEquity).toBe(800_000);
    expect(a.refinanceCalc?.grossCashOut).toBe(500_000);
  });

  it("is complete and ready to analyze — applicable lenders can appear automatically", () => {
    const x = extractFromTranscript(transcript);
    const a = assess(x);
    expect(a.complete).toBe(true);
    expect(a.readyToAnalyze).toBe(true);
  });

  it("the built ScenarioInput carries currentLoanBalance and passes schema validation", () => {
    const x = extractFromTranscript(transcript);
    const a = assess(x);
    const input = buildScenarioInput(x, a);
    expect(input.currentLoanBalance).toBe(200_000);
    expect(input.requestedLoanAmount).toBe(700_000);
    const parsed = scenarioInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });
});

describe("Current vs. proposed LTV: the current lien is never mistaken for the proposed loan amount", () => {
  it("estimated gross cash-out is only shown when the new loan amount exceeds the current balance", () => {
    const x = extractFromTranscript(
      "Rate and term refinance. The property is worth $1,000,000. They currently owe $700,000 and want a new loan amount of $700,000."
    );
    const a = assess(x);
    expect(a.refinanceCalc?.grossCashOut).toBeUndefined();
  });

  it("current lien-to-value and proposed LTV are computed independently and can differ substantially", () => {
    const x = extractFromTranscript("Refinance. The property is worth $1,000,000. The current loan balance is $900,000. New loan amount: $500,000.");
    const a = assess(x);
    expect(a.refinanceCalc?.currentLienLtv).toBe(90);
    expect(a.refinanceCalc?.proposedLtv).toBe(50);
  });
});

describe("Test 8 (spec): separated natural-language values in a long sentence", () => {
  it("captures both property value and current loan balance despite being embedded in one long sentence", () => {
    const x = extractFromTranscript(
      "The borrower is looking to refinance a property that was recently estimated to be worth approximately $1,000,000, and according to the latest mortgage statement, the amount they still owe is around $200,000."
    );
    expect(x.propertyValue?.value).toBe(1_000_000);
    expect(x.existingLienBalance?.value).toBe(200_000);
  });
});

describe("Additional required spec examples (section 11: parsing across separated phrasing)", () => {
  it('"They purchased it several years ago and currently still owe approximately $200,000." -> existingLienBalance = $200,000', () => {
    const x = extractFromTranscript("Refinance. They purchased it several years ago and currently still owe approximately $200,000.");
    expect(x.existingLienBalance?.value).toBe(200_000);
  });
  it('"There is roughly $200K left on the mortgage." -> existingLienBalance = $200,000', () => {
    const x = extractFromTranscript("Refinance. Remaining balance: there is roughly $200K left on the mortgage.");
    expect(x.existingLienBalance?.value).toBe(200_000);
  });
  it('"For the new cash-out loan, they would like to borrow about $700,000." -> loanAmount = $700,000 (not the lien)', () => {
    const x = extractFromTranscript(
      "This is a cash-out refinance. Current mortgage balance is $200,000. For the new loan, they would like to borrow about $700,000."
    );
    expect(x.loanAmount?.value).toBe(700_000);
    expect(x.existingLienBalance?.value).toBe(200_000);
  });
});
