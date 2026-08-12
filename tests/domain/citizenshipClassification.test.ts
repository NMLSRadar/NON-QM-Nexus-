import { describe, expect, it } from "vitest";
import { extractFromTranscript, classifyCitizenship } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";
import { VITAL_KEYS } from "@/domain/voice/slots";

// The new required Citizenship Classification vital — displayed alongside
// the other borrower vitals, and semantically recognized across the four
// requested categories (U.S. Citizen / Non-Permanent Resident / ITIN
// Borrower / Foreign National) plus the pre-existing Permanent Resident
// category real lender program data already depends on.

describe("Citizenship is now a required (core) vital", () => {
  it("is included in VITAL_KEYS", () => {
    expect(VITAL_KEYS).toContain("citizenship");
  });

  it("blocks readyToAnalyze when nothing about citizenship was said", () => {
    const x = extractFromTranscript(
      "Purchase of a single-family primary residence worth $500,000, loan amount $400,000, credit score 720, 12 months of business bank statements.",
    );
    expect(x.citizenship).toBeUndefined();
    const a = assess(x);
    expect(a.missing).toContain("citizenship");
    expect(a.readyToAnalyze).toBe(false);
  });

  it("resolves readyToAnalyze once citizenship is captured (all other vitals present)", () => {
    const x = extractFromTranscript(
      "Purchase of a single-family primary residence worth $500,000, loan amount $400,000, credit score 720, 12 months of business bank statements. Borrower is a U.S. citizen.",
    );
    const a = assess(x);
    expect(a.missing).not.toContain("citizenship");
    expect(a.readyToAnalyze).toBe(true);
  });
});

describe("U.S. Citizen recognition", () => {
  const phrases = ["U.S. citizen", "US citizen", "American citizen", "citizen", "Born here", "United States citizen", "Naturalized citizen"];
  for (const p of phrases) {
    it(`recognizes "${p}"`, () => {
      expect(classifyCitizenship(p.toLowerCase())?.value).toBe("us_citizen");
    });
  }
});

describe("Non-Permanent Resident recognition", () => {
  const phrases = [
    "Non-permanent resident",
    "Non-perm resident",
    "Non-perm",
    "Work visa",
    "Employment authorization",
    "EAD holder",
    "Temporary resident",
    "Visa holder",
  ];
  for (const p of phrases) {
    it(`recognizes "${p}"`, () => {
      expect(classifyCitizenship(p.toLowerCase())?.value).toBe("non_permanent_resident");
    });
  }
});

describe("ITIN Borrower recognition — including phonetic/speech-to-text variants", () => {
  const phrases = [
    "ITIN",
    "ITIN borrower",
    "ITIN loan",
    "tax id borrower",
    "Individual Taxpayer Identification Number",
    "I-T-I-N",
    "i t i n",
    "i.t.i.n",
    "eye-tin",
    "eye tin",
    // Spoken "aye-tin" renderings (added 2026-08-12): STT produces these
    // when a broker says ITIN aloud — the single/hyphen-spelled "ayten",
    // "aytin", "eyten", the name-like "Eitan"/"Aitan" spelling of the same
    // sound, and the 3-syllable "ayatin"/"eyetin" forms. All treated as
    // unconditional high-confidence ITIN.
    "ayten",
    "aytin",
    "Eitan",
    "eitan borrower",
    "Aitan",
    "eyten",
    "ay tin",
    "ayatin",
    // NOTE: bare "I-10"/"I 10" with NO surrounding context moved out of this
    // unconditional-recognition list on 2026-07-28 — per the ITIN
    // contextual-disambiguation spec, that surface form is genuinely
    // ambiguous with Interstate 10 and must NOT be classified without a
    // nearby mortgage-context anchor. See
    // tests/domain/itinContextualDisambiguation.test.ts for its dedicated,
    // context-gated coverage (mortgage context -> ITIN; highway context ->
    // not ITIN; no context either way -> left unclassified).
  ];
  for (const p of phrases) {
    it(`recognizes "${p}" as ITIN`, () => {
      expect(classifyCitizenship(p.toLowerCase())?.value).toBe("itin");
    });
  }
});

