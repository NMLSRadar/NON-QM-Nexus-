import { describe, expect, it } from "vitest";
import { extractFromTranscript, normalizeTranscript, classifyMortgageAmounts } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";

// Semantic (non-proximity) extraction and calculation for Property Value,
// Loan Amount, and LTV. Covers the reported bug ("estimated to be about
// $600,000" / "$600,000 in value" not populating Property Value because the
// old extractor required the label word immediately before/after the
// number) plus the acceptance tests and phrase list from the spec.

describe("Property Value: all required natural phrasings populate $600,000", () => {
  const phrases = [
    "The property value is $600,000.",
    "The value is estimated to be about $600,000.",
    "It is estimated at around $600,000 in value.",
    "We are looking at a $600,000 property.",
    "The home is worth approximately $600,000.",
    "The purchase price should be close to $600,000.",
    "They are buying it for about $600,000.",
    "The subject property is valued somewhere around $600,000.",
    "It is a single-family residence estimated at roughly $600,000.",
    "Around $600,000 is what we expect the property to appraise for.",
    "Six hundred thousand purchase price.",
    "Approximately six hundred thousand dollars.",
    "600K value.",
    "A value of about 600.",
    "The home is around six hundred.",
    "It should appraise somewhere in the six-hundred-thousand-dollar range.",
  ];
  for (const p of phrases) {
    it(`"${p}" -> Property Value = $600,000`, () => {
      const x = extractFromTranscript(p);
      expect(x.propertyValue?.value, p).toBe(600_000);
    });
  }
});

describe("normalizeTranscript: numeric and spoken-number formats", () => {
  const cases: Array<[string, string]> = [
    ["$600,000", "600000"],
    ["600,000", "600000"],
    ["600000", "600000"],
    ["600k", "600000"],
    ["600 K", "600000"],
    ["six hundred thousand", "600000"],
    ["six-hundred-thousand", "600000"],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" normalizes to contain "${expected}"`, () => {
      expect(normalizeTranscript(input)).toContain(expected);
    });
  }
});

describe("Disambiguation: unrelated numbers are never mistaken for a mortgage amount", () => {
  it('a 740 credit score is never read as $740,000', () => {
    const x = extractFromTranscript("Their credit score is 740 and the property is worth $600,000.");
    expect(x.fico?.value).toBe(740);
    expect(x.propertyValue?.value).toBe(600_000);
  });
  it('rent and property value in the same sentence are captured distinctly, not confused', () => {
    const x = extractFromTranscript("The rent is $4,500 and the property value is around $600,000.");
    expect(x.propertyValue?.value).toBe(600_000);
    expect(x.loanAmount).toBeUndefined();
  });
  it('an income figure and a loan amount in the same sentence are not conflated', () => {
    const x = extractFromTranscript("The borrower earns $600,000 annually and wants a $450,000 loan.");
    expect(x.loanAmount?.value).toBe(450_000);
    expect(x.propertyValue).toBeUndefined(); // income is not mistaken for property value
  });
});

