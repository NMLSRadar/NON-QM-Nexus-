import { describe, expect, it } from "vitest";
import { getWordmarkStyle, LENDER_WORDMARK_STYLES, type LenderWordmarkStyle } from "@/domain/lenderBrandStyle";

describe("lenderBrandStyle: text-only wordmark treatments (no logos)", () => {
  it("returns a defined style for every real lender currently in the catalog", () => {
    const realLenders = [
      "A&D Mortgage",
      "Acra Lending",
      "American Heritage Lending",
      "Angel Oak Mortgage Solutions",
      "BluePoint Mortgage",
      "Carrington Mortgage Services",
      "Champions Funding",
      "Change Wholesale",
      "CoreVest Finance",
      "Deephaven Mortgage",
      "First National Bank of America",
      "FundLoans",
      "GreenBox Loans",
      "HomeXpress Mortgage",
      "JMAC Lending",
      "Kind Lending",
      "Kiavi",
      "LendingOne",
      "LendSure Mortgage Corp.",
      "LoanStream Mortgage",
      "Luxury Mortgage Corp",
      "Maverick Lending Solutions",
      "NewFi Lending",
      "NQM Funding",
      "Orion Lending",
      "Plaza Home Mortgage",
      "RCN Capital",
      "Stratton Equities",
      "Velocity Mortgage Capital",
      "Verus Mortgage Capital",
    ];
    for (const name of realLenders) {
      expect(getWordmarkStyle(name), name).not.toBeNull();
    }
  });

  it("every style's first+second segments concatenate back to the exact real lender name (never altered/abbreviated)", () => {
    for (const [name, style] of Object.entries(LENDER_WORDMARK_STYLES) as Array<[string, LenderWordmarkStyle]>) {
      const rebuilt = style.second ? `${style.first}${style.joiner ?? " "}${style.second}` : style.first;
      expect(rebuilt, name).toBe(name);
    }
  });

  it("returns null (plain-text fallback) for an unknown/sample lender name", () => {
    expect(getWordmarkStyle("Horizon Alternative Lending (Sample)")).toBeNull();
  });
});