describe("ITIN spoken 'aye-tin' renderings (ayten / Eitan / aytin …) resolve the citizenship vital", () => {
  const scenarios = [
    "Purchase of a single-family primary residence worth $500,000, loan amount $400,000, 720 credit, 12 months of business bank statements. The borrower is an Eitan borrower.",
    "Cash-out refinance on a condo worth $400,000, 700 FICO, DSCR loan. They're an ayten.",
    "Purchase, single-family, $500,000 value, 740 credit, full doc — the borrower is aytin.",
  ];
  for (const s of scenarios) {
    it(`classifies "${s.slice(0, 60)}…" as ITIN and reaches readyToAnalyze`, () => {
      const x = extractFromTranscript(s);
      expect(x.citizenship?.value).toBe("itin");
      expect(x.citizenship?.confidence).toBe("high");
      const a = assess(x);
      // The regression this guards: before 2026-08-12 these spoken renderings
      // left the citizenship vital UNRESOLVED (stayed in `missing`); now the
      // vital is captured. Other unrelated vitals may still be absent in a
      // given transcript, so we assert on citizenship specifically.
      expect(a.missing).not.toContain("citizenship");
    });
  }
});

describe("Foreign National recognition", () => {
  const phrases = [
    "Foreign national",
    "FN borrower",
    "Foreign investor",
    "Non-U.S. citizen",
    "Overseas borrower",
    "Overseas buyer",
    "International borrower",
  ];
  for (const p of phrases) {
    it(`recognizes "${p}"`, () => {
      expect(classifyCitizenship(p.toLowerCase())?.value).toBe("foreign_national");
    });
  }
});

describe("Permanent Resident recognition (not one of the 4 requested, but a real distinct eligibility category)", () => {
  const phrases = ["Permanent resident", "Green card", "Green card holder"];
  for (const p of phrases) {
    it(`recognizes "${p}"`, () => {
      expect(classifyCitizenship(p.toLowerCase())?.value).toBe("permanent_resident");
    });
  }
});

describe("Order-independence and full-sentence context", () => {
  it("finds citizenship anywhere in a full scenario, regardless of position", () => {
    const x = extractFromTranscript(
      "The borrower is an ITIN loan applicant looking to purchase an investment condo worth $450,000 with a 700 credit score.",
    );
    expect(x.citizenship?.value).toBe("itin");
  });
  it("finds citizenship stated at the very end of a long scenario", () => {
    const x = extractFromTranscript(
      "Cash-out refinance, single-family residence, $700,000 value, $300,000 existing balance, $100,000 cash out, DSCR loan, 720 FICO — oh, and they're a foreign national.",
    );
    expect(x.citizenship?.value).toBe("foreign_national");
  });
});

describe("Self-corrections replace the previous classification", () => {
  it("'Actually, they're not a U.S. citizen — they're an ITIN borrower' resolves to ITIN, not U.S. citizen", () => {
    const x = extractFromTranscript("Borrower is a U.S. citizen. Actually, they're not a U.S. citizen — they're an ITIN borrower.");
    expect(x.citizenship?.value).toBe("itin");
  });
  it("a later restated category overrides an earlier one even without an explicit correction marker", () => {
    const x = extractFromTranscript("Borrower is a foreign national. Sorry, they're actually a non-permanent resident with a work visa.");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
  });
  it("bare negation alone ('not a U.S. citizen') never falls back to guessing a category", () => {
    const x = extractFromTranscript("The borrower is not a U.S. citizen.");
    expect(x.citizenship).toBeUndefined();
  });
});

describe("Overlapping-substring disambiguation", () => {
  it("'non-permanent resident' is NOT also read as Permanent Resident", () => {
    const x = extractFromTranscript("The borrower is a non-permanent resident on a work visa.");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
  });
  it("'non-U.S. citizen' is NOT also read as U.S. Citizen", () => {
    const x = extractFromTranscript("The borrower is a non-U.S. citizen living abroad.");
    expect(x.citizenship?.value).toBe("foreign_national");
  });
});

describe("If no citizenship information is provided, the field is left unselected — never guessed", () => {
  it("no citizenship signal anywhere in the transcript", () => {
    const x = extractFromTranscript("Purchase, condo, $500,000 value, 700 FICO, DSCR loan.");
    expect(x.citizenship).toBeUndefined();
  });
});

describe("Citizenship is included in the lender-matching engine (already wired via ScenarioInput/baseChecks)", () => {
  it("buildScenarioInput carries the citizenship classification through to the scenario", async () => {
    const { buildScenarioInput } = await import("@/domain/voice/dialog");
    const x = extractFromTranscript(
      "Purchase of a single-family primary residence worth $500,000, loan amount $400,000, credit score 720, 12 months of business bank statements. Borrower is an ITIN borrower.",
    );
    const a = assess(x);
    expect(a.complete).toBe(true);
    const input = buildScenarioInput(x, a);
    expect(input.citizenship).toBe("itin");
  });
});
