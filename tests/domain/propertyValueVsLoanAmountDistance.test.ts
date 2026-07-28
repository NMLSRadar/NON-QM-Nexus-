import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";

// Regression tests for a real, user-reported bug (2026-07-28): the assistant
// "gets confused" between property value and loan amount, sometimes swapping
// them outright, whenever both figures were spoken close together without a
// clear clause boundary between them.
//
// Root cause #1: nearestTermDistance() measured raw START-TO-START distance
// between a number and its candidate label term. That's asymmetric — a
// PRECEDING label's own text length gets counted as part of the "distance"
// ("property value is $500,000" looks far from its own label), while a
// FOLLOWING label's length is excluded entirely ("$500,000, the loan amount
// is..." looks artificially close to a label that doesn't even describe it).
// Fixed by measuring the true edge-to-edge character gap instead.
//
// Root cause #2: once measured correctly, a number sitting exactly between
// two equally-spaced labels ("value 500000 loan 400000") produced a genuine
// tie — and the code's if/else check order arbitrarily preferred whichever
// category was tested first, regardless of word order. Fixed by adding a
// small tie-breaking epsilon that prefers a label PRECEDING the number
// (the dominant "<label> <number>" English word order) over one following.
describe("Property value vs. loan amount — distance/tie-breaking fix", () => {
  const cases: Array<[string, number, number]> = [
    ["The property value is five hundred thousand and the loan amount is four hundred thousand", 500_000, 400_000],
    ["The property is worth $500,000 and the loan amount is $400,000", 500_000, 400_000],
    ["Property value is 500,000 and loan amount 400,000", 500_000, 400_000],
    ["The home is valued at $600,000, they need a loan of $480,000", 600_000, 480_000],
    ["Purchase price is $700,000, loan amount $560,000", 700_000, 560_000],
    ["It's a $500,000 property with a $475,000 loan", 500_000, 475_000],
    ["Value 500k loan 400k", 500_000, 400_000],
    ["Loan 400k value 500k", 500_000, 400_000],
    ["Property is worth 500,000, they want to borrow 400,000", 500_000, 400_000],
    ["The house is worth $500,000, financing $400,000 of that", 500_000, 400_000],
    ["Loan amount is $400,000 and the property value is $500,000", 500_000, 400_000],
    ["The purchase price is $600,000 and the loan request is $450,000", 600_000, 450_000],
  ];

  for (const [transcript, expectedValue, expectedLoan] of cases) {
    it(`"${transcript}" -> value $${expectedValue}, loan $${expectedLoan} (never swapped)`, () => {
      const x = extractFromTranscript(transcript);
      expect(x.propertyValue?.value, transcript).toBe(expectedValue);
      expect(x.loanAmount?.value, transcript).toBe(expectedLoan);
    });
  }
});
