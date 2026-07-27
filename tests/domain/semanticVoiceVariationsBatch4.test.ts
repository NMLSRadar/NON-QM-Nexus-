import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";

// Fourth semantic-training batch: a frozen 80-scenario sample drawn from a
// combinatorial generator (scripts/gen_training_corpus.mjs) built to
// exercise every already-modeled loan purpose, doc type, property type,
// occupancy, citizenship, and vesting combination against randomized
// financial figures, phrasing, speaking styles, and speech quirks
// (hesitation, approximation words, mid-sentence self-correction). The
// generator was run at 200/400/2000-scenario scale during development —
// every run reached 100% field-level accuracy after the real bugs below
// were fixed — but only this smaller frozen, hardcoded sample is committed
// as a permanent regression test, so the suite stays deterministic and
// reviewable rather than silently re-randomizing on every CI run.
//
// Real bugs found and fixed via this corpus (not just missing phrases):
//   1. A digit directly followed by the literal word "thousand" ("250
//      thousand") was silently corrupted into TWO separate numbers by
//      wordsToDigits()'s word-tokenizer, producing a 1000x undercount —
//      fixed by merging digit+"thousand" BEFORE the word-number pass runs.
//   2. "1099" (the tax-form reference, e.g. "1099 only", "a 1099
//      contractor") could fall into the generic unlabeled-dollar-figure
//      fallback and get misread as the loan amount itself, when its own
//      narrow clause (after a comma split) didn't also contain "income"
//      or another disqualifying context word.
//   3. "vested individually" / "individually" never matched — the
//      vesting regex required a word boundary directly after "individual",
//      which "individually"'s trailing "ly" defeated.
//   4. "sitting at a 663" (FICO) had no context anchor — the extractor's
//      FICO-context word list didn't include "sitting at".
//   5. Bare "investment" in the OCCUPANCY classifier collided with
//      "investment accounts"/"investment portfolio" (an asset-depletion
//      DOC-TYPE phrase, unrelated to property occupancy) — a primary-
//      residence scenario using asset depletion could get its occupancy
//      silently flipped to investment. Fixed with a negative lookahead.
//   6. "X months of Y deposits for income" (no literal "bank statement"
//      wording at all) wasn't recognized as the bank-statement doc type.
//   7. "planned unit development" (PUD spelled out) and "no income at
//      all, just using their investment accounts" (asset depletion,
//      phrased without any of the existing trigger words) were both
//      unrecognized.
//   8. "1099s" (plural) failed the 1099 doc-type match due to a
//      word-boundary requiring a non-word character directly after "1099".
//
// Scope note: only exercises loan purposes/doc types this platform's
// schema actually models (see slots.ts/enums.ts) — Bridge, ground-up
// construction, fix-and-flip, and delayed financing are intentionally
// excluded, since they don't exist as IncomeDocType/LoanPurpose values and
// adding scenarios for them would silently invent data the schema can't
// represent.

