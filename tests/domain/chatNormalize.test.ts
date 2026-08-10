import { describe, it, expect } from "vitest";
import { normalizeText, parseLatePattern, levenshtein, fuzzyMatch } from "@/domain/chat/normalize";

describe("chat normalizeText", () => {
  it("fixes speech-to-text typos for domain terms", () => {
    expect(normalizeText("two mortgage lights")).toContain("mortgage_lates");
    expect(normalizeText("what's the DCSR")).toContain("dscr");
    expect(normalizeText("bank statment loan")).toContain("bank_statement");
    expect(normalizeText("ITN borrower")).toContain("itin");
    expect(normalizeText("assett depletion")).toContain("asset_depletion");
    expect(normalizeText("full dock")).toContain("full_doc");
  });

  it("expands shorthand and abbreviations", () => {
    expect(normalizeText("BK7")).toContain("bk7");
    expect(normalizeText("Ch 13")).toContain("bk13");
    expect(normalizeText("non-warr condo")).toContain("non_warrantable");
    expect(normalizeText("2-4 unit")).toContain("2_4_unit");
    expect(normalizeText("interest-only")).toContain("io");
    expect(normalizeText("short-term rental")).toContain("str");
    expect(normalizeText("greenbox GBX")).toContain("greenbox loans");
    expect(normalizeText("home xpress")).toContain("homexpress mortgage");
  });

  it("maps colloquial equivalences", () => {
    expect(normalizeText("owner occupied")).toContain("owner_occupied");
    expect(normalizeText("no ratio dscr")).toContain("no_ratio");
    expect(normalizeText("loan to value")).toContain("ltv");
    expect(normalizeText("debt to income")).toContain("dti");
  });
});

describe("chat parseLatePattern", () => {
  it("parses x-form patterns", () => {
    expect(parseLatePattern("2x30x12")).toEqual({ count: 2, days: 30, lookbackMonths: 12, text: "2x30x12" });
    expect(parseLatePattern("1x60x24")).toEqual({ count: 1, days: 60, lookbackMonths: 24, text: "1x60x24" });
    expect(parseLatePattern("0x30x12")).toEqual({ count: 0, days: 30, lookbackMonths: 12, text: "0x30x12" });
  });

  it("parses spoken variants", () => {
    expect(parseLatePattern("two thirty in twelve months")).toEqual({ count: 2, days: 30, lookbackMonths: 12, text: "2x30x12" });
  });

  it("rejects invalid patterns", () => {
    expect(parseLatePattern("no pattern here")).toBeNull();
    expect(parseLatePattern("5x45x12")).toBeNull(); // 45-day not a real category
  });
});

describe("chat fuzzyMatch", () => {
  it("suggests the closest known name", () => {
    const names = ["Greenbox Loans", "Orion Lending", "Acra Lending"];
    const r = fuzzyMatch("greenbox", names);
    expect(r?.target).toBe("Greenbox Loans");
    expect(r!.distance).toBeLessThanOrEqual(3);
  });

  it("returns null beyond the distance threshold", () => {
    expect(fuzzyMatch("totally unrelated name xyz", ["Greenbox Loans"])).toBeNull();
  });

  it("levenshtein is correct", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("greenbox", "greenbox")).toBe(0);
  });
});