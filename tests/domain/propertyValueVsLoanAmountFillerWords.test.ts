import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";

// Second round of regression tests (2026-07-28), added after re-testing the
// property-value/loan-amount fix at scale (a 4,900-case combinatorial fuzz
// run across 4 seeds plus an 800-case refi three-way run) surfaced two
// further real bugs the first regression batch didn't cover:
//
// Bug 3 — filler-word distance inflation. A copula/preposition directly
// between a PRECEDING label and its number ("value IS 500000", "appraised
// AT 500000") was counted literally in the character gap, while a
// following label with no filler word ("financing 400000" — the number
// sits directly against the word) measured as artificially closer. That
// meant "value is $1,200,000 looking to borrow $1,080,000" swapped the two
// figures even though the correct label directly precedes each number.
// Fixed by collapsing a gap that consists ONLY of known filler words
// (is/was/at/of/around/about/...) to near-zero, so labels with and without
// a linking verb compete fairly.
//
// Bug 4 — bare "appraised" (past participle) was never recognized as a
// property-value signal at all — only "appraised value"/"appraisal
// value"/"appraisal"/"appraise" were, none of which match "appraised at
// $500,000" (a very common real phrasing). That left the number
// completely unclassified by the value side, so it fell through to
// whatever loan-amount term happened to be nearby instead.
describe("Property value vs. loan amount — filler-word and 'appraised' fixes", () => {
  const cases: Array<[string, number, number]> = [
    ["value is $1,200,000 looking to borrow $1,080,000", 1_200_000, 1_080_000],
    ["appraised at $500,000, financing $400,000", 500_000, 400_000],
    ["appraised at one million two hundred thousand and the loan amount is $960,000", 1_200_000, 960_000],
    ["loan is $400,000 appraisal value is $500,000", 500_000, 400_000],
    ["mortgage amount is $723,000 appraisal value is $850,000", 850_000, 723_000],
    ["purchase price is $350,000 wants to finance $333,000", 350_000, 333_000],
    ["the loan amount is $900,000 purchase price is $1,200,000", 1_200_000, 900_000],
    ["appraised at $620,000 mortgage amount is $496,000", 620_000, 496_000],
    ["appraised at 350,000, loan amount is $245,000", 350_000, 245_000],
    ["home price is $850,000 borrower needs $680,000", 850_000, 680_000],
  ];

  for (const [transcript, expectedValue, expectedLoan] of cases) {
    it(`"${transcript}" -> value $${expectedValue}, loan $${expectedLoan}`, () => {
      const x = extractFromTranscript(transcript);
      expect(x.propertyValue?.value, transcript).toBe(expectedValue);
      expect(x.loanAmount?.value, transcript).toBe(expectedLoan);
    });
  }
});

describe("Refinance three-way amounts (value / existing lien / cash-out) share the same fix", () => {
  it("keeps all three figures distinct and correctly attributed with no clause punctuation between them", () => {
    const x = extractFromTranscript(
      "the property is worth $700,000 existing mortgage balance is $280,000 requesting cash out of $70,000"
    );
    expect(x.propertyValue?.value).toBe(700_000);
    expect(x.existingLienBalance?.value).toBe(280_000);
    expect(x.requestedCashOut?.value).toBe(70_000);
  });

  it("still works when the order is shuffled (cash-out, then lien, then value)", () => {
    const x = extractFromTranscript(
      "taking out $90,000 and current mortgage balance of $540,000 and worth $900,000"
    );
    expect(x.requestedCashOut?.value).toBe(90_000);
    expect(x.existingLienBalance?.value).toBe(540_000);
    expect(x.propertyValue?.value).toBe(900_000);
  });
});
