import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(join(__dirname, "../../src/app/lenders/page.tsx"), "utf8");
const importerSource = readFileSync(
  join(__dirname, "../../scripts/ingest_mtg_broker_pending_2026_08_22.mjs"),
  "utf8",
);

describe("customer lender directory availability", () => {
  it("starts from the verified lender catalog rather than every pending lender", () => {
    expect(pageSource).toContain("repo.listLenders(org, MAX_TIER_LEVEL)");
    expect(pageSource).not.toContain("repo.listAllLenders(org)");
  });

  it("does not render zero-program cards for members", () => {
    expect(pageSource).toContain("access.tierLevel === 0 || item.programs.length > 0");
  });

  it("permanently excludes owner-managed lenders from the pending importer", () => {
    for (const lender of [
      "Cardinal Financial | CF Wholesale",
      "CMG Financial",
      "Simple TPO powered by Supreme Lending",
      "SunWest Mortgage Company",
      "PRMG",
    ]) {
      expect(importerSource).toContain(`\"${lender}\"`);
    }
    expect(importerSource).toContain("!excluded.has(normalize(row.lender))");
  });
});
