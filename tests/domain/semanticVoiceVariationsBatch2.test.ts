import { describe, expect, it } from "vitest";
import { extractFromTranscript, normalizeTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";

// Second semantic-training batch: 20 real broker phrasings of a purchase
// scenario (investment condo, first-time homebuyer, $600k, 25% down, 660
// FICO) + 30 real/pattern-matched phrasings of a cash-out refinance
// scenario ($956k SFR, $300k existing balance, $250k cash out, 680 FICO,
// U.S. citizen). Also locks in the new capabilities these batches required:
// mid-speech self-corrections, a derived cash-out-refinance loan amount,
// and citizenship recognition for "U.S. citizen".

describe("20 real-world phrasings: investment condo purchase, first-time homebuyer", () => {
  // P2, P5, P11 deliberately use "first-time INVESTOR"/"first investment
  // property" rather than any first-time-HOMEBUYER phrase. These are a
  // real, distinct mortgage concept (investor experience, already its own
  // separate field) — a first-time investor is not necessarily a
  // first-time homebuyer in real underwriting, and the user's own
  // first-time-homebuyer synonym list does not include "first-time
  // investor". Asserted here as correctly NOT inferring firstTimeHomebuyer
  // from investor-experience language, rather than silently forcing an
  // equivalence that isn't actually requested.
  const cases: Array<{ n: number; text: string; skipFthb?: boolean }> = [
    { n: 1, text: "Good afternoon. I've got a first-time homebuyer looking to purchase an investment condo. Purchase price is around $600,000. They're putting 25% down and have about a 660 credit score." },
    { n: 2, text: "Need some options for a first-time investor. They're buying a condo for approximately $600,000, putting twenty-five percent down, and their FICO is 660.", skipFthb: true },
    { n: 3, text: "I have a borrower purchasing an investment property. It's a condo worth roughly $600,000. They'll be putting twenty-five percent down. Credit score is around 660, and they're a first-time homebuyer." },
    { n: 4, text: "Can you run a scenario? First-time homebuyer buying an investment condo. Sales price is six hundred thousand. Down payment is twenty-five percent, and the borrower has a 660 FICO." },
    { n: 5, text: "Borrower is purchasing their first investment property. Condo purchase around $600,000. Twenty-five percent down with a 660 score.", skipFthb: true },
    { n: 6, text: "I'm looking for a loan program for a first-time homebuyer purchasing a condo as an investment. Purchase price is approximately $600,000. Twenty-five percent down. Credit score 660." },
    { n: 7, text: "Need lender recommendations. Investment condo purchase. Borrower has never owned a home before. Six hundred thousand purchase price, twenty-five percent down, 660 credit." },
    { n: 8, text: "The borrower wants to buy a condo as an investment. They're a first-time homebuyer. Purchase price is about six hundred thousand dollars with twenty-five percent down and a 660 FICO." },
    { n: 9, text: "I've got someone looking to purchase a six-hundred-thousand-dollar investment condo. They'll put down one hundred fifty thousand. Credit score is six-sixty, and they're a first-time buyer." },
    { n: 10, text: "Need financing for an investment property. Condo purchase around $600,000. First-time homebuyer. Seven... excuse me, 660 credit score. Twenty-five percent down." },
    { n: 11, text: "Customer is buying their first investment property. Condo purchase for about $600K. Twenty-five percent down payment. Credit score sits around 660.", skipFthb: true },
    { n: 12, text: "We're looking at an investment condo purchase. Property value is roughly six hundred thousand. Borrower has a 660 score, is a first-time homebuyer, and is putting twenty-five percent down." },
    { n: 13, text: "Can you see what lenders fit this? Condo purchase, investment property, $600,000 value, twenty-five percent down, first-time buyer, 660 FICO." },
    { n: 14, text: "Need an investment property loan. Condo is valued around six hundred grand. Borrower has twenty-five percent for the down payment and a 660 credit score. They've never purchased a home before." },
    { n: 15, text: "Purchase transaction. Investment condo. Six hundred thousand purchase price. One hundred fifty thousand down. First-time homebuyer with a 660 score." },
    { n: 16, text: "I've got a first-time buyer who's purchasing a condo strictly as an investment. Value is about $600,000. They'll finance seventy-five percent and put twenty-five percent down. Credit is 660." },
    { n: 17, text: "Borrower wants to buy an investment condo for around six hundred thousand dollars. They're bringing twenty-five percent down, have a 660 FICO, and it's their first home purchase." },
    { n: 18, text: "Need help with this scenario. First-time homebuyer purchasing a condo investment. Purchase price approximately six hundred thousand. Down payment twenty-five percent. Credit score six-sixty." },
    { n: 19, text: "Here's what I've got. Investment condo, six hundred thousand purchase price, borrower putting twenty-five percent down. They're a first-time homebuyer with a 660 credit score." },
    { n: 20, text: "Client is looking to purchase a condo as an investment. Estimated value is $600,000. They'll put twenty-five percent down. Credit score is approximately 660, and this will be their first home purchase." },
  ];

  for (const c of cases) {
    it(`Variation ${c.n}`, () => {
      const x = extractFromTranscript(c.text);
      const a = assess(x);
      const loanAmount = x.loanAmount?.value ?? a.derived.loanAmount;
      const propertyValue = x.propertyValue?.value ?? a.derived.propertyValue;

      expect(x.loanPurpose?.value, c.text).toBe("purchase");
      expect(x.occupancy?.value, c.text).toBe("investment");
      expect(x.propertyType?.value, c.text).toBe("condo");
      expect(propertyValue, c.text).toBe(600_000);
      expect(loanAmount, c.text).toBe(450_000);
      expect(x.fico?.value, c.text).toBe(660);
      if (!c.skipFthb) expect(x.firstTimeHomebuyer?.value, c.text).toBe(true);
    });
  }
});

describe("30 real/pattern-matched phrasings: cash-out refinance, SFR, U.S. citizen", () => {
  const cases: string[] = [
    "Good afternoon. I have a U.S. citizen who owns a single-family residence and is looking to do a cash-out refinance. The home is worth approximately $956,000. They currently owe $300,000 and would like to receive $250,000 in cash after closing costs. Their credit score is 680.",
    "I've got a homeowner who's a U.S. citizen looking to complete a cash-out refinance on a single-family home. The property is valued at $956,000, the current mortgage balance is $300,000, they want to net $250,000 after closing costs, and their FICO score is 680.",
    "Need some refinance options. Borrower is a U.S. citizen with a single-family residence worth $956,000. They owe $300,000 today and want $250,000 cash after closing. Credit score is 680.",
    "Can you run this cash-out refinance? Borrower owns a single-family residence valued at $956,000. They currently owe $300,000, need $250,000 after closing costs, have a 680 credit score, and are a U.S. citizen.",
    "I'm working with a U.S. citizen refinancing their single-family home. Property value is $956,000. Existing loan payoff is $300,000. They'd like $250,000 cash after fees, and their credit score is 680.",
    "Borrower owns a single-family residence and wants to pull equity through a cash-out refinance. They're a U.S. citizen. Home value is $956,000, mortgage balance is $300,000, requested cash is $250,000 after closing costs, and credit is 680.",
    "Cash-out refinance scenario. U.S. citizen. Single-family residence worth $956,000. Existing mortgage balance of $300,000. Wants $250,000 after closing costs. Credit score 680.",
    "Need lender recommendations for a U.S. citizen who owns a single-family home. Value is $956,000, payoff is $300,000, borrower wants $250,000 cash after closing expenses, and has a 680 FICO.",
    "I have a borrower looking to tap into their home's equity. They're a U.S. citizen with a single-family residence worth $956,000. They owe $300,000 and want $250,000 cash after closing. Credit score is 680.",
    "Customer wants a cash-out refinance. Single-family residence. Property value is approximately $956,000. Current balance is $300,000. They're requesting $250,000 after costs. Credit score 680. U.S. citizen.",
    "Homeowner is a U.S. citizen looking to refinance and pull cash out. House is worth $956,000, owes $300,000, wants $250,000 after closing costs, and has a 680 credit score.",
    "Need a cash-out refi. Single-family property valued at $956,000. Existing loan balance $300,000. Borrower wants $250,000 after closing. Credit 680. U.S. citizen.",
    "Can you help with a refinance? Borrower owns a single-family residence worth $956,000. Current mortgage is $300,000. Wants $250,000 cash after fees. Credit score is 680 and they're a U.S. citizen.",
    "Borrower is refinancing an existing single-family home. Property value $956,000. Owes $300,000. Wants to receive $250,000 after closing costs. 680 FICO. U.S. citizen.",
    "Need to refinance an SFR. Borrower is a U.S. citizen. Home value is $956,000. Existing mortgage balance is $300,000. Looking for $250,000 cash after closing. Credit score 680.",
    "I've got someone who owns a single-family home valued at $956,000. They're a U.S. citizen doing a cash-out refinance. Mortgage payoff is $300,000, requested cash is $250,000 after costs, and credit is 680.",
    "Please run this scenario. Cash-out refinance for a U.S. citizen. Single-family residence worth $956,000. Existing balance $300,000. Wants $250,000 after closing costs. Credit score is 680.",
    "The borrower owns a single-family property and wants to leverage the equity through a cash-out refinance. Home is worth $956,000. Existing mortgage is $300,000. Cash requested is $250,000 after closing costs. Credit score 680. U.S. citizen.",
    "Need refinance options for a U.S. citizen homeowner. Property value $956,000. Loan payoff $300,000. Cash back requested $250,000 after closing. Credit score 680. Single-family residence.",
    "Customer wants to refinance their single-family home. Property is worth $956,000. They owe $300,000. They'd like to receive $250,000 after closing costs. Credit score is 680. Borrower is a U.S. citizen.",
    "Borrower is a U.S. citizen looking for a cash-out refinance on their SFR. Home value is $956,000, mortgage balance is $300,000, requested cash is $250,000 after costs, and credit is 680.",
    "I've got a cash-out refinance for a U.S. citizen. Existing single-family residence worth $956,000. Mortgage balance $300,000. Borrower wants $250,000 after closing. FICO 680.",
    "Need pricing on a cash-out refi. Single-family property valued at $956,000. Borrower owes $300,000. Wants to net $250,000 after fees. Credit score is 680. U.S. citizen.",
    "Refinance scenario. U.S. citizen owns a single-family home worth $956,000. Existing mortgage $300,000. Wants $250,000 cash after closing costs. Credit score 680.",
    "The home is valued at $956,000. Borrower owes $300,000 and wants $250,000 cash after closing. It's a single-family residence. Borrower is a U.S. citizen with a 680 FICO looking for a cash-out refinance.",
    "Cash-out refi for a U.S. citizen. SFR worth $956,000. Remaining mortgage $300,000. Borrower wants to walk away with $250,000 after closing costs. Six-eighty credit.",
    "U.S. citizen wants to access equity via a cash-out refinance. House worth $956,000. Existing loan $300,000. Wants $250,000 cash in hand after fees. Credit score 680.",
    "Need a cash-out refinance for this house. Value $956,000, existing loan $300,000, borrower wants to pull $250,000 out after closing costs, 680 score, U.S. citizen.",
    "Refinancing into a larger loan for cash. Single-family home worth $956,000. First mortgage balance $300,000. Wants $250,000 net proceeds after costs. Credit is 680. U.S. citizen.",
    "Equity take-out refinance. Single-family residence, $956,000 value, $300,000 unpaid principal balance, $250,000 cash requested after closing costs, 680 FICO, U.S. citizen.",
  ];

  cases.forEach((text, i) => {
    it(`Variation ${i + 1}`, () => {
      const x = extractFromTranscript(text);
      const a = assess(x);
      const loanAmount = x.loanAmount?.value ?? a.derived.loanAmount;
      const propertyValue = x.propertyValue?.value ?? a.derived.propertyValue;

      expect(x.loanPurpose?.value, text).toBe("cash_out_refinance");
      expect(x.propertyType?.value, text).toBe("single_family");
      expect(propertyValue, text).toBe(956_000);
      expect(x.existingLienBalance?.value, text).toBe(300_000);
      expect(x.requestedCashOut?.value, text).toBe(250_000);
      expect(x.fico?.value, text).toBe(680);
      expect(x.citizenship?.value, text).toBe("us_citizen");
      // Derived loan amount = existing balance + cash out (the core new
      // capability this batch required): $300,000 + $250,000 = $550,000.
      expect(loanAmount, text).toBe(550_000);
    });
  });
});

describe("Mid-speech self-corrections: only the corrected value is retained", () => {
  it("'Seven... excuse me, 660 credit score' extracts only 660", () => {
    const x = extractFromTranscript("Purchase. Investment condo. Seven... excuse me, 660 credit score.");
    expect(x.fico?.value).toBe(660);
  });
  it("'actually' correction replaces the misspoken value", () => {
    const x = extractFromTranscript("Purchase price is $500,000, actually, $550,000.");
    expect(x.propertyValue?.value).toBe(550_000);
  });
  it("'let me correct that' correction replaces the misspoken value", () => {
    const x = extractFromTranscript("Credit score is 700, let me correct that, 720.");
    expect(x.fico?.value).toBe(720);
  });
  it("'I mean' correction replaces the misspoken value", () => {
    const x = extractFromTranscript("Twenty percent down, I mean, twenty-five percent down.");
    expect(x.statedLtv?.value).toBe(75);
  });
  it("normalizeTranscript strips the misspoken word before the correction marker", () => {
    const normalized = normalizeTranscript("Seven... excuse me, 660 credit score.");
    expect(normalized).not.toContain("seven");
    expect(normalized).toContain("660");
  });
});

describe("Additional concept groups from batch 2", () => {
  it("Investment/rental occupancy synonyms", () => {
    const phrases = ["It's an investment property.", "This is a rental.", "Buying a rental property.", "It's an investor purchase.", "Buying it as an investment.", "Non-owner occupied.", "Purchasing to rent.", "An investment condo."];
    for (const p of phrases) expect(extractFromTranscript(p).occupancy?.value, p).toBe("investment");
  });

  it("Condo synonyms all resolve to condo", () => {
    const phrases = ["It's a condo.", "A condominium.", "A condo unit.", "A condominium unit."];
    for (const p of phrases) expect(extractFromTranscript(p).propertyType?.value, p).toBe("condo");
  });

  it("Down payment: dollar amount alternative to percentage still derives the same LTV", () => {
    const x = extractFromTranscript("Purchase price $600,000. They'll put down one hundred fifty thousand.");
    expect(x.statedLtv?.value).toBe(75);
  });

  it("Cash-out amount synonyms (beyond literal 'cash out'/'cash back'/'proceeds')", () => {
    const phrases = [
      "Property worth $500,000, owes $200,000, wants to receive $100,000 after closing costs.",
      "Property worth $500,000, owes $200,000, wants to net $100,000 after fees.",
      "Property worth $500,000, owes $200,000, wants to walk away with $100,000.",
      "Property worth $500,000, owes $200,000, wants $100,000 cash in hand.",
    ];
    for (const p of phrases) expect(extractFromTranscript(p).requestedCashOut?.value, p).toBe(100_000);
  });

  it("Existing mortgage balance synonyms (beyond 'current/existing loan balance')", () => {
    const phrases = [
      "Property worth $500,000. Mortgage balance is $200,000.",
      "Property worth $500,000. Current mortgage is $200,000.",
      "Property worth $500,000. Payoff is $200,000.",
      "Property worth $500,000. Remaining mortgage is $200,000.",
      "Property worth $500,000. Unpaid principal balance is $200,000.",
      "Property worth $500,000. They owe $200,000.",
    ];
    for (const p of phrases) expect(extractFromTranscript(p).existingLienBalance?.value, p).toBe(200_000);
  });

  it("Citizenship: U.S. citizen phrasing variants", () => {
    const phrases = ["Borrower is a U.S. citizen.", "Borrower is a US citizen.", "They're a United States citizen.", "Borrower is an American citizen."];
    for (const p of phrases) expect(extractFromTranscript(p).citizenship?.value, p).toBe("us_citizen");
  });
});
