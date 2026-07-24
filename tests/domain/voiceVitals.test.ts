import { describe, expect, it } from "vitest";
import { extractFromTranscript, classifyLoanPurpose, classifyFirstTimeHomebuyer, classifyInvestorExperience, classifyVesting } from "@/domain/voice/extract";

// Covers the exact phrases and behaviors required for the Voice Scenario
// Vitals correction: loan-purpose synonym/priority detection, first-time
// homebuyer vs. investor-experience as distinct fields, and title vesting.
// See docs/voice-vitals.md.

describe("loan purpose: refinance synonyms", () => {
  const phrases = [
    "refinance",
    "refinancing",
    "refi",
    "doing a refi",
    "refinance the property",
    "refinance the loan",
    "replace the current mortgage",
    "pay off the existing mortgage",
    "new loan on an owned property",
  ];
  for (const p of phrases) {
    it(`"${p}" registers as a refinance needing a subtype`, () => {
      const x = extractFromTranscript(`This is a ${p}.`);
      expect(x.loanPurpose?.value).toBe("rate_term_refinance");
      expect(x.refinancePendingSubtype).toBe(true);
    });
  }

  it('a bare "refi" alone still registers Refinance (pending subtype), never blank', () => {
    const x = extractFromTranscript("refi");
    expect(x.loanPurpose).toBeDefined();
    expect(x.refinancePendingSubtype).toBe(true);
  });
});

describe("loan purpose: cash-out synonyms", () => {
  const phrases = [
    "cash out",
    "cash-out",
    "cashout",
    "cash-out refinance",
    "cash out refi",
    "take cash out",
    "pull cash out",
    "pull equity",
    "access equity",
    "tap into equity",
    "receive proceeds",
    "consolidate debt with equity",
    "pay off debt using the property",
    "refinance and receive cash back",
  ];
  for (const p of phrases) {
    it(`"${p}" registers as cash_out_refinance, not a generic refinance`, () => {
      const x = extractFromTranscript(`They want to ${p}.`);
      expect(x.loanPurpose?.value).toBe("cash_out_refinance");
      expect(x.refinancePendingSubtype).toBeFalsy();
    });
  }
});

describe("loan purpose: rate-and-term synonyms", () => {
  const phrases = [
    "rate and term",
    "rate-and-term",
    "lower the rate",
    "change the term",
    "reduce the payment",
    "refinance without cash out",
    "no cash back",
    "pay off the existing loan only",
    "straight refinance",
  ];
  for (const p of phrases) {
    it(`"${p}" registers as rate_term_refinance`, () => {
      const x = extractFromTranscript(`They want to ${p}.`);
      expect(x.loanPurpose?.value).toBe("rate_term_refinance");
      expect(x.refinancePendingSubtype).toBeFalsy();
    });
  }
});

describe("loan purpose: purchase synonyms", () => {
  const phrases = ["purchase", "buying", "buy", "acquire", "acquisition", "purchasing a property", "under contract", "buying a home", "buying an investment property"];
  for (const p of phrases) {
    it(`"${p}" registers as purchase`, () => {
      const x = extractFromTranscript(`This is a scenario for ${p}.`);
      expect(x.loanPurpose?.value).toBe("purchase");
    });
  }
});

describe("loan purpose: conflict priority — cash-out wins", () => {
  it("cash-out language takes priority over generic refinance language in the same utterance", () => {
    const c = classifyLoanPurpose("refinance and pull cash out");
    expect(c?.value).toBe("cash_out_refinance");
  });
  it("cash-out language takes priority over rate-and-term language in the same utterance", () => {
    const c = classifyLoanPurpose("rate and term refinance but actually take cash out");
    expect(c?.value).toBe("cash_out_refinance");
  });
});

describe("loan purpose: required spec examples", () => {
  it('"I want to refi an investment property." -> rate_term_refinance (no cash-out language)', () => {
    const x = extractFromTranscript("I want to refi an investment property.");
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.refinancePendingSubtype).toBe(true);
  });
  it('"The borrower wants to refinance and pull $100,000 out." -> cash_out_refinance', () => {
    const x = extractFromTranscript("The borrower wants to refinance and pull $100,000 out.");
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
  });
  it('"This is a cash out loan." -> cash_out_refinance', () => {
    const x = extractFromTranscript("This is a cash out loan.");
    expect(x.loanPurpose?.value).toBe("cash_out_refinance");
  });
  it('"They just want to lower their rate and are not taking cash back." -> rate_term_refinance', () => {
    const x = extractFromTranscript("They just want to lower their rate and are not taking cash back.");
    expect(x.loanPurpose?.value).toBe("rate_term_refinance");
    expect(x.refinancePendingSubtype).toBeFalsy();
  });
  it('"They are buying their first home." -> purchase + firstTimeHomebuyer=yes', () => {
    const x = extractFromTranscript("They are buying their first home.");
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.firstTimeHomebuyer?.value).toBe(true);
  });
});

