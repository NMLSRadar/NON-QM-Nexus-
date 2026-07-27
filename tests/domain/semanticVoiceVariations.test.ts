import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";

// Semantic (concept-based, not exact-phrase) extraction — locks in the 20
// real-world broker-phrasing variations of the same bank-statement purchase
// scenario supplied directly by the user, covering out-of-order fields,
// conversational filler, industry slang/abbreviations, estimated values
// ("about"/"roughly"/"around"/"approximately"), spoken numbers ("seven-forty",
// "two hundred grand"), and varied terminology for the same meaning.
//
// A few variations genuinely omit one field entirely in their own wording
// (no property type stated at all, or no credit score stated at all) — those
// are asserted as correctly ABSENT rather than forced to a value that was
// never actually said, per the platform's no-fabrication rule. Every other
// field is asserted against the shared expected scenario.

interface Case {
  n: number;
  text: string;
  skip?: Array<"propertyType" | "fico">;
}

const cases: Case[] = [
  { n: 1, text: "Good afternoon. I've got a borrower buying a single-family home for about a million dollars. They're putting twenty percent down, have around a 740 FICO, they're a first-time homebuyer, and we're qualifying them using bank statements." },
  { n: 2, text: "I have a purchase transaction. Sales price is one million dollars. Borrower is putting twenty percent down. It's their first home purchase. Credit score is 740, and we'd like to qualify using bank statement income." },
  { n: 3, text: "Looking at a bank statement loan. Purchase price is roughly one million. Twenty percent down payment. Borrower's a first-time homebuyer with a 740 score.", skip: ["propertyType"] },
  { n: 4, text: "Can you help me with a purchase? Single-family residence valued at about one million dollars. Borrower has twenty percent to put down, credit score is 740, first-time buyer, using bank statements for income." },
  { n: 5, text: "I've got a client purchasing a million-dollar SFR. They're bringing two hundred thousand to closing, so eighty percent financing. Seven-forty credit. First-time homebuyer. Income is bank statements." },
  { n: 6, text: "Purchase scenario. SFR. Million-dollar purchase price. Eighty LTV. Borrower's never owned a home before. Seven-forty FICO. Twelve-month bank statements for income." },
  { n: 7, text: "Need a bank statement loan for a first-time homebuyer. Property is around one million dollars. They're putting twenty percent down and have a 740 credit score.", skip: ["propertyType"] },
  { n: 8, text: "Customer is buying a house valued around a million. Down payment is twenty percent. Credit is about 740. It'll be their first home, and we're qualifying off bank statement deposits." },
  { n: 9, text: "I've got a purchase on a single-family residence. Estimated value is one million dollars. Borrower wants eighty percent financing using bank statements. Credit score is seven-forty, and they're a first-time buyer." },
  { n: 10, text: "The borrower is looking to purchase their very first home. Purchase price is approximately one million. They'll put twenty percent down. Credit score is around 740, and income is coming from bank statements." },
  { n: 11, text: "Need options for a bank statement borrower purchasing a million-dollar home. Twenty percent down. First-time buyer. Seven-forty credit." },
  { n: 12, text: "We're working with a first-time homebuyer purchasing an SFR for about one million dollars. They're putting down two hundred thousand, financing the remaining eight hundred thousand, and qualifying with bank statements.", skip: ["fico"] },
  { n: 13, text: "Client wants to buy a single-family property worth about one million. They'll finance eighty percent. Credit is 740. Never owned before. Using bank statement income." },
  { n: 14, text: "Purchase transaction here. One-million-dollar property. Twenty percent down payment. Seven-forty FICO. First-time homebuyer. Looking at bank statement qualification.", skip: ["propertyType"] },
  { n: 15, text: "The home is valued at roughly a million bucks. Borrower has two hundred grand for the down payment. Credit score is seven-forty. First-time buyer. Need a bank statement program." },
  { n: 16, text: "I've got someone buying their first house. It's a million-dollar purchase. Twenty percent down. They're sitting at about a 740 credit score and need to qualify with bank statements." },
  { n: 17, text: "Borrower is purchasing an owner-occupied single-family residence for one million dollars. They're putting twenty percent down. First-time homebuyer. Seven-forty FICO. Using bank statement income." },
  { n: 18, text: "Can you run this purchase? SFR around one million in value. Borrower putting down twenty percent. Credit score is approximately 740. First-time buyer. Income documentation is bank statements." },
  { n: 19, text: "Need lender recommendations for a first-time homebuyer. Million-dollar purchase. Eighty percent LTV. Seven-forty credit score. Income will be qualified using bank statements.", skip: ["propertyType"] },
  { n: 20, text: "Here's the scenario. Purchase of a single-family home valued at one million dollars. Borrower plans on putting twenty percent down, has a 740 FICO, has never owned a home before, and we're using bank statement income to qualify." },
];

