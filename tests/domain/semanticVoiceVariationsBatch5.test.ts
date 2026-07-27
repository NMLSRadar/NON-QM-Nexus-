import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";

// Fifth semantic-training batch: expanded vocabulary requested for Non-QM
// scenarios — additional cash-out/value/balance/cash-requested synonyms,
// spoken/misheard mortgage-abbreviation normalization (speech-to-text
// commonly renders "DSCR" as "D-S-C-R", "1099" as "ten ninety-nine", etc.),
// the C09 EAD category code, spoken FICO word-forms, and new mid-speech
// self-correction markers ("wait", "one second", "that's incorrect", "no,
// make that", "update that").
//
// Scope note (unchanged from prior batches): only exercises loan
// products/doc types this platform's schema already models. Jumbo Non-QM,
// Doctor Loans, Bridge Loans, HELOC, Closed-End Second, Reverse Mortgage,
// Construction, Renovation, Mixed Use, and CDFI No Ratio (a lender
// licensing/program attribute, not an income-documentation type) are NOT
// in IncomeDocType/LoanPurpose/PropertyType and were intentionally
// excluded — inventing scenario data for loan types this schema can't
// represent would train the parser against fields that don't exist, not
// produce anything real. Extending to those requires an explicit new
// product-line decision (schema + lender programs + matching rules)
// first, exactly as flagged in every prior batch.

describe("Expanded cash-out refinance vocabulary", () => {
  const phrases = [
    "pull money out",
    "pull funds out",
    "access cash",
    "borrow against the equity",
    "use the equity",
    "cash equity refinance",
    "cash-back refinance",
    "equity refinance",
  ];
  for (const p of phrases) {
    it(`"${p}" is recognized as cash-out refinance`, () => {
      const x = extractFromTranscript(`Borrower wants to ${p} on their home, worth $500,000, they owe $200,000, credit score 700, full doc.`);
      expect(x.loanPurpose?.value, p).toBe("cash_out_refinance");
    });
  }
});

describe("Expanded property-value vocabulary", () => {
  const cases: Array<[string, number]> = [
    ["coming in around $650,000", 650_000],
    ["coming in at $650,000", 650_000],
    ["in the neighborhood of $500,000", 500_000],
    ["should appraise for $800,000", 800_000],
    ["probably worth $475,000", 475_000],
    ["expected value of $520,000", 520_000],
  ];
  for (const [phrase, value] of cases) {
    it(`"${phrase}" extracts $${value}`, () => {
      const x = extractFromTranscript(`Purchase, single family, ${phrase}, 700 credit score, full doc.`);
      expect(x.propertyValue?.value, phrase).toBe(value);
    });
  }
});

describe("Expanded existing-balance vocabulary", () => {
  it("'principal balance' is recognized as the existing lien", () => {
    const x = extractFromTranscript("Cash-out refi, single family, $900,000 value, principal balance is $400,000, wants $200,000 cash, 700 score, full doc.");
    expect(x.existingLienBalance?.value).toBe(400_000);
  });
  it("bare 'UPB' is recognized as the existing lien", () => {
    const x = extractFromTranscript("Cash-out refi, condo, $600,000 value, UPB is $250,000, wants $150,000 in proceeds, 680 credit, DSCR.");
    expect(x.existingLienBalance?.value).toBe(250_000);
  });
});

describe("Expanded cash-requested vocabulary", () => {
  it("'cash to the borrower' is recognized as the cash-out amount", () => {
    const x = extractFromTranscript("Cash-out refi, single family, $700,000 value, owe $300,000, cash to the borrower is $200,000, 700 FICO, full doc.");
    expect(x.requestedCashOut?.value).toBe(200_000);
  });
  it("'wants to net' is recognized as the cash-out amount", () => {
    const x = extractFromTranscript("Cash-out refi, condo, $500,000 value, owe $200,000, wants to net $150,000, 680 credit, DSCR.");
    expect(x.requestedCashOut?.value).toBe(150_000);
  });
  it("'needs proceeds of' is recognized as the cash-out amount", () => {
    const x = extractFromTranscript("Cash-out refi, single family, $650,000 value, owe $250,000, needs proceeds of $180,000, 720 score, bank statements.");
    expect(x.requestedCashOut?.value).toBe(180_000);
  });
});

describe("Spoken/misheard mortgage-abbreviation normalization", () => {
  it("'D-S-C-R' normalizes to DSCR income documentation", () => {
    const x = extractFromTranscript("This is a D-S-C-R loan on an investment condo, worth $500,000, 75% LTV, 700 credit score.");
    expect(x.incomeDocType?.value).toBe("dscr");
  });
  it("'S-F-R' normalizes to single-family property type", () => {
    const x = extractFromTranscript("Purchase, S-F-R, primary residence, $600,000 value, 700 FICO, full doc.");
    expect(x.propertyType?.value).toBe("single_family");
  });
  it("'ten ninety-nine' normalizes to 1099 income documentation", () => {
    const x = extractFromTranscript("They're a contractor, purchase, condo, $500,000, ten ninety-nine income, 680 credit.");
    expect(x.incomeDocType?.value).toBe("1099");
  });
  it("'L-T-V' is recognized the same as 'LTV' for a down-payment/LTV statement", () => {
    const x = extractFromTranscript("Purchase, single family, $700,000 value, 80% L-T-V, 700 FICO, full doc.");
    const a = assess(x);
    expect(a.derived.ltv).toBe(80);
  });
});

describe("C09 EAD category code (non-permanent resident)", () => {
  it("recognizes 'C09' as non-permanent resident", () => {
    const x = extractFromTranscript("Purchase, condo, $500,000 value, 700 credit, full doc, borrower is a C09 EAD holder.");
    expect(x.citizenship?.value).toBe("non_permanent_resident");
  });
});

describe("Spoken FICO word-forms", () => {
  it("'six eighty' normalizes to 680", () => {
    const x = extractFromTranscript("Purchase, single family, $600,000, full doc, credit score six eighty.");
    expect(x.fico?.value).toBe(680);
  });
  it("'six hundred eighty' normalizes to 680", () => {
    const x = extractFromTranscript("Purchase, condo, $500,000, DSCR, credit is six hundred eighty.");
    expect(x.fico?.value).toBe(680);
  });
});

describe("New mid-speech self-correction markers", () => {
  it("'wait, I mean' replaces the misspoken value", () => {
    const x = extractFromTranscript("Purchase, single family, $600,000, wait, I mean $650,000 value, 700 credit, full doc.");
    expect(x.propertyValue?.value).toBe(650_000);
  });
  it("'that's incorrect' replaces the misspoken value", () => {
    const x = extractFromTranscript("Purchase, condo, $500,000 value, credit score is 650, that's incorrect, 700, full doc.");
    expect(x.fico?.value).toBe(700);
  });
  it("'no, make that' replaces the misspoken value even when the number precedes its own label", () => {
    const x = extractFromTranscript("Purchase, single family, $600,000 value, 680 credit, no, make that 720, full doc.");
    expect(x.fico?.value).toBe(720);
  });
  it("'one second' before a correction is handled without losing later context", () => {
    const x = extractFromTranscript("Purchase, condo, $500,000, 700 credit, one second, DSCR, not full doc.");
    expect(x.incomeDocType?.value).toBe("dscr");
  });
});
