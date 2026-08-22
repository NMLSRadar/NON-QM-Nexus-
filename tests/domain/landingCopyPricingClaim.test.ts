// Copy-integrity fix (launch-hardening spec, Section 5): the landing page
// used to claim "pricing and technology are only ever secondary,
// transparent factors" in its ranking-explanation card — false, since
// ranking uses no pricing data at all, so pricing is not a factor of any
// kind, not even a secondary one. Pins that the corrected wording sticks:
// no lingering "secondary" framing, and no sentence anywhere in the
// landing/feature copy names pricing as a ranking factor.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LANDING_COPY_FILES = [
  join(__dirname, "../../src/app/public-landing.tsx"),
  join(__dirname, "../../src/app/page.tsx"),
];

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("landing page copy — pricing is not a ranking factor", () => {
  it('never uses the word "secondary" to describe pricing/technology in ranking', () => {
    const source = readSource(join(__dirname, "../../src/app/public-landing.tsx"));
    expect(source).not.toMatch(/secondary/i);
  });

  it("never states or implies pricing is any kind of ranking factor", () => {
    for (const file of LANDING_COPY_FILES) {
      const source = readSource(file);
      // Specific bad phrasings this fix removed/must never reappear —
      // deliberately NOT a blind "pricing...factor" proximity match, since
      // the corrected copy legitimately pairs those two words together
      // while NEGATING the claim ("pricing is never a factor").
      expect(source).not.toMatch(/secondary,?\s+transparent\s+factor/i);
      expect(source).not.toMatch(/pricing\s+(?:is|are|and\s+technology\s+are)\s+(?:only\s+)?(?:ever\s+)?(?:a\s+|an\s+)?(?:secondary\s+)?factor/i);
    }
  });

  it("still states pricing has zero role in matching (the corrected claim)", () => {
    const source = readSource(join(__dirname, "../../src/app/public-landing.tsx"));
    expect(source).toMatch(/pricing is never a factor/i);
  });

  it("shows live lender and program totals instead of a hand-maintained marketing number", () => {
    const source = readSource(join(__dirname, "../../src/app/public-landing.tsx"));
    expect(source).toContain("Verified lenders");
    expect(source).toContain("Programs available");
    expect(source).toContain("lenderCount.toLocaleString()");
    expect(source).toContain("programCount.toLocaleString()");
    expect(source).not.toContain("HUNDREDS OF NON-QM PROGRAMS AT YOUR FINGERTIPS!");
  });
});
