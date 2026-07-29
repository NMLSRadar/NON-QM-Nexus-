import { describe, expect, it } from "vitest";
import { classifyLoanPurpose, extractFromTranscript, normalizeTranscript } from "@/domain/voice/extract";

// Covers the HELOC / second-lien loan-purpose addition (2026-07-29): several
// catalog lenders' guidelines document standalone HELOC and second-lien
// programs. HELOC is pronounced "HEE-lock" and speech-to-text very commonly
// renders it as "he lock" / "he-lock" / "helock" rather than the literal
// acronym; "lien" is a homophone of "lean" and gets misheard the same way.
// These tests lock in that the Voice Scenario recognizes every real-world
// spoken/transcribed surface form.

describe("HELOC — phonetic + literal recognition", () => {
  it("recognizes the literal acronym", () => {
    expect(classifyLoanPurpose("the borrower wants a heloc")?.value).toBe("heloc");
  });

  it("recognizes the spoken mishearing 'he lock' (two words)", () => {
    expect(classifyLoanPurpose(normalizeTranscript("the borrower wants a he lock"))?.value).toBe("heloc");
  });

  it("recognizes the hyphenated mishearing 'he-lock'", () => {
    expect(classifyLoanPurpose(normalizeTranscript("looking for a he-lock on their primary residence"))?.value).toBe("heloc");
  });

  it("recognizes the run-together mishearing 'helock'", () => {
    expect(classifyLoanPurpose(normalizeTranscript("she needs a helock"))?.value).toBe("heloc");
  });

  it("recognizes the fully spoken phrase 'home equity line of credit'", () => {
    expect(classifyLoanPurpose("they want a home equity line of credit")?.value).toBe("heloc");
  });

  it("recognizes the shortened 'home equity line' without 'of credit'", () => {
    expect(classifyLoanPurpose("borrower is asking about a home equity line")?.value).toBe("heloc");
  });

  it("recognizes 'equity line of credit'", () => {
    expect(classifyLoanPurpose("wants an equity line of credit against the house")?.value).toBe("heloc");
  });

  it("HELOC wins over generic equity/cash-out phrasing in the same utterance", () => {
    const c = classifyLoanPurpose(normalizeTranscript("borrower wants to tap into the equity with a he lock"));
    expect(c?.value).toBe("heloc");
  });

  it("full pipeline: extractFromTranscript resolves loanPurpose to heloc from spoken 'he lock'", () => {
    const x = extractFromTranscript("primary residence, single family, borrower wants a he lock, 720 fico");
    expect(x.loanPurpose?.value).toBe("heloc");
  });
});

describe("Second lien — phonetic + literal recognition", () => {
  it("recognizes 'second lien'", () => {
    expect(classifyLoanPurpose("this is a second lien behind their existing first mortgage")?.value).toBe("second_lien");
  });

  it("recognizes the homophone mishearing 'second lean' (lien sounds like lean)", () => {
    expect(classifyLoanPurpose(normalizeTranscript("looking for a second lean on the property"))?.value).toBe("second_lien");
  });

  it("recognizes 'junior lien'", () => {
    expect(classifyLoanPurpose("needs a junior lien")?.value).toBe("second_lien");
  });

  it("recognizes the homophone mishearing 'junior lean'", () => {
    expect(classifyLoanPurpose(normalizeTranscript("wants a junior lean"))?.value).toBe("second_lien");
  });

  it("recognizes 'second mortgage'", () => {
    expect(classifyLoanPurpose("borrower wants a second mortgage")?.value).toBe("second_lien");
  });

  it("recognizes 'piggyback loan' and 'piggy-back'", () => {
    expect(classifyLoanPurpose("structuring this as a piggyback loan")?.value).toBe("second_lien");
    expect(classifyLoanPurpose("a piggy-back to avoid PMI")?.value).toBe("second_lien");
  });

  it("recognizes 'silent second'", () => {
    expect(classifyLoanPurpose("down payment assistance as a silent second")?.value).toBe("second_lien");
  });

  it("recognizes '2nd lien'", () => {
    expect(classifyLoanPurpose("this would be a 2nd lien")?.value).toBe("second_lien");
  });

  it("full pipeline: extractFromTranscript resolves loanPurpose to second_lien from spoken 'second lean'", () => {
    const x = extractFromTranscript(normalizeTranscript("single family primary residence, borrower wants a second lean, 700 fico"));
    expect(x.loanPurpose?.value).toBe("second_lien");
  });
});