describe("first-time homebuyer vs. investor experience — distinct fields", () => {
  it('"This is the borrower\'s first rental property." -> investorExperience=first_time_investor (not firstTimeHomebuyer)', () => {
    const x = extractFromTranscript("This is the borrower's first rental property.");
    expect(x.investorExperience?.value).toBe("first_time_investor");
    expect(x.firstTimeHomebuyer).toBeUndefined();
  });
  it('"The borrower owns five rental properties." -> investorExperience=experienced_investor', () => {
    const x = extractFromTranscript("The borrower owns five rental properties.");
    expect(x.investorExperience?.value).toBe("experienced_investor");
  });
  it("first-time homebuyer and investor experience can both be captured for the same borrower", () => {
    const x = extractFromTranscript("They are buying their first home and this is also their first rental property.");
    expect(x.firstTimeHomebuyer?.value).toBe(true);
    expect(x.investorExperience?.value).toBe("first_time_investor");
  });
  it("negative first-time-homebuyer phrasing resolves to No, not blank", () => {
    const x = extractFromTranscript("The borrower is not a first-time homebuyer.");
    expect(x.firstTimeHomebuyer?.value).toBe(false);
  });
  it("legacy firstTimeInvestor boolean stays in sync with the richer investorExperience field", () => {
    const x = extractFromTranscript("This will be their first rental property.");
    expect(x.firstTimeInvestor).toBe(true);
    const y = extractFromTranscript("The borrower owns several properties already.");
    expect(y.firstTimeInvestor).toBe(false);
  });
});

describe("title vesting", () => {
  it('"Title will be held in their LLC." -> llc', () => {
    expect(extractFromTranscript("Title will be held in their LLC.").vesting?.value).toBe("llc");
  });
  it('"The property is going into the family trust." -> trust', () => {
    expect(extractFromTranscript("The property is going into the family trust.").vesting?.value).toBe("trust");
  });
  it('"They will close in the borrower\'s personal name." -> individual', () => {
    expect(extractFromTranscript("They will close in the borrower's personal name.").vesting?.value).toBe("individual");
  });
  it('"The property will be vested in ABC Holdings, Inc." -> corporation', () => {
    expect(extractFromTranscript("The property will be vested in ABC Holdings, Inc.").vesting?.value).toBe("corporation");
  });
  it("recognizes standalone classifier calls directly (shared normalization layer)", () => {
    expect(classifyVesting("a revocable trust")?.value).toBe("trust");
    expect(classifyVesting("an s corporation")?.value).toBe("corporation");
    expect(classifyVesting("joint tenants")?.value).toBe("individual");
  });
});

describe("robustness: capitalization, punctuation, and common speech-to-text variants", () => {
  it("is case-insensitive", () => {
    expect(extractFromTranscript("THIS IS A CASH-OUT REFINANCE.").loanPurpose?.value).toBe("cash_out_refinance");
  });
  it("tolerates punctuation differences", () => {
    expect(extractFromTranscript("Cash-out refinance, please!!").loanPurpose?.value).toBe("cash_out_refinance");
  });
  it('"refi" vs "refinance" both resolve the same way absent subtype language', () => {
    const a = extractFromTranscript("refi");
    const b = extractFromTranscript("refinance");
    expect(a.loanPurpose?.value).toBe(b.loanPurpose?.value);
    expect(a.refinancePendingSubtype).toBe(b.refinancePendingSubtype);
  });
  it('"cashout" with no space or hyphen still resolves to cash_out_refinance', () => {
    expect(extractFromTranscript("cashout refi").loanPurpose?.value).toBe("cash_out_refinance");
  });
});

describe("first-time homebuyer classifier directly", () => {
  it("recognizes the required positive phrases", () => {
    for (const p of ["first-time homebuyer", "first-time buyer", "first home", "never owned a home", "has not owned a home before", "buying their first primary residence"]) {
      expect(classifyFirstTimeHomebuyer(p)?.value, p).toBe(true);
    }
  });
  it("recognizes the required negative phrases", () => {
    for (const p of ["not a first-time homebuyer", "currently owns a home", "has owned property before", "previously owned a primary residence"]) {
      expect(classifyFirstTimeHomebuyer(p)?.value, p).toBe(false);
    }
  });
});

describe("investor experience classifier directly", () => {
  it("recognizes the required first-time-investor phrases", () => {
    for (const p of ["first-time investor", "first investment property", "first rental", "never owned an investment property", "new investor", "this will be their first rental property"]) {
      expect(classifyInvestorExperience(p)?.value, p).toBe("first_time_investor");
    }
  });
  it("recognizes the required experienced-investor phrases", () => {
    for (const p of ["experienced investor", "owns rentals", "owns investment properties", "currently owns multiple properties", "has a rental portfolio", "has landlord experience", "has owned investment property before", "owns two rentals", "owns several properties"]) {
      expect(classifyInvestorExperience(p)?.value, p).toBe("experienced_investor");
    }
  });
});
