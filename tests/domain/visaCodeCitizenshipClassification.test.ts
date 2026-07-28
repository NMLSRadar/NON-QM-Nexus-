import { describe, expect, it } from "vitest";
import { classifyCitizenship } from "@/domain/voice/extract";

// Extended per the real visa-eligibility matrix in Cake Mortgage's
// uploaded Non-QM guideline (2026-07-28), and the user's own examples of
// real natural-speech phrasing ("they're here on an H1", "they're on
// OPT", "they're DACA", "they're on TPS", "they're on an L1").
describe("Voice Scenario — extended visa-code citizenship detection", () => {
  const casesRecognizedAsNonPermanentResident = [
    "they're here on an H1B",
    "they're here on an H1",
    "he's on an H-1B visa",
    "she has an H4",
    "he's on an L1",
    "they're here on an L-1B",
    "she has an L2",
    "he's an E2 investor",
    "she's on an E-3 visa",
    "he has an O1 visa",
    "they're DACA",
    "he's on TPS",
    "they have temporary protected status",
    "she's an asylee",
    "he was granted asylum",
    "they're a refugee",
    "he's on STEM OPT",
    "she's on an F-1 OPT",
    "he's on the OPT program",
  ];

  for (const phrase of casesRecognizedAsNonPermanentResident) {
    it(`recognizes "${phrase}" as non_permanent_resident`, () => {
      expect(classifyCitizenship(phrase)?.value).toBe("non_permanent_resident");
    });
  }

  it("context-gates the risky short codes (TN, R-1, OPT) so they don't false-positive on unrelated speech", () => {
    // Bare "TN" and "opt" are common outside the visa context (a state
    // abbreviation and an everyday English verb) — must NOT be classified
    // without explicit visa framing.
    expect(classifyCitizenship("the property is in TN near the border")).toBeUndefined();
    expect(classifyCitizenship("they might opt for a 30-year fixed")).toBeUndefined();
    expect(classifyCitizenship("the borrower wants to opt out of escrow")).toBeUndefined();
  });

  it("recognizes the gated TN/R-1/OPT phrasing when real visa framing is present", () => {
    expect(classifyCitizenship("she's on a TN visa")?.value).toBe("non_permanent_resident");
    expect(classifyCitizenship("he's on an R-1 visa")?.value).toBe("non_permanent_resident");
    expect(classifyCitizenship("she's on the OPT")?.value).toBe("non_permanent_resident");
  });

  it("does not regress existing EAD/green-card/ITIN/foreign-national detection", () => {
    expect(classifyCitizenship("he's got an EAD card")?.value).toBe("non_permanent_resident");
    expect(classifyCitizenship("she has a green card")?.value).toBe("permanent_resident");
    expect(classifyCitizenship("he's an ITIN borrower")?.value).toBe("itin");
    expect(classifyCitizenship("she's a foreign national")?.value).toBe("foreign_national");
  });
});
