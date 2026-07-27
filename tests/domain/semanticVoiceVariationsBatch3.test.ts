import { describe, expect, it } from "vitest";
import { extractFromTranscript, classifyState } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";

// Third semantic-training batch: 20 real broker phrasings of a cash-out
// refinance scenario (non-warrantable condo, Georgia, $640,000 value,
// $223,000 existing balance, $200,000 cash out, 630 FICO, non-permanent
// resident with EAD). Also introduces the NEW property-state vital
// (classifyState) this batch's "located in Georgia" language required.

const EXPECTED = {
  loanPurpose: "cash_out_refinance",
  propertyType: "non_warrantable_condo",
  propertyValue: 640_000,
  existingLienBalance: 223_000,
  requestedCashOut: 200_000,
  fico: 630,
  citizenship: "non_permanent_resident",
  state: "GA",
  loanAmount: 423_000, // derived: existing balance + cash out
};

const cases: string[] = [
  "Good afternoon. I have a borrower who is looking to complete a cash-out refinance on a non-warrantable condo. The property is located in Georgia and has an estimated value of $640,000. The borrower currently has an unpaid mortgage balance of $223,000 and would like to receive $200,000 in cash at closing. Their current credit score is 630, and they are a non-permanent resident with a valid Employment Authorization Document (EAD).",
  "I have a refinance scenario for you. My borrower owns a non-warrantable condominium in Georgia valued at approximately $640,000. They currently owe $223,000 on the existing mortgage and want to complete a cash-out refinance to receive $200,000. Their FICO score is 630, and they are a non-permanent resident with an EAD card.",
  "Good afternoon. I need to find a lender for a borrower seeking a cash-out refinance on a non-warrantable condo located in Georgia. The condo is worth $640,000, the current mortgage payoff is $223,000, and the borrower wants to pull out $200,000 in cash. Their credit score is 630, and they are a non-permanent resident with an Employment Authorization Document.",
  "I have a borrower who owns a non-warrantable condo in Georgia and wants to refinance. The property value is currently $640,000, and the existing loan balance is $223,000. The borrower would like to obtain $200,000 in cash through a cash-out refinance. Their FICO score is 630, and they are a non-permanent resident on an EAD.",
  "Here's a refinance scenario. The borrower is looking to do a cash-out refinance on a non-warrantable condominium located in Georgia. The property is valued at $640,000, with an existing mortgage balance of $223,000. They are requesting $200,000 in cash out, have a 630 credit score, and are a non-permanent resident holding an EAD card.",
  "Good afternoon. I have someone interested in refinancing a non-warrantable condo. The condo is located in Georgia and has a market value of $640,000. They currently owe $223,000 and would like to access $200,000 in equity through a cash-out refinance. Their current FICO score is 630, and they're a non-permanent resident with an Employment Authorization Document.",
  "I need to price a cash-out refinance for a borrower. The subject property is a non-warrantable condo in Georgia worth $640,000. The borrower owes $223,000 on the existing mortgage and wants to take out an additional $200,000 in cash. Their FICO score is 630, and they're a non-permanent resident with an EAD card.",
  "I have a borrower looking to refinance their non-warrantable condominium in Georgia. The home is valued at $640,000, and they currently have a loan balance of $223,000. They'd like to complete a cash-out refinance and receive $200,000. Their credit score is 630, and they are a non-permanent resident with an active EAD.",
  "Good afternoon. I'm working with a borrower who owns a non-warrantable condo located in Georgia. The property is worth $640,000, and there's currently $223,000 remaining on the mortgage. They're requesting $200,000 in cash through a refinance. Their FICO score is 630, and they are a non-permanent resident with an EAD card.",
  "I have a refinance transaction I'd like to run by you. The borrower owns a non-warrantable condo in Georgia valued at $640,000. They owe $223,000 on the current loan and want to complete a cash-out refinance for $200,000. Their current credit score is 630, and they are a non-permanent resident on an Employment Authorization Document.",
  "Good afternoon. My borrower is refinancing a non-warrantable condominium located in Georgia. The estimated property value is $640,000, the current mortgage balance is $223,000, and they're looking to receive $200,000 cash out. Their FICO score is 630, and they are a non-permanent resident with a valid EAD card.",
  "I have a borrower seeking a cash-out refinance on their Georgia non-warrantable condo. The property value is $640,000, the existing mortgage payoff is $223,000, and the borrower would like to cash out $200,000. They currently have a 630 credit score and are a non-permanent resident with an Employment Authorization Document.",
  "Good afternoon. I have a borrower who wants to tap into the equity in their non-warrantable condominium through a cash-out refinance. The property is in Georgia, valued at $640,000, with a current mortgage balance of $223,000. They're requesting $200,000 cash out, have a 630 FICO score, and are a non-permanent resident on an EAD.",
  "I'm looking for financing options for a borrower completing a cash-out refinance on a non-warrantable condo in Georgia. The property has an estimated value of $640,000, the unpaid mortgage balance is $223,000, and the borrower wants $200,000 back at closing. Their credit score is 630, and they are a non-permanent resident with an EAD card.",
  "I have a borrower who owns a non-warrantable condominium in Georgia and would like to refinance it. The condo is currently valued at $640,000, the outstanding mortgage balance is $223,000, and they're requesting $200,000 in cash out. Their FICO score is 630, and they are a non-permanent resident with an active Employment Authorization Document.",
  "Good afternoon. I'd like to discuss a cash-out refinance scenario. The borrower owns a non-warrantable condo in Georgia that's worth $640,000. They owe $223,000 on the existing loan and would like to receive $200,000 in proceeds from the refinance. Their current FICO score is 630, and they are a non-permanent resident with an EAD card.",
  "I have a client interested in refinancing a non-warrantable condo located in Georgia. The property value is $640,000, the current loan balance is $223,000, and they would like to pull out $200,000 through a cash-out refinance. Their credit score is 630, and they're a non-permanent resident with an Employment Authorization Document.",
  "Good afternoon. My borrower owns a non-warrantable condo in the state of Georgia and wants to complete a cash-out refinance. The condo is worth approximately $640,000, they currently owe $223,000, and they're requesting $200,000 in cash out. Their FICO score is 630, and they are a non-permanent resident with an EAD.",
  "I have a borrower looking to leverage the equity in their Georgia non-warrantable condo. The property has a current value of $640,000, the mortgage balance is $223,000, and the borrower wants a cash-out refinance with $200,000 back at closing. Their credit score is 630, and they are a non-permanent resident holding a valid EAD card.",
  "Good afternoon. I need to match a borrower with the right refinance program. They own a non-warrantable condominium in Georgia that's currently worth $640,000. The existing mortgage balance is $223,000, and they're looking to receive $200,000 through a cash-out refinance. Their current FICO score is 630, and they are a non-permanent resident with an Employment Authorization Document (EAD).",
];