describe("Required acceptance tests (spec items 14.A-14.J)", () => {
  it("Test A: 'Property value is estimated to be about 600,000.' -> Property Value = $600,000", () => {
    const x = extractFromTranscript("Property value is estimated to be about 600,000.");
    expect(x.propertyValue?.value).toBe(600_000);
  });

  it("Test B: 'It is estimated at around $600,000 in value.' -> Property Value = $600,000", () => {
    const x = extractFromTranscript("It is estimated at around $600,000 in value.");
    expect(x.propertyValue?.value).toBe(600_000);
  });

  it("Test C: 'The house is worth about six hundred thousand.' -> Property Value = $600,000", () => {
    const x = extractFromTranscript("The house is worth about six hundred thousand.");
    expect(x.propertyValue?.value).toBe(600_000);
  });

  it("Test D: '80% LTV on a property worth approximately $600,000' -> value=600k, ltv=80%, loan=480k calculated", () => {
    const x = extractFromTranscript("We are looking at 80% LTV on a property worth approximately $600,000.");
    expect(x.propertyValue?.value).toBe(600_000);
    expect(x.statedLtv?.value).toBe(80);
    const a = assess(x);
    expect(a.derived.loanAmount).toBe(480_000);
  });

  it("Test E: purchase price $600,000 and loan request $450,000 -> ltv 75% calculated", () => {
    const x = extractFromTranscript("The purchase price is $600,000 and the loan request is $450,000.");
    expect(x.propertyValue?.value).toBe(600_000);
    expect(x.loanAmount?.value).toBe(450_000);
    const a = assess(x);
    expect(a.derived.ltv).toBe(75);
  });

  it("Test F: loan amount $480,000 at 80% LTV -> property value $600,000 calculated", () => {
    const x = extractFromTranscript("The loan amount is $480,000 at 80% LTV.");
    expect(x.loanAmount?.value).toBe(480_000);
    expect(x.statedLtv?.value).toBe(80);
    const a = assess(x);
    expect(a.derived.propertyValue).toBe(600_000);
  });

  it("Test G: '20% down on a $600,000 purchase' -> value=600k, ltv=80% (converted from down payment), loan=480k", () => {
    const x = extractFromTranscript("They are putting 20% down on a $600,000 purchase.");
    expect(x.propertyValue?.value).toBe(600_000);
    expect(x.statedLtv?.value).toBe(80);
    const a = assess(x);
    expect(a.derived.loanAmount).toBe(480_000);
  });

  it("Test H: rent, credit score, and value in one sentence — only Property Value and FICO are captured by this app's tracked vitals", () => {
    const x = extractFromTranscript("The rent is $4,500, the credit score is 740, and the value is roughly $600,000.");
    expect(x.fico?.value).toBe(740);
    expect(x.propertyValue?.value).toBe(600_000);
    expect(x.loanAmount).toBeUndefined(); // the rent figure must never be misread as a loan amount
  });

  it("Test I: income, loan amount, and property value in one sentence — LTV calculates from loan/value only", () => {
    const x = extractFromTranscript("The borrower earns $600,000 annually and is requesting a $480,000 loan on a property worth $750,000.");
    expect(x.loanAmount?.value).toBe(480_000);
    expect(x.propertyValue?.value).toBe(750_000);
    const a = assess(x);
    expect(a.derived.ltv).toBe(64);
  });

  it("Test J: a later correction re-derives LTV from the new loan amount while property value is unchanged", () => {
    const first = extractFromTranscript("The property is worth $600,000 and they want 80% LTV.");
    const a1 = assess(first);
    expect(a1.derived.loanAmount).toBe(480_000);

    // The whole transcript is reprocessed on every edit — including a
    // trailing correction appended to the same session — rather than only
    // parsing newly added words, so the corrected figure takes precedence.
    const corrected = extractFromTranscript(
      "The property is worth $600,000 and they want 80% LTV. Actually, the loan amount will be $450,000."
    );
    expect(corrected.loanAmount?.value).toBe(450_000);
    expect(corrected.propertyValue?.value).toBe(600_000);
    const a2 = assess(corrected);
    expect(a2.derived.ltv).toBe(75);
  });
});

describe("Regression: the reported screenshot transcript (multi-sentence, LTV stated far from the value)", () => {
  it("captures property value even when separated from its keyword by other complete sentences", () => {
    const raw =
      "Good afternoon. I have a first-time home buyer looking to purchase their first investment property at 80% LTV. Their credit score is 740, and they are trying to use DSCR to qualify. Property value is estimated to be about 600,000, and it is a single-family residence. Borrower is a U.S. citizen.";
    const x = extractFromTranscript(raw);
    expect(x.propertyValue?.value).toBe(600_000);
    expect(x.statedLtv?.value).toBe(80);
    expect(x.fico?.value).toBe(740);
    const a = assess(x);
    expect(a.complete).toBe(true);
    expect(a.readyToAnalyze).toBe(true);
    expect(a.derived.loanAmount).toBe(480_000);
  });
});

describe("classifyMortgageAmounts: exported classifier is directly testable", () => {
  it("returns undefined fields (never throws) on transcript with no mortgage amounts", () => {
    const result = classifyMortgageAmounts(normalizeTranscript("purchase primary single family full doc"));
    expect(result.propertyValue).toBeUndefined();
    expect(result.loanAmount).toBeUndefined();
    expect(result.ltv).toBeUndefined();
  });
  it("down-payment percentages convert to LTV (100 - down%)", () => {
    const result = classifyMortgageAmounts(normalizeTranscript("25% down on the purchase"));
    expect(result.ltv?.value).toBe(75);
  });
  it("a direct LTV/leverage mention is used as-is, not inverted", () => {
    const result = classifyMortgageAmounts(normalizeTranscript("70% leverage on this deal"));
    expect(result.ltv?.value).toBe(70);
  });
});