describe("20 real-world broker phrasings of the same bank-statement purchase scenario", () => {
  for (const c of cases) {
    it(`Variation ${c.n}`, () => {
      const x = extractFromTranscript(c.text);
      const a = assess(x);
      const loanAmount = x.loanAmount?.value ?? a.derived.loanAmount;
      const propertyValue = x.propertyValue?.value ?? a.derived.propertyValue;

      expect(x.loanPurpose?.value, c.text).toBe("purchase");
      expect(propertyValue, c.text).toBe(1_000_000);
      expect(x.incomeDocType?.value, c.text).toBe("bank_statement");
      expect(x.firstTimeHomebuyer?.value, c.text).toBe(true);

      if (!c.skip?.includes("propertyType")) {
        expect(x.propertyType?.value, c.text).toBe("single_family");
      }
      if (!c.skip?.includes("fico")) {
        expect(x.fico?.value, c.text).toBe(740);
        expect(loanAmount, c.text).toBe(800_000);
      }
    });
  }
});

describe("Concept groups: synonym/slang recognition independent of exact wording", () => {
  it("Purchase intent synonyms all classify as purchase", () => {
    const phrases = [
      "We're purchasing a home.",
      "Client is buying a property.",
      "It's a new purchase.",
      "They're acquiring an investment property.",
      "Buying an SFR for the client.",
      "The deal is under contract.",
      "This is an escrow purchase.",
    ];
    for (const p of phrases) expect(extractFromTranscript(p).loanPurpose?.value, p).toBe("purchase");
  });

  it("Property type synonyms all classify as single_family", () => {
    const phrases = ["It's an SFR.", "Single-family residence.", "A detached home.", "Just a house.", "Buying a home."];
    for (const p of phrases) expect(extractFromTranscript(p).propertyType?.value, p).toBe("single_family");
  });

  it("Property value estimate qualifiers all resolve to the same figure", () => {
    const phrases = [
      "Purchase price around $600,000.",
      "Purchase price approximately $600,000.",
      "Purchase price roughly $600,000.",
      "Purchase price about $600,000.",
      "Purchase price close to $600,000.",
    ];
    for (const p of phrases) expect(extractFromTranscript(p).propertyValue?.value, p).toBe(600_000);
  });

  it("Down payment phrasing variety (percent and dollar) all resolve to the same LTV", () => {
    const percentPhrases = ["Purchase price $500,000. Twenty percent down.", "Purchase price $500,000. Putting twenty percent down.", "Purchase price $500,000. Eighty LTV.", "Purchase price $500,000. Financing eighty percent."];
    for (const p of percentPhrases) {
      const x = extractFromTranscript(p);
      expect(x.statedLtv?.value, p).toBe(80);
    }
    const dollarPhrase = "Purchase price $500,000. Bringing one hundred thousand to closing.";
    const x = extractFromTranscript(dollarPhrase);
    expect(x.statedLtv?.value, dollarPhrase).toBe(80);
  });

  it("First-time homebuyer synonyms all resolve to true", () => {
    const phrases = ["First-time homebuyer.", "It's their first home.", "First-time buyer.", "Never owned a home before.", "Never owned before.", "Buying their first house."];
    for (const p of phrases) expect(extractFromTranscript(p).firstTimeHomebuyer?.value, p).toBe(true);
  });

  it("Credit score spoken shorthand all resolve to 740", () => {
    const phrases = ["740 FICO.", "740 score.", "Credit is 740.", "FICO is 740.", "Score is seven-forty.", "Seven forty credit.", "Seven-forty credit."];
    for (const p of phrases) expect(extractFromTranscript(`Purchase. ${p}`).fico?.value, p).toBe(740);
  });

  it("Income type synonyms all resolve to bank_statement", () => {
    const phrases = ["Using bank statements.", "Bank statement income.", "Twelve-month bank statements.", "Twenty-four-month bank statements.", "Self-employed bank statements.", "Qualifying off deposits.", "Business bank statements."];
    for (const p of phrases) expect(extractFromTranscript(p).incomeDocType?.value, p).toBe("bank_statement");
  });

  it("Same concept-based approach applies to every OTHER doc type this platform models (not just bank statement)", () => {
    expect(extractFromTranscript("Qualifying with DSCR.").incomeDocType?.value).toBe("dscr");
    expect(extractFromTranscript("This is a cash flow loan.").incomeDocType?.value).toBe("dscr");
    expect(extractFromTranscript("Rental cash flow qualification.").incomeDocType?.value).toBe("dscr");
    expect(extractFromTranscript("Using full documentation.").incomeDocType?.value).toBe("full_doc");
    expect(extractFromTranscript("Qualifying with a P&L.").incomeDocType?.value).toBe("pnl_only");
    expect(extractFromTranscript("CPA-prepared statement for income.").incomeDocType?.value).toBe("pnl_only");
    expect(extractFromTranscript("1099 income only.").incomeDocType?.value).toBe("1099");
    expect(extractFromTranscript("Independent contractor income.").incomeDocType?.value).toBe("1099");
    expect(extractFromTranscript("Qualifying off their assets.").incomeDocType?.value).toBe("asset_depletion");
    expect(extractFromTranscript("Using an asset qualifier.").incomeDocType?.value).toBe("asset_depletion");
    expect(extractFromTranscript("Written VOE only.").incomeDocType?.value).toBe("wvoe_only");
    expect(extractFromTranscript("ITIN borrower.").citizenship?.value).toBe("itin");
    expect(extractFromTranscript("No social security number.").citizenship?.value).toBe("itin");
    expect(extractFromTranscript("Foreign national buyer.").citizenship?.value).toBe("foreign_national");
    expect(extractFromTranscript("International borrower.").citizenship?.value).toBe("foreign_national");
  });
});
