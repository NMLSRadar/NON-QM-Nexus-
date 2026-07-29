import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";

// Regression test for a real reported bug (2026-07-29): "put 20% down for a
// property value of 800,000 for ITIN client and a credit score of 698" was
// silently losing the stated property value and defaulting the down
// payment/LTV, forcing the assistant to re-ask for the property value
// indefinitely. Two independent defects combined to cause this:
//
// 1. The disqualifying-context check (rent/income/credit-score/etc.) that
//    guards the dollar-figure classifier used to reject a number outright
//    whenever ANY disqualifying word appeared anywhere in its comma-less
//    clause — even when a real property-value term sat much closer to the
//    number than the disqualifying word. Continuous, unpunctuated speech
//    routinely runs a property value and a credit-score mention together
//    with no comma between them.
// 2. A bare "down" (from "20 percent down"/"20% down" — already fully
//    resolved by the separate percent/LTV classifier) was itself treated as
//    a DOLLAR down-payment anchor, so an unrelated property-value number
//    sitting further away could be misclassified as a stated dollar down
//    payment instead of the property value.
describe("down payment stated alongside FICO/credit-score in one clause", () => {
  it("resolves the exact reported phrase: 20% down, $800,000 value, ITIN, 698 FICO", () => {
    const x = extractFromTranscript(
      "the borrower is looking to put 20% down for a property value of 800,000 for ITIN client and a credit score of 698"
    );
    expect(x.statedLtv?.value).toBe(80);
    expect(x.propertyValue?.value).toBe(800_000);
    expect(x.fico?.value).toBe(698);
    expect(x.citizenship?.value).toBe("itin");

    const a = assess(x);
    expect(a.derived.ltv).toBe(80);
    expect(a.derived.loanAmount).toBe(640_000);
    // Never silently substitutes the ITIN default (85% LTV / 15% down) when
    // the user actually stated 20% down.
    expect(a.assumedDownPaymentNote).toBeUndefined();
  });

  it("resolves the same scenario phrased as 'percent down' instead of '%'", () => {
    const x = extractFromTranscript(
      "I have an ITIN client looking to put 20 percent down for a property value of 800,000 and a credit score of 698"
    );
    expect(x.statedLtv?.value).toBe(80);
    expect(x.propertyValue?.value).toBe(800_000);
    const a = assess(x);
    expect(a.derived.loanAmount).toBe(640_000);
    expect(a.assumedDownPaymentNote).toBeUndefined();
  });

  it("a genuine dollar down payment stated with 'down' is still captured normally", () => {
    const x = extractFromTranscript("putting $100,000 down on an 800,000 property value, 720 fico");
    expect(x.propertyValue?.value).toBe(800_000);
    expect(x.loanAmount?.value).toBe(700_000);
  });

  it("a genuine income/credit-score dollar figure is still correctly excluded from property value", () => {
    const x = extractFromTranscript("he earns $120,000 annually, 720 credit score, single family purchase");
    expect(x.propertyValue).toBeUndefined();
  });
});
