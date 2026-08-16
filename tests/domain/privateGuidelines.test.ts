import { describe, expect, it } from "vitest";
import {
  PRIVATE_GUIDELINE_LENDERS,
  getPrivateGuidelinesInfo,
  isPrivateGuidelinesLender,
  normalizeLenderName,
  privateGuidelinesLendersInCatalog,
} from "@/domain/privateGuidelines";
import type { Lender } from "@/domain/types/program";

describe("private-guidelines registry (UWM + Change Wholesale)", () => {
  it("flags both lenders by their exact catalog name", () => {
    expect(isPrivateGuidelinesLender("United Wholesale Mortgage")).toBe(true);
    expect(isPrivateGuidelinesLender("Change Wholesale")).toBe(true);
  });

  it("matches case- and whitespace-tolerantly (same convention as lenderIntelligence)", () => {
    expect(isPrivateGuidelinesLender("  united   wholesale mortgage ")).toBe(true);
    expect(getPrivateGuidelinesInfo("CHANGE WHOLESALE")?.name).toBe("Change Wholesale");
  });

  it("never flags ordinary catalog lenders", () => {
    expect(isPrivateGuidelinesLender("Luxury Mortgage Corp")).toBe(false);
    expect(isPrivateGuidelinesLender("Orion Lending")).toBe(false);
  });

  it("is safe with empty/undefined names", () => {
    expect(isPrivateGuidelinesLender("")).toBe(false);
    expect(isPrivateGuidelinesLender("   ")).toBe(false);
    expect(getPrivateGuidelinesInfo("")).toBeNull();
  });

  it("every entry carries the required record-level disclosure", () => {
    expect(PRIVATE_GUIDELINE_LENDERS.length).toBeGreaterThan(0);
    for (const lender of PRIVATE_GUIDELINE_LENDERS) {
      expect(lender.summary).toContain("Guidelines are not publicly published");
      expect(lender.summary).toContain("Contact your AE for current terms");
      expect(lender.detail.length).toBeGreaterThan(lender.summary.length);
    }
  });

  it("normalization collapses runs of whitespace", () => {
    expect(normalizeLenderName("  Change\t  Wholesale ")).toBe("change wholesale");
  });

  it("resolves private-guidelines lenders present in a catalog (active, non-sample only)", () => {
    const lenders: Lender[] = [
      { id: "1", organizationId: "o", name: "United Wholesale Mortgage", isSampleData: false, active: true, tierLevel: 3 },
      { id: "2", organizationId: "o", name: "Change Wholesale", isSampleData: false, active: false, tierLevel: 2 },
      { id: "3", organizationId: "o", name: "United Wholesale Mortgage", isSampleData: true, active: true, tierLevel: 3 },
      { id: "4", organizationId: "o", name: "Luxury Mortgage Corp", isSampleData: false, active: true, tierLevel: 1 },
    ];
    const found = privateGuidelinesLendersInCatalog(lenders);
    expect(found.map((l) => l.name)).toEqual(["United Wholesale Mortgage"]);
  });
});