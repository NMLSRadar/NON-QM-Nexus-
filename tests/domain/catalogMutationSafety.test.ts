import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("production catalog mutation safety", () => {
  it("never runs database ingestion from build or postbuild", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).not.toMatch(/ingest|run_production_ingestions/);
    expect(pkg.scripts.postbuild).not.toMatch(/ingest|run_production_ingestions/);
  });

  it("does not archive Redwood's verified Aspire programs", () => {
    const source = readFileSync("scripts/ingest_ten_lender_nonqm_2026_08_08.mjs", "utf8");
    expect(source).not.toContain("archiveKnownGenericRows");
    expect(source).not.toContain("const stale = new Map");
  });

  it("can revive canonical Redwood rows and archives duplicate names deterministically", () => {
    const source = readFileSync("scripts/redwood_newfi_ingest_2026_08_06.mjs", "utf8");
    expect(source).toContain("deleted_at:null");
    expect(source).toContain("sameNameRows.slice(1)");
    expect(source).toContain('order("created_at", {ascending:true})');
  });
});
