import { describe, expect, it } from "vitest";
import { FUTURE_UNIQUE_PRODUCT_CATEGORIES, UNIQUE_PRODUCT_CATEGORIES, VERIFY_CURRENT_MATRIX } from "@/domain/uniqueProducts";

describe("unique Non-QM product directory", () => {
  it("ships exactly the five requested active categories without duplicate doctor variants", () => {
    expect(UNIQUE_PRODUCT_CATEGORIES.map((category) => category.name)).toEqual([
      "Jumbo AUS",
      "ITIN DSCR",
      "ITIN P&L Only",
      "Graduate Mortgage",
      "Doctor / Medical Professional Loan",
    ]);
    expect(UNIQUE_PRODUCT_CATEGORIES.some((category) => /physician loan|100% financing|future income|no-pmi/i.test(category.name))).toBe(false);
  });

  it("stores hybrid eligibility as an explicit program type on every lender record", () => {
    for (const category of UNIQUE_PRODUCT_CATEGORIES) {
      for (const lender of category.lenders) expect(lender.programType).toBe(category.programType);
    }
    expect(UNIQUE_PRODUCT_CATEGORIES.find((category) => category.slug === "itin-dscr")?.lenders.every((lender) => lender.programType === "ITIN_DSCR")).toBe(true);
    expect(UNIQUE_PRODUCT_CATEGORIES.find((category) => category.slug === "itin-pl-only")?.lenders.every((lender) => lender.programType === "ITIN_PL_ONLY")).toBe(true);
  });

  it("never leaves a standardized field blank and uses the verification fallback", () => {
    for (const category of UNIQUE_PRODUCT_CATEGORIES) {
      for (const lender of category.lenders) {
        expect(["CONFIRMED", "VERIFY_CURRENT_MATRIX"]).toContain(lender.verificationStatus);
        for (const field of category.fieldOrder) {
          expect(lender.fields[field]).toBeTruthy();
          expect(lender.fields[field]?.trim()).not.toBe("");
        }
      }
    }
    expect(VERIFY_CURRENT_MATRIX).toBe("Verify Current Matrix");
  });

  it("keeps future categories inactive and outside the live category collection", () => {
    expect(FUTURE_UNIQUE_PRODUCT_CATEGORIES).toContain("WVOE Only");
    expect(FUTURE_UNIQUE_PRODUCT_CATEGORIES).toContain("Blanket Loans");
    expect(UNIQUE_PRODUCT_CATEGORIES.some((category) => FUTURE_UNIQUE_PRODUCT_CATEGORIES.includes(category.name as never))).toBe(false);
  });
});