describe("Frozen 80-scenario combinatorial training sample (100% pass at 2000-scenario generator scale)", () => {
  it("Scenario 1", () => {
    const x = extractFromTranscript("Let's see if this works. I have a client looking to do a cash-out refinance on a single-family home in Georgia, they'll live in it. let's see, current value is give or take $1,255,000. payoff on the current loan is about 350k. they want to receive around $340,000 in cash. just a written verification of employment, no paystubs. FICO is 746 , vested in an LLC. They're a green card holder.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(746);
    expect(x.propertyValue?.value).toBe(1255000);
    expect(loan).toBe(690000);
    expect(x.vesting?.value).toBe("llc");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(350000);
    expect(x.requestedCashOut?.value).toBe(340000);
  });

  it("Scenario 2", () => {
    const x = extractFromTranscript("Let's see if this works. There's a borrower I'm working with looking to do a cash-out refinance on a condotel in Colorado, their primary residence. and, uh, current value is approximately 445k. there's give or take 105 thousand remaining on the mortgage. they want to receive about 130k in cash. just a CPA-prepared P&L, no tax returns. credit score is 655. They're an international buyer.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(655);
    expect(x.propertyValue?.value).toBe(445000);
    expect(loan).toBe(235000);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(105000);
    expect(x.requestedCashOut?.value).toBe(130000);
  });

  it("Scenario 3", () => {
    const x = extractFromTranscript("The borrower looking to purchase a non-warrantable condominium in Virginia, owner-occupied. okay so purchase price is approximately $830,000. 90% LTV. using 1099s to qualify, no W-2. credit score is 786 , vested individually. They're a non-permanent resident with a work visa.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(786);
    expect(x.propertyValue?.value).toBe(830000);
    expect(loan).toBe(747000);
    expect(x.vesting?.value).toBe("individual");
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 4", () => {
    const x = extractFromTranscript("Can you help me with this one? I'm working with a borrower looking to refinance a townhouse in California, a second home, rate and term. um, the property's worth approximately 1960 thousand. existing balance is roughly 980 thousand. 50 percent loan to value. qualifying off their assets, asset depletion. they're sitting at a 663. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("townhome");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(663);
    expect(x.propertyValue?.value).toBe(1960000);
    expect(loan).toBe(980000);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(980000);
  });

  it("Scenario 5", () => {
    const x = extractFromTranscript("Let's see if this works. There's a borrower I'm working with looking to do a cash-out refinance on a non-warrantable condominium, their primary residence. let's see, the property's worth roughly $2,040,000. payoff on the current loan is approximately 775k. they want to receive give or take 70k in cash. full doc, W-2 and tax returns. FICO is 661. They're an ITIN borrower.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(661);
    expect(x.propertyValue?.value).toBe(2040000);
    expect(loan).toBe(845000);
    expect(x.existingLienBalance?.value).toBe(775000);
    expect(x.requestedCashOut?.value).toBe(70000);
  });

  it("Scenario 6", () => {
    const x = extractFromTranscript("Good afternoon. So my borrower looking to do a cash-out refinance on a mobile home, their primary residence. um, the property's worth $1,800,000. they currently owe $470,000. they want to receive about 280k in cash. just a written verification of employment, no paystubs. FICO is 799 , vested in a corporation. They're a non-permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("manufactured");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(799);
    expect(x.propertyValue?.value).toBe(1800000);
    expect(loan).toBe(750000);
    expect(x.vesting?.value).toBe("corporation");
    expect(x.existingLienBalance?.value).toBe(470000);
    expect(x.requestedCashOut?.value).toBe(280000);
  });

  it("Scenario 7", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. I have somebody looking to refinance a detached house, they'll live in it, rate and term. current value is roughly 690 thousand. payoff on the current loan is $365,000. 70 percent loan to value. just a CPA-prepared P&L, no tax returns. credit score is 608. They're a lawful permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(608);
    expect(x.propertyValue?.value).toBe(690000);
    expect(loan).toBe(483000);
    expect(x.existingLienBalance?.value).toBe(365000);
  });

  it("Scenario 8", () => {
    const x = extractFromTranscript("Hey, quick question. There's a borrower I'm working with looking to do a cash-out refinance on a single-family home in Nevada, their primary residence. okay so the property's worth approximately $300,000. payoff on the current loan is about 75 thousand. they want to receive approximately $265,000 in cash. no income at all, just using their investment accounts. FICO is 781. They're on an EAD.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(781);
    expect(x.propertyValue?.value).toBe(300000);
    expect(loan).toBe(340000);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(75000);
    expect(x.requestedCashOut?.value).toBe(265000);
  });

  it("Scenario 9", () => {
    const x = extractFromTranscript("I've got a scenario for you. There's a borrower I'm working with looking to purchase a condotel in Utah, a rental. um, the property's worth roughly $1,240,000. 80% LTV. WVOE only, employer letter. they're sitting at a 713 , vested in a corporation. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(713);
    expect(x.propertyValue?.value).toBe(1240000);
    expect(loan).toBe(992000);
    expect(x.vesting?.value).toBe("corporation");
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 10", () => {
    const x = extractFromTranscript("So here's what I'm working with. My client looking to purchase a condotel, a second home. um, purchase price is roughly 615k. 70% LTV. 24 months of personal deposits for income. FICO is 759. They're a lawful permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(759);
    expect(x.propertyValue?.value).toBe(615000);
    expect(loan).toBe(430500);
  });

  it("Scenario 11", () => {
    const x = extractFromTranscript("Hi there. So my borrower looking to refinance a farm property, a vacation home, rate and term. and, uh, current value is give or take $300,000. payoff on the current loan is give or take $190,000. 60 percent loan to value. WVOE only, employer letter. FICO is 765 , vested in a corporation. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("rural");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(765);
    expect(x.propertyValue?.value).toBe(300000);
    expect(loan).toBe(180000);
    expect(x.vesting?.value).toBe("corporation");
    expect(x.existingLienBalance?.value).toBe(190000);
  });

  it("Scenario 12", () => {
    const x = extractFromTranscript("Quick one for you. I've got a borrower looking to purchase a townhouse, owner-occupied. and, uh, purchase price is about 805 thousand. they're putting 20% down. traditional income documentation, full doc. credit score is 659, actually, 674 , vested in an LLC. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("townhome");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(674);
    expect(x.propertyValue?.value).toBe(805000);
    expect(loan).toBe(644000);
    expect(x.vesting?.value).toBe("llc");
  });

  it("Scenario 13", () => {
    const x = extractFromTranscript("Hey, quick question. My client looking to refinance an SFR in Washington, non-owner occupied, rate and term. um, current value is roughly 1925 thousand. existing balance is 810 thousand. 75 percent loan to value. using 1099s to qualify, no W-2. credit came back at 697. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(697);
    expect(x.propertyValue?.value).toBe(1925000);
    expect(loan).toBe(1443750);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(810000);
  });

  it("Scenario 14", () => {
    const x = extractFromTranscript("Let's see if this works. I'm working with a borrower looking to purchase a non-warrantable condo in Virginia, they'll live in it. so, purchase price is approximately 610k. 75% LTV. using 1099s to qualify, no W-2. they're sitting at a 817, actually, 797 , vested in a trust. They're an ITIN borrower.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(797);
    expect(x.propertyValue?.value).toBe(610000);
    expect(loan).toBe(457500);
    expect(x.vesting?.value).toBe("trust");
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 15", () => {
    const x = extractFromTranscript("The borrower looking to purchase a triplex in Tennessee, non-owner occupied. um, the property's worth roughly 2155 thousand. they're putting 30% down. this is a DSCR deal, cash flow loan. credit came back at 647. They're a citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("2_4_unit");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(647);
    expect(x.propertyValue?.value).toBe(2155000);
    expect(loan).toBe(1508500);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 16", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. So my borrower looking to purchase a condotel in California, they'll live in it. so, the property's worth about 1515k. they're putting 10% down. using personal bank statements, 12 months' worth. credit came back at 729. They're a non-U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(729);
    expect(x.propertyValue?.value).toBe(1515000);
    expect(loan).toBe(1363500);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 17", () => {
    const x = extractFromTranscript("I've got a scenario for you. I've got a customer looking to do a cash-out refinance on a condominium, an investment property. okay so current value is about 2150k. they currently owe 905 thousand. they want to receive about 140 thousand in cash. no ratio, well actually DSCR based on the rents. credit came back at 632. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("condo");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(632);
    expect(x.propertyValue?.value).toBe(2150000);
    expect(loan).toBe(1045000);
    expect(x.existingLienBalance?.value).toBe(905000);
    expect(x.requestedCashOut?.value).toBe(140000);
  });

  it("Scenario 18", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. My client looking to refinance a non-warrantable condominium, they'll live in it, rate and term. let's see, the property's worth about 1755 thousand. they currently owe give or take 1035 thousand. 60 percent loan to value. qualifying off their assets, asset depletion. credit score is 766. They're a non-permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(766);
    expect(x.propertyValue?.value).toBe(1755000);
    expect(loan).toBe(1053000);
    expect(x.existingLienBalance?.value).toBe(1035000);
  });

  it("Scenario 19", () => {
    const x = extractFromTranscript("Good morning. I have a client looking to purchase a condotel in South Carolina, non-owner occupied. and, uh, the property's worth approximately 1830k. they're putting 10% down. WVOE only, employer letter. they're sitting at a 632. They're a permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(632);
    expect(x.propertyValue?.value).toBe(1830000);
    expect(loan).toBe(1647000);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 20", () => {
    const x = extractFromTranscript("Good morning. I have a client looking to do a cash-out refinance on a condotel in Nevada, a vacation home. current value is roughly $465,000. payoff on the current loan is approximately $110,000. they want to receive approximately $185,000 in cash. WVOE only, employer letter. FICO is 800 , vested in an LLC. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(800);
    expect(x.propertyValue?.value).toBe(465000);
    expect(loan).toBe(295000);
    expect(x.vesting?.value).toBe("llc");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(110000);
    expect(x.requestedCashOut?.value).toBe(185000);
  });

  it("Scenario 21", () => {
    const x = extractFromTranscript("I've got a scenario for you. So my borrower looking to purchase a townhome, a second home. let's see, purchase price is give or take 350k. they're putting 15% down. traditional income documentation, full doc. FICO is 627 , vested in a revocable trust. They're an American citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("townhome");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(627);
    expect(x.propertyValue?.value).toBe(350000);
    expect(loan).toBe(297500);
    expect(x.vesting?.value).toBe("trust");
  });

  it("Scenario 22", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. So my borrower looking to purchase a manufactured home, a vacation home. and, uh, purchase price is roughly $900,000. they're putting 30% down. qualifying off a profit and loss statement. credit score is 700 , vested in an LLC. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("manufactured");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(700);
    expect(x.propertyValue?.value).toBe(900000);
    expect(loan).toBe(630000);
    expect(x.vesting?.value).toBe("llc");
  });

  it("Scenario 23", () => {
    const x = extractFromTranscript("Let's see if this works. I'm working with a borrower looking to do a cash-out refinance on a PUD, non-owner occupied. okay so current value is roughly 1730 thousand. they currently owe about $655,000. they want to receive $345,000 in cash. using the rental income to qualify — DSCR. credit score is 690. They're an American citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(690);
    expect(x.propertyValue?.value).toBe(1730000);
    expect(loan).toBe(1000000);
    expect(x.existingLienBalance?.value).toBe(655000);
    expect(x.requestedCashOut?.value).toBe(345000);
  });

  it("Scenario 24", () => {
    const x = extractFromTranscript("So here's what I'm working with. I have a client looking to purchase a non-warrantable condo, a second home. so, purchase price is give or take 1230 thousand. they're putting 20% down. traditional income documentation, full doc. credit score is 655, actually, 670 , vested in a trust. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(670);
    expect(x.propertyValue?.value).toBe(1230000);
    expect(loan).toBe(984000);
    expect(x.vesting?.value).toBe("trust");
  });

  it("Scenario 25", () => {
    const x = extractFromTranscript("Hey, quick question. I have a client looking to purchase a condominium in Texas, a vacation home. purchase price is give or take $800,000. they're putting 35% down. no income at all, just using their investment accounts. they're sitting at a 656. They're on an ITIN, no social security number.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("condo");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(656);
    expect(x.propertyValue?.value).toBe(800000);
    expect(loan).toBe(520000);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 26", () => {
    const x = extractFromTranscript("My client looking to do a cash-out refinance on an SFR, their primary residence. and, uh, the property's worth approximately $935,000. there's approximately 320 thousand remaining on the mortgage. they want to receive approximately 150 thousand in cash. they're a 1099 contractor. FICO is 692. They're on an ITIN, no social security number.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(692);
    expect(x.propertyValue?.value).toBe(935000);
    expect(loan).toBe(470000);
    expect(x.existingLienBalance?.value).toBe(320000);
    expect(x.requestedCashOut?.value).toBe(150000);
  });

  it("Scenario 27", () => {
    const x = extractFromTranscript("Hi there. The borrower looking to do a cash-out refinance on a rural property in North Carolina, a rental. um, current value is approximately $1,970,000. existing balance is around 550k. they want to receive roughly $155,000 in cash. just a CPA-prepared P&L, no tax returns. FICO is 680 , vested in their own name. They're an international buyer.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("rural");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(680);
    expect(x.propertyValue?.value).toBe(1970000);
    expect(loan).toBe(705000);
    expect(x.vesting?.value).toBe("individual");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(550000);
    expect(x.requestedCashOut?.value).toBe(155000);
  });

  it("Scenario 28", () => {
    const x = extractFromTranscript("Hey, quick question. I have a client looking to purchase a fourplex, they'll live in it. let's see, purchase price is around $1,355,000. 70% LTV. using 1099s to qualify, no W-2. credit score is 788. They're a citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("2_4_unit");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(788);
    expect(x.propertyValue?.value).toBe(1355000);
    expect(loan).toBe(948500);
  });

  it("Scenario 29", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. I'm working with a borrower looking to refinance a non-warrantable condominium, a rental, rate and term. so, current value is approximately $720,000. existing balance is approximately 360k. 70% LTV. just a written verification of employment, no paystubs. FICO is 745 , vested in an LLC. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(745);
    expect(x.propertyValue?.value).toBe(720000);
    expect(loan).toBe(504000);
    expect(x.vesting?.value).toBe("llc");
    expect(x.existingLienBalance?.value).toBe(360000);
  });

  it("Scenario 30", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. I've got a customer looking to do a cash-out refinance on a condo unit, they'll live in it. current value is approximately 1645k. there's 705 thousand remaining on the mortgage. they want to receive 180k in cash. P&L only program, the P&L statement is the income doc. they're sitting at a 654. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("condo");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(654);
    expect(x.propertyValue?.value).toBe(1645000);
    expect(loan).toBe(885000);
    expect(x.existingLienBalance?.value).toBe(705000);
    expect(x.requestedCashOut?.value).toBe(180000);
  });

  it("Scenario 31", () => {
    const x = extractFromTranscript("So here's what I'm working with. My client looking to refinance a manufactured home, a vacation home, rate and term. okay so current value is give or take $1,060,000. there's roughly 605 thousand remaining on the mortgage. 70 percent loan to value. P&L only program, the P&L statement is the income doc. credit score is 669, actually, 699 , vested individually. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("manufactured");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(699);
    expect(x.propertyValue?.value).toBe(1060000);
    expect(loan).toBe(742000);
    expect(x.vesting?.value).toBe("individual");
    expect(x.existingLienBalance?.value).toBe(605000);
  });

  it("Scenario 32", () => {
    const x = extractFromTranscript("Can you help me with this one? So my borrower looking to do a cash-out refinance on a condotel in Tennessee, a rental. let's see, the property's worth about $2,170,000. existing balance is 1085k. they want to receive approximately 100 thousand in cash. they're self-employed, so we're doing 12 months of personal bank statements. credit score is 682. They're a non-permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(682);
    expect(x.propertyValue?.value).toBe(2170000);
    expect(loan).toBe(1185000);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(1085000);
    expect(x.requestedCashOut?.value).toBe(100000);
  });

  it("Scenario 33", () => {
    const x = extractFromTranscript("Quick one for you. I'm working with a borrower looking to do a cash-out refinance on a planned unit development, an investment property. okay so the property's worth roughly 585 thousand. there's approximately $115,000 remaining on the mortgage. they want to receive roughly $185,000 in cash. qualifying off the property's cash flow, DSCR. credit score is 753. They're on an ITIN, no social security number.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(753);
    expect(x.propertyValue?.value).toBe(585000);
    expect(loan).toBe(300000);
    expect(x.existingLienBalance?.value).toBe(115000);
    expect(x.requestedCashOut?.value).toBe(185000);
  });

  it("Scenario 34", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. I'm working with a borrower looking to purchase a duplex, they'll live in it. okay so purchase price is 580 thousand. 80% LTV. qualifying off their assets, asset depletion. credit score is 600 , vested individually. They're a U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("2_4_unit");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(600);
    expect(x.propertyValue?.value).toBe(580000);
    expect(loan).toBe(464000);
    expect(x.vesting?.value).toBe("individual");
  });

  it("Scenario 35", () => {
    const x = extractFromTranscript("Hey, quick question. I have somebody looking to refinance a single-family home, a vacation home, rate and term. um, current value is 530k. there's 320k remaining on the mortgage. 65 percent loan to value. qualifying off a profit and loss statement. credit came back at 600. They're a citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(600);
    expect(x.propertyValue?.value).toBe(530000);
    expect(loan).toBe(344500);
    expect(x.existingLienBalance?.value).toBe(320000);
  });

  it("Scenario 36", () => {
    const x = extractFromTranscript("I've got a scenario for you. There's a borrower I'm working with looking to refinance a condominium in Washington, a rental, rate and term. so, current value is give or take $745,000. they currently owe approximately $410,000. 65% LTV. qualifying off their assets, asset depletion. FICO is 607, actually, 637. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("condo");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(637);
    expect(x.propertyValue?.value).toBe(745000);
    expect(loan).toBe(484250);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(410000);
  });

  it("Scenario 37", () => {
    const x = extractFromTranscript("Hi there. I have somebody looking to purchase a non-warrantable condo in South Carolina, their primary residence. let's see, purchase price is approximately 1135 thousand. 65% LTV. P&L only program, the P&L statement is the income doc. credit score is 626. They're on an EAD.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(626);
    expect(x.propertyValue?.value).toBe(1135000);
    expect(loan).toBe(737750);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 38", () => {
    const x = extractFromTranscript("Good morning. I've got a customer looking to purchase a 2-4 unit in Nevada, a rental. purchase price is 2065k. 80% LTV. using the rental income to qualify — DSCR. they're sitting at a 629. They're on an EAD.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("2_4_unit");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(629);
    expect(x.propertyValue?.value).toBe(2065000);
    expect(loan).toBe(1652000);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 39", () => {
    const x = extractFromTranscript("I've got a scenario for you. I have a client looking to refinance a townhome, their primary residence, rate and term. so, current value is around $935,000. they currently owe about $475,000. 60 percent loan to value. qualifying off their assets, asset depletion. credit came back at 763. They're a non-permanent resident with a work visa.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("townhome");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(763);
    expect(x.propertyValue?.value).toBe(935000);
    expect(loan).toBe(561000);
    expect(x.existingLienBalance?.value).toBe(475000);
  });

  it("Scenario 40", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. I've got a borrower looking to do a cash-out refinance on a rural property in Texas, owner-occupied. okay so current value is around 645k. they currently owe approximately $295,000. they want to receive about 170 thousand in cash. just a written verification of employment, no paystubs. FICO is 669 , vested in their own name. They're on an ITIN, no social security number.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("rural");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(669);
    expect(x.propertyValue?.value).toBe(645000);
    expect(loan).toBe(465000);
    expect(x.vesting?.value).toBe("individual");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(295000);
    expect(x.requestedCashOut?.value).toBe(170000);
  });

  it("Scenario 41", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. The borrower looking to purchase a 2-4 unit, an investment property. um, the property's worth about $2,160,000. they're putting 15% down. qualifying off the property's cash flow, DSCR. FICO is 781. They're a U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("2_4_unit");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(781);
    expect(x.propertyValue?.value).toBe(2160000);
    expect(loan).toBe(1836000);
  });

  it("Scenario 42", () => {
    const x = extractFromTranscript("I'm not sure where to place this one. There's a borrower I'm working with looking to purchase a planned unit development, their primary residence. okay so purchase price is around $1,780,000. 80% LTV. traditional income documentation, full doc. FICO is 756. They're an international buyer.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(756);
    expect(x.propertyValue?.value).toBe(1780000);
    expect(loan).toBe(1424000);
  });

  it("Scenario 43", () => {
    const x = extractFromTranscript("Can you help me with this one? I've got a customer looking to purchase a detached house in Tennessee, an investment property. okay so the property's worth around 1035 thousand. they're putting 20% down. no personal income needed, straight DSCR off the lease. credit came back at 639. They're a non-permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(639);
    expect(x.propertyValue?.value).toBe(1035000);
    expect(loan).toBe(828000);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 44", () => {
    const x = extractFromTranscript("Good afternoon. There's a borrower I'm working with looking to purchase a farm property in Texas, an investment property. so, purchase price is 1570 thousand. they're putting 35% down. independent contractor income, 1099 only. credit came back at 692 , vested in their own name. They're a non-U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("rural");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(692);
    expect(x.propertyValue?.value).toBe(1570000);
    expect(loan).toBe(1020500);
    expect(x.vesting?.value).toBe("individual");
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 45", () => {
    const x = extractFromTranscript("I'm not sure where to place this one. I have a client looking to do a cash-out refinance on a detached house, a rental. current value is 1280k. existing balance is roughly $475,000. they want to receive roughly $295,000 in cash. independent contractor income, 1099 only. credit came back at 640 , vested in a trust. They're a lawful permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(640);
    expect(x.propertyValue?.value).toBe(1280000);
    expect(loan).toBe(770000);
    expect(x.vesting?.value).toBe("trust");
    expect(x.existingLienBalance?.value).toBe(475000);
    expect(x.requestedCashOut?.value).toBe(295000);
  });

  it("Scenario 46", () => {
    const x = extractFromTranscript("Good morning. The borrower looking to do a cash-out refinance on a non-warrantable condo, a vacation home. current value is approximately $1,510,000. they currently owe 710 thousand. they want to receive give or take 115 thousand in cash. no income at all, just using their investment accounts. they're sitting at a 680 , vested in an LLC. They're on an EAD.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(680);
    expect(x.propertyValue?.value).toBe(1510000);
    expect(loan).toBe(825000);
    expect(x.vesting?.value).toBe("llc");
    expect(x.existingLienBalance?.value).toBe(710000);
    expect(x.requestedCashOut?.value).toBe(115000);
  });

  it("Scenario 47", () => {
    const x = extractFromTranscript("Hi there. I have somebody looking to refinance a mobile home, non-owner occupied, rate and term. um, current value is around $1,990,000. they currently owe give or take 1175 thousand. 75 percent loan to value. using the rental income to qualify — DSCR. credit score is 676 , vested in a corporation. They're an international buyer.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("manufactured");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(676);
    expect(x.propertyValue?.value).toBe(1990000);
    expect(loan).toBe(1492500);
    expect(x.vesting?.value).toBe("corporation");
    expect(x.existingLienBalance?.value).toBe(1175000);
  });

  it("Scenario 48", () => {
    const x = extractFromTranscript("Good morning. The borrower looking to do a cash-out refinance on a mobile home in South Carolina, an investment property. okay so current value is about $1,405,000. there's around 630k remaining on the mortgage. they want to receive give or take 280k in cash. qualifying off the property's cash flow, DSCR. FICO is 627 , vested in an LLC. They're a citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("manufactured");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(627);
    expect(x.propertyValue?.value).toBe(1405000);
    expect(loan).toBe(910000);
    expect(x.vesting?.value).toBe("llc");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(630000);
    expect(x.requestedCashOut?.value).toBe(280000);
  });

  it("Scenario 49", () => {
    const x = extractFromTranscript("Good afternoon. There's a borrower I'm working with looking to refinance a mobile home, non-owner occupied, rate and term. current value is give or take 1530 thousand. payoff on the current loan is about $610,000. 60 percent loan to value. standard W-2 employee, full doc. credit came back at 783. They're a U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("manufactured");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(783);
    expect(x.propertyValue?.value).toBe(1530000);
    expect(loan).toBe(918000);
    expect(x.existingLienBalance?.value).toBe(610000);
  });

  it("Scenario 50", () => {
    const x = extractFromTranscript("I need help placing this loan. I've got a borrower looking to refinance a triplex, owner-occupied, rate and term. and, uh, current value is give or take 1130 thousand. payoff on the current loan is approximately $710,000. 50 percent loan to value. using personal bank statements, 24 months' worth. credit score is 766 , vested in an LLC. They're a green card holder.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("2_4_unit");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(766);
    expect(x.propertyValue?.value).toBe(1130000);
    expect(loan).toBe(565000);
    expect(x.vesting?.value).toBe("llc");
    expect(x.existingLienBalance?.value).toBe(710000);
  });

  it("Scenario 51", () => {
    const x = extractFromTranscript("My client looking to do a cash-out refinance on an SFR in Virginia, a second home. um, the property's worth 1960k. existing balance is about 390k. they want to receive give or take $210,000 in cash. CPA letter and P&L, that's it. credit score is 697 , vested in a trust. They're a non-U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("pnl_only");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(697);
    expect(x.propertyValue?.value).toBe(1960000);
    expect(loan).toBe(600000);
    expect(x.vesting?.value).toBe("trust");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(390000);
    expect(x.requestedCashOut?.value).toBe(210000);
  });

  it("Scenario 52", () => {
    const x = extractFromTranscript("I've got a customer looking to refinance a single-family home in Utah, non-owner occupied, rate and term. so, the property's worth about $690,000. existing balance is approximately 470 thousand. 50% LTV. independent contractor income, 1099 only. FICO is 781 , vested individually. They're a non-U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(781);
    expect(x.propertyValue?.value).toBe(690000);
    expect(loan).toBe(345000);
    expect(x.vesting?.value).toBe("individual");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(470000);
  });

  it("Scenario 53", () => {
    const x = extractFromTranscript("I've got a scenario for you. I'm working with a borrower looking to purchase a farm property, an investment property. let's see, purchase price is approximately 1410 thousand. 75% LTV. qualifying off the property's cash flow, DSCR. they're sitting at a 698 , vested individually. They're a citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("rural");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(698);
    expect(x.propertyValue?.value).toBe(1410000);
    expect(loan).toBe(1057500);
    expect(x.vesting?.value).toBe("individual");
  });

  it("Scenario 54", () => {
    const x = extractFromTranscript("I've got a scenario for you. I've got a borrower looking to purchase a single-family residence in Ohio, an investment property. purchase price is $1,105,000. 65% LTV. standard W-2 employee, full doc. credit came back at 760 , vested individually. They're a non-permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(760);
    expect(x.propertyValue?.value).toBe(1105000);
    expect(loan).toBe(718250);
    expect(x.vesting?.value).toBe("individual");
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 55", () => {
    const x = extractFromTranscript("I've got a scenario for you. The borrower looking to refinance a PUD, non-owner occupied, rate and term. current value is roughly 1585k. payoff on the current loan is approximately 840 thousand. 60 percent loan to value. no income at all, just using their investment accounts. they're sitting at a 667 , vested in their own name. They're a citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(667);
    expect(x.propertyValue?.value).toBe(1585000);
    expect(loan).toBe(951000);
    expect(x.vesting?.value).toBe("individual");
    expect(x.existingLienBalance?.value).toBe(840000);
  });

  it("Scenario 56", () => {
    const x = extractFromTranscript("I have a client looking to refinance a condo unit, owner-occupied, rate and term. and, uh, the property's worth about 1515k. there's around 985 thousand remaining on the mortgage. 55 percent loan to value. WVOE only, employer letter. FICO is 678 , vested in an LLC. They're a U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("condo");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(678);
    expect(x.propertyValue?.value).toBe(1515000);
    expect(loan).toBe(833250);
    expect(x.vesting?.value).toBe("llc");
    expect(x.existingLienBalance?.value).toBe(985000);
  });

  it("Scenario 57", () => {
    const x = extractFromTranscript("Good afternoon. I've got a customer looking to purchase a non-warrantable condominium in Arizona, a second home. and, uh, purchase price is give or take 1535 thousand. 90% LTV. no income at all, just using their investment accounts. credit came back at 652. They're a permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(652);
    expect(x.propertyValue?.value).toBe(1535000);
    expect(loan).toBe(1381500);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 58", () => {
    const x = extractFromTranscript("Quick one for you. I have a client looking to purchase a planned unit development in North Carolina, an investment property. the property's worth roughly $700,000. 90% LTV. independent contractor income, 1099 only. credit came back at 799. They're a lawful permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(799);
    expect(x.propertyValue?.value).toBe(700000);
    expect(loan).toBe(630000);
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 59", () => {
    const x = extractFromTranscript("Let's see if this works. I've got a borrower looking to refinance a townhouse, an investment property, rate and term. let's see, current value is approximately 505k. payoff on the current loan is give or take 235k. 55% LTV. 24 months of business deposits for income. FICO is 656. They're a lawful permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("townhome");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(656);
    expect(x.propertyValue?.value).toBe(505000);
    expect(loan).toBe(277750);
    expect(x.existingLienBalance?.value).toBe(235000);
  });

  it("Scenario 60", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. I've got a customer looking to purchase a condotel in South Carolina, they'll live in it. um, purchase price is give or take 1995 thousand. they're putting 10% down. standard W-2 employee, full doc. credit came back at 658 , vested in their own name. They're a lawful permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(658);
    expect(x.propertyValue?.value).toBe(1995000);
    expect(loan).toBe(1795500);
    expect(x.vesting?.value).toBe("individual");
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 61", () => {
    const x = extractFromTranscript("I've got a borrower looking to do a cash-out refinance on a 2-4 unit, a second home. so, the property's worth about 1540 thousand. existing balance is around 555 thousand. they want to receive 230 thousand in cash. just a written verification of employment, no paystubs. they're sitting at a 711. They're on an EAD.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("2_4_unit");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(711);
    expect(x.propertyValue?.value).toBe(1540000);
    expect(loan).toBe(785000);
    expect(x.existingLienBalance?.value).toBe(555000);
    expect(x.requestedCashOut?.value).toBe(230000);
  });

  it("Scenario 62", () => {
    const x = extractFromTranscript("Let's see if this works. So my borrower looking to purchase a condotel, a vacation home. okay so the property's worth roughly $1,585,000. they're putting 35% down. qualifying off their assets, asset depletion. credit score is 754. They're a non-permanent resident with a work visa.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(754);
    expect(x.propertyValue?.value).toBe(1585000);
    expect(loan).toBe(1030250);
  });

  it("Scenario 63", () => {
    const x = extractFromTranscript("Good morning. I've got a customer looking to purchase a PUD, a vacation home. let's see, the property's worth $505,000. they're putting 15% down. asset utilization, they're retired with a big portfolio. they're sitting at a 736, actually, 711. They're a citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(711);
    expect(x.propertyValue?.value).toBe(505000);
    expect(loan).toBe(429250);
  });

  it("Scenario 64", () => {
    const x = extractFromTranscript("Can you help me with this one? I've got a customer looking to purchase a condotel in Virginia, a vacation home. um, the property's worth $1,925,000. they're putting 10% down. qualifying off their assets, asset depletion. credit came back at 741 , vested in an LLC. They're a green card holder.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(741);
    expect(x.propertyValue?.value).toBe(1925000);
    expect(loan).toBe(1732500);
    expect(x.vesting?.value).toBe("llc");
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 65", () => {
    const x = extractFromTranscript("Alright, let me walk you through this. I'm working with a borrower looking to refinance a townhouse in Florida, owner-occupied, rate and term. let's see, current value is around 2170 thousand. existing balance is around 890 thousand. 50% LTV. independent contractor income, 1099 only. credit score is 621. They're a non-U.S. citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("townhome");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(621);
    expect(x.propertyValue?.value).toBe(2170000);
    expect(loan).toBe(1085000);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(890000);
  });

  it("Scenario 66", () => {
    const x = extractFromTranscript("I'm not sure where to place this one. The borrower looking to refinance a single-family residence, a vacation home, rate and term. um, current value is around $2,120,000. existing balance is give or take $1,440,000. 65 percent loan to value. using business bank statements, 12 months' worth. FICO is 765. They're a non-permanent resident with a work visa.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
    expect(x.fico?.value).toBe(765);
    expect(x.propertyValue?.value).toBe(2120000);
    expect(loan).toBe(1378000);
    expect(x.existingLienBalance?.value).toBe(1440000);
  });

  it("Scenario 67", () => {
    const x = extractFromTranscript("So here's what I'm working with. So my borrower looking to purchase an SFR, a second home. um, purchase price is approximately 2095 thousand. 85% LTV. independent contractor income, 1099 only. credit came back at 692 , vested in an LLC. They're on an ITIN, no social security number.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(692);
    expect(x.propertyValue?.value).toBe(2095000);
    expect(loan).toBe(1780750);
    expect(x.vesting?.value).toBe("llc");
  });

  it("Scenario 68", () => {
    const x = extractFromTranscript("I need help placing this loan. My client looking to refinance a rural property in Oregon, a rental, rate and term. current value is $2,010,000. payoff on the current loan is about $1,085,000. 65% LTV. just a written verification of employment, no paystubs. credit came back at 709 , vested in their own name. They're an ITIN borrower.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("rural");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(709);
    expect(x.propertyValue?.value).toBe(2010000);
    expect(loan).toBe(1306500);
    expect(x.vesting?.value).toBe("individual");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(1085000);
  });

  it("Scenario 69", () => {
    const x = extractFromTranscript("Good morning. I'm working with a borrower looking to refinance a condotel in Colorado, an investment property, rate and term. so, the property's worth $480,000. existing balance is roughly $240,000. 60 percent loan to value. independent contractor income, 1099 only. credit came back at 752. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("1099");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(752);
    expect(x.propertyValue?.value).toBe(480000);
    expect(loan).toBe(288000);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(240000);
  });

  it("Scenario 70", () => {
    const x = extractFromTranscript("I'm working with a borrower looking to refinance a condo, a second home, rate and term. um, the property's worth give or take $795,000. payoff on the current loan is approximately $510,000. 65% LTV. standard W-2 employee, full doc. FICO is 729. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("condo");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(729);
    expect(x.propertyValue?.value).toBe(795000);
    expect(loan).toBe(516750);
    expect(x.existingLienBalance?.value).toBe(510000);
  });

  it("Scenario 71", () => {
    const x = extractFromTranscript("Let's see if this works. My client looking to do a cash-out refinance on a manufactured home, an investment property. the property's worth 1860k. existing balance is about $725,000. they want to receive about 170 thousand in cash. qualifying off the property's cash flow, DSCR. credit score is 649. They're a foreign national.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("manufactured");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("foreign_national");
    expect(x.fico?.value).toBe(649);
    expect(x.propertyValue?.value).toBe(1860000);
    expect(loan).toBe(895000);
    expect(x.existingLienBalance?.value).toBe(725000);
    expect(x.requestedCashOut?.value).toBe(170000);
  });

  it("Scenario 72", () => {
    const x = extractFromTranscript("Good morning. My client looking to purchase a rural property, a rental. so, purchase price is around 580k. 85% LTV. this is a DSCR deal, cash flow loan. credit score is 609. They're an American citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("dscr");
    expect(x.propertyType?.value).toBe("rural");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(609);
    expect(x.propertyValue?.value).toBe(580000);
    expect(loan).toBe(493000);
  });

  it("Scenario 73", () => {
    const x = extractFromTranscript("Can you help me with this one? I've got a borrower looking to refinance a planned unit development, an investment property, rate and term. the property's worth around $255,000. existing balance is around 180 thousand. 65 percent loan to value. using business bank statements, 24 months' worth. FICO is 622. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(622);
    expect(x.propertyValue?.value).toBe(255000);
    expect(loan).toBe(165750);
    expect(x.existingLienBalance?.value).toBe(180000);
  });

  it("Scenario 74", () => {
    const x = extractFromTranscript("Quick one for you. I've got a customer looking to refinance a PUD, a rental, rate and term. um, current value is around 1740k. they currently owe about $1,115,000. 75 percent loan to value. standard W-2 employee, full doc. they're sitting at a 601. They're a citizen.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("investment");
    expect(x.citizenship?.value).toBe("us_citizen");
    expect(x.fico?.value).toBe(601);
    expect(x.propertyValue?.value).toBe(1740000);
    expect(loan).toBe(1305000);
    expect(x.existingLienBalance?.value).toBe(1115000);
  });

  it("Scenario 75", () => {
    const x = extractFromTranscript("I've got a scenario for you. I have somebody looking to purchase a triplex, their primary residence. okay so purchase price is 340k. they're putting 10% down. WVOE only, employer letter. credit score is 659. They're a lawful permanent resident.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("wvoe_only");
    expect(x.propertyType?.value).toBe("2_4_unit");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(659);
    expect(x.propertyValue?.value).toBe(340000);
    expect(loan).toBe(306000);
  });

  it("Scenario 76", () => {
    const x = extractFromTranscript("Quick one for you. There's a borrower I'm working with looking to purchase a condotel in Washington, a vacation home. so, purchase price is 1800k. they're putting 20% down. qualifying off 24-month business bank statements. FICO is 684 , vested in a revocable trust. They're on an ITIN, no social security number.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(684);
    expect(x.propertyValue?.value).toBe(1800000);
    expect(loan).toBe(1440000);
    expect(x.vesting?.value).toBe("trust");
    expect(x.state?.value).toBeDefined();
  });

  it("Scenario 77", () => {
    const x = extractFromTranscript("Good afternoon. The borrower looking to do a cash-out refinance on a planned unit development in Oregon, their primary residence. so, current value is approximately 570k. existing balance is approximately 220 thousand. they want to receive $325,000 in cash. standard W-2 employee, full doc. credit came back at 756, actually, 731 , vested in a corporation. They're a green card holder.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("pud");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("permanent_resident");
    expect(x.fico?.value).toBe(731);
    expect(x.propertyValue?.value).toBe(570000);
    expect(loan).toBe(545000);
    expect(x.vesting?.value).toBe("corporation");
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(220000);
    expect(x.requestedCashOut?.value).toBe(325000);
  });

  it("Scenario 78", () => {
    const x = extractFromTranscript("I've got a scenario for you. I have a client looking to do a cash-out refinance on a condotel in Arizona, a vacation home. um, the property's worth approximately 900k. they currently owe about 385 thousand. they want to receive around $350,000 in cash. bank statement program, business, 12 months. credit came back at 727. They're on an ITIN, no social security number.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.propertyType?.value).toBe("condotel");
    expect(x.occupancy?.value).toBe("second_home");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(727);
    expect(x.propertyValue?.value).toBe(900000);
    expect(loan).toBe(735000);
    expect(x.state?.value).toBeDefined();
    expect(x.existingLienBalance?.value).toBe(385000);
    expect(x.requestedCashOut?.value).toBe(350000);
  });

  it("Scenario 79", () => {
    const x = extractFromTranscript("Hey, quick question. So my borrower looking to do a cash-out refinance on a non-warrantable condominium, their primary residence. okay so the property's worth $1,625,000. payoff on the current loan is around $405,000. they want to receive give or take 70k in cash. qualifying off their assets, asset depletion. they're sitting at a 732. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("asset_depletion");
    expect(x.propertyType?.value).toBe("non_warrantable_condo");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(732);
    expect(x.propertyValue?.value).toBe(1625000);
    expect(loan).toBe(475000);
    expect(x.existingLienBalance?.value).toBe(405000);
    expect(x.requestedCashOut?.value).toBe(70000);
  });

  it("Scenario 80", () => {
    const x = extractFromTranscript("The borrower looking to do a cash-out refinance on a detached house, they'll live in it. let's see, the property's worth roughly 765k. they currently owe give or take 175k. they want to receive about 345k in cash. standard W-2 employee, full doc. credit score is 606 , vested individually. They're using their I-T-I-N.");
    const a = assess(x);
    const loan = x.loanAmount?.value ?? a.derived.loanAmount;
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
    expect(x.incomeDocType?.value).toBe("full_doc");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.citizenship?.value).toBe("itin");
    expect(x.fico?.value).toBe(606);
    expect(x.propertyValue?.value).toBe(765000);
    expect(loan).toBe(520000);
    expect(x.vesting?.value).toBe("individual");
    expect(x.existingLienBalance?.value).toBe(175000);
    expect(x.requestedCashOut?.value).toBe(345000);
  });

});