describe("20 real-world phrasings: GA non-warrantable condo cash-out refinance, non-permanent resident + EAD", () => {
  cases.forEach((text, i) => {
    it(`Variation ${i + 1}`, () => {
      const x = extractFromTranscript(text);
      const a = assess(x);
      const loanAmount = x.loanAmount?.value ?? a.derived.loanAmount;

      expect(x.loanPurpose?.value, text).toBe(EXPECTED.loanPurpose);
      expect(x.propertyType?.value, text).toBe(EXPECTED.propertyType);
      expect(x.propertyValue?.value, text).toBe(EXPECTED.propertyValue);
      expect(x.existingLienBalance?.value, text).toBe(EXPECTED.existingLienBalance);
      expect(x.requestedCashOut?.value, text).toBe(EXPECTED.requestedCashOut);
      expect(x.fico?.value, text).toBe(EXPECTED.fico);
      expect(x.citizenship?.value, text).toBe(EXPECTED.citizenship);
      expect(x.state?.value, text).toBe(EXPECTED.state);
      expect(loanAmount, text).toBe(EXPECTED.loanAmount);
    });
  });
});

describe("New capability: property state (a non-blocking EXTRA vital)", () => {
  it("recognizes every full state name, case-insensitively", () => {
    expect(classifyState("the property is in texas")?.value).toBe("TX");
    expect(classifyState("located in california")?.value).toBe("CA");
    expect(classifyState("a home in new york")?.value).toBe("NY");
    expect(classifyState("north carolina property")?.value).toBe("NC");
  });

  it("recognizes an anchored spoken abbreviation ('in the state of TX', 'located in TX')", () => {
    expect(classifyState("in the state of tx")?.value).toBe("TX");
    expect(classifyState("located in tx")?.value).toBe("TX");
    expect(classifyState("property is in fl")?.value).toBe("FL");
  });

  it("does NOT match a bare, unanchored 2-letter word that collides with common English (false-positive guard)", () => {
    // "in" (Indiana), "or" (Oregon), "me" (Maine), "hi" (Hawaii), "ok"
    // (Oklahoma) are all common English words — without an anchor phrase
    // immediately before them, they must never be misread as a state.
    expect(classifyState("the borrower wants cash or equity, whichever works")?.value).toBeUndefined();
    expect(classifyState("hi there, I have a scenario for you")?.value).toBeUndefined();
    expect(classifyState("ok let's run the numbers")?.value).toBeUndefined();
    expect(classifyState("tell me about the borrower")?.value).toBeUndefined();
  });

  it("last-mention-wins on a self-correction", () => {
    expect(classifyState("the property is in georgia, actually make that texas")?.value).toBe("TX");
  });

  it("is undefined when no state is ever mentioned", () => {
    expect(classifyState("purchase, condo, $500,000 value, 700 FICO, DSCR loan")).toBeUndefined();
  });

  it("is captured as a non-blocking EXTRA vital — never required for readyToAnalyze", () => {
    const x = extractFromTranscript(
      "Purchase of a single family primary residence worth $500,000, loan amount 400k, credit score 720, full doc income. Borrower is a U.S. citizen.",
    );
    expect(x.state).toBeUndefined();
    const a = assess(x);
    expect(a.readyToAnalyze).toBe(true); // no state mentioned, still ready
  });

  it("flows through to buildScenarioInput's ScenarioInput when captured", async () => {
    const { buildScenarioInput } = await import("@/domain/voice/dialog");
    const x = extractFromTranscript(
      "Purchase of a single family primary residence in Georgia worth $500,000, loan amount 400k, credit score 720, full doc income. Borrower is a U.S. citizen.",
    );
    const a = assess(x);
    expect(a.complete).toBe(true);
    const input = buildScenarioInput(x, a);
    expect(input.state).toBe("GA");
  });
});

describe("Regression fixes this batch required", () => {
  it("'currently have a loan balance of $X' is recognized as the existing lien (not just 'current loan balance')", () => {
    const x = extractFromTranscript("Property worth $640,000, they currently have a loan balance of $223,000.");
    expect(x.existingLienBalance?.value).toBe(223_000);
  });
  it("'$X remaining on the mortgage' is recognized as the existing lien", () => {
    const x = extractFromTranscript("Property worth $640,000, there's currently $223,000 remaining on the mortgage.");
    expect(x.existingLienBalance?.value).toBe(223_000);
  });
  it("'$X back at closing' is recognized as the cash-out amount, not a bare loan amount", () => {
    const x = extractFromTranscript("Property worth $640,000, they owe $223,000, and the borrower wants $200,000 back at closing.");
    expect(x.requestedCashOut?.value).toBe(200_000);
    expect(x.loanAmount).toBeUndefined(); // must NOT be misclassified as the new loan amount directly
    const a = assess(x);
    expect(a.derived.loanAmount).toBe(423_000); // still correctly derivable
  });
});
