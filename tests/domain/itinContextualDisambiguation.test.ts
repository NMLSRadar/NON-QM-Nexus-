import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";

// ITIN detection + contextual disambiguation, per the platform spec
// (2026-07-28): "I-10"/"I ten"/"eye ten" are genuinely ambiguous with
// Interstate 10 and must be resolved using nearby mortgage-borrower context,
// never assumed unconditionally. Unambiguous ITIN phrasings (the literal
// word, spelled letters, "eye-tin", "individual taxpayer ID", "no SSN", tax
// ID references, etc.) are always high confidence regardless of context.
describe("ITIN detection — unambiguous phrasings (always high confidence)", () => {
  const highConfidencePhrases = [
    "the borrower has an ITIN",
    "the client uses an ITIN number",
    "the borrower files taxes with an ITIN",
    "the client has a taxpayer identification number",
    "individual taxpayer identification number",
    "tax ID borrower",
    "borrower only has a tax identification number",
    "Mexican national using an ITIN",
    "undocumented borrower with an ITIN",
    "borrower has an ITIN instead of an SSN",
    "no SSN, but they have an ITIN",
    "they do not have a Social Security number",
    "the borrower doesn't have a social security number",
  ];
  for (const phrase of highConfidencePhrases) {
    it(`"${phrase}" -> ITIN, high confidence`, () => {
      const x = extractFromTranscript(phrase);
      expect(x.citizenship?.value, phrase).toBe("itin");
      expect(x.citizenship?.confidence, phrase).toBe("high");
    });
  }
});

describe("ITIN detection — the ambiguous 'I-10'/'I ten'/'eye ten' surface form", () => {
  it("resolves as ITIN (medium confidence) when mortgage-borrower context is nearby", () => {
    const x = extractFromTranscript("I have an I-10 borrower purchasing a primary residence");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.citizenship?.confidence).toBe("medium");
  });

  it("recognizes the spelled-out 'I ten' form with mortgage context", () => {
    const x = extractFromTranscript("I ten borrower on a purchase");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.citizenship?.confidence).toBe("medium");
  });

  it("recognizes the spelled-out 'eye ten' form with mortgage context", () => {
    const x = extractFromTranscript("eye ten client doing a refinance");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.citizenship?.confidence).toBe("medium");
  });

  it("does NOT classify as ITIN when highway context surrounds it and no mortgage context is present", () => {
    const x = extractFromTranscript("The property is near the I-10 freeway");
    expect(x.citizenship?.value).toBeUndefined();
  });

  it("does NOT classify as ITIN for plain driving/traffic context", () => {
    const x = extractFromTranscript("driving down the I-10 to get to the property");
    expect(x.citizenship?.value).toBeUndefined();
  });

  it("does not guess either way with a bare 'I-10' and zero surrounding context", () => {
    const x = extractFromTranscript("I-10");
    expect(x.citizenship?.value).toBeUndefined();
  });

  it("mortgage context wins even if a highway word ALSO appears elsewhere in a longer transcript", () => {
    const x = extractFromTranscript(
      "the borrower is an I-10 client, the property is near a highway but that's not the citizenship"
    );
    expect(x.citizenship?.value).toBe("itin");
  });
});

describe("ITIN vs. foreign national — must not be conflated", () => {
  it("a foreign national WITHOUT an ITIN is classified as foreign national, not ITIN", () => {
    const x = extractFromTranscript("I have a foreign national buying an investment property and they do not have an ITIN.");
    expect(x.citizenship?.value).toBe("foreign_national");
  });

  it("an explicit ITIN mention overrides an earlier foreign-national mention (last-wins, correction semantics)", () => {
    const x = extractFromTranscript("originally thought foreign national, actually the borrower has an ITIN");
    expect(x.citizenship?.value).toBe("itin");
  });
});

describe("Full scenario examples from the ITIN platform spec", () => {
  it("Example 1: I-10 purchase scenario captures citizenship, purpose, occupancy, state, FICO, and derives LTV", () => {
    const x = extractFromTranscript(
      "I have an I-10 borrower purchasing a primary residence in California with a 700 credit score and 20% down on a $500,000 purchase."
    );
    expect(x.citizenship?.value).toBe("itin");
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.state?.value).toBe("CA");
    expect(x.fico?.value).toBe(700);
    const a = assess(x);
    expect(a.derived.ltv).toBe(80);
  });

  it("Example 6: ITIN cash-out refinance captures value, existing balance, and requested cash-out", () => {
    const x = extractFromTranscript(
      "I need an ITIN cash-out refinance. The property is worth $650,000, the current balance is $240,000, and the borrower wants $150,000 cash out."
    );
    expect(x.citizenship?.value).toBe("itin");
    expect(x.propertyValue?.value).toBe(650_000);
    expect(x.existingLienBalance?.value).toBe(240_000);
    expect(x.requestedCashOut?.value).toBe(150_000);
  });
});
