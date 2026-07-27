import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";
import { emptyExtraction } from "@/domain/voice/slots";

// Covers two real reported issues:
// 1. A dollar-denominated down payment ("putting $100,000 down") previously
//    had no home in the extractor at all — only a PERCENT-based down
//    payment ("10% down") was recognized — so it fell into the generic
//    unlabeled-number fallback and could be misassigned as the loan amount
//    itself instead of being subtracted from the property value.
// 2. When down payment/LTV is never stated at all, the assistant should
//    still actively ask for it (never silently skip the question) — but as
//    a last-resort safety net once a scenario is otherwise being finalized,
//    a conservative default should be assumed instead of an arbitrary or
//    unrealistic figure: 10% down for bank statement (no real program
//    exceeds 90% LTV), 20% down for DSCR (the majority cap at 80% LTV; a
//    minority go to 85%, but the conservative default uses the majority
//    figure), 15% down for ITIN (GreenBox's 89% LTV ITIN Full Doc program
//    is a disclosed exception, not the default assumption).

describe("Dollar-denominated down payment extraction", () => {
  const cases: Array<[string, number, number]> = [
    ["The purchase price is $1,000,000 and I'm putting $100,000 down.", 1_000_000, 900_000],
    ["Property value $800,000, down payment of $80,000.", 800_000, 720_000],
    ["$500,000 purchase price, put down $50,000.", 500_000, 450_000],
    ["Home price is $650,000 and we're bringing $65,000 to closing.", 650_000, 585_000],
  ];
  for (const [phrase, value, expectedLoan] of cases) {
    it(`"${phrase}" -> value $${value}, loan $${expectedLoan} (down payment subtracted, not misread as the loan)`, () => {
      const x = extractFromTranscript(phrase);
      expect(x.propertyValue?.value, phrase).toBe(value);
      expect(x.loanAmount?.value, phrase).toBe(expectedLoan);
    });
  }
});

describe("Default down-payment safety net (only fires when nothing was ever stated)", () => {
  it("bank statement: defaults to 10% down (90% LTV) when property value is known but down payment/LTV never stated", () => {
    const x = emptyExtraction();
    x.propertyValue = { value: 1_000_000, source: "purchase price $1,000,000" };
    x.incomeDocType = { value: "bank_statement", source: "bank statements" };
    const a = assess(x);
    expect(a.derived.ltv).toBe(90);
    expect(a.derived.loanAmount).toBe(900_000);
    expect(a.assumedDownPaymentNote).toMatch(/10% down/);
    expect(a.assumedDownPaymentNote).toMatch(/bank statement/);
  });

  it("DSCR: defaults to 20% down (80% LTV), the conservative majority figure, not the 85% minority exception", () => {
    const x = emptyExtraction();
    x.propertyValue = { value: 500_000, source: "value $500,000" };
    x.incomeDocType = { value: "dscr", source: "DSCR loan" };
    const a = assess(x);
    expect(a.derived.ltv).toBe(80);
    expect(a.derived.loanAmount).toBe(400_000);
    expect(a.assumedDownPaymentNote).toMatch(/20% down/);
  });

  it("ITIN: defaults to 15% down (85% LTV) regardless of income doc type", () => {
    const x = emptyExtraction();
    x.propertyValue = { value: 400_000, source: "value $400,000" };
    x.incomeDocType = { value: "full_doc", source: "full doc" };
    x.citizenship = { value: "itin", source: "ITIN borrower" };
    const a = assess(x);
    expect(a.derived.ltv).toBe(85);
    expect(a.derived.loanAmount).toBe(340_000);
    expect(a.assumedDownPaymentNote).toMatch(/15% down/);
    expect(a.assumedDownPaymentNote).toMatch(/ITIN/);
  });

  it("never overrides an explicitly stated down payment / LTV", () => {
    const x = emptyExtraction();
    x.propertyValue = { value: 1_000_000, source: "purchase price $1,000,000" };
    x.statedLtv = { value: 75, source: "75% LTV" };
    x.incomeDocType = { value: "bank_statement", source: "bank statements" };
    const a = assess(x);
    expect(a.derived.ltv).toBe(75);
    expect(a.assumedDownPaymentNote).toBeUndefined();
  });

  it("does not assume a default for a doc type with no specified rule (e.g. full doc, no ITIN)", () => {
    const x = emptyExtraction();
    x.propertyValue = { value: 1_000_000, source: "purchase price $1,000,000" };
    x.incomeDocType = { value: "full_doc", source: "full doc" };
    const a = assess(x);
    expect(a.derived.ltv).toBeUndefined();
    expect(a.assumedDownPaymentNote).toBeUndefined();
  });
});
