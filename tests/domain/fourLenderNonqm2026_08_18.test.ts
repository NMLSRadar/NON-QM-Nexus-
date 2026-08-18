import { describe, expect, it } from "vitest";
// The ingestion module is deliberately executable JavaScript so Vercel can run
// it during postbuild without a TS runtime.
// @ts-ignore -- executable ingestion module has no declaration file
import { PROGRAMS } from "../../scripts/ingest_four_lender_nonqm_2026_08_18.mjs";

describe("Brokers Choice, Jet, GIANT, and First Colony — 2026-08-18 NON-QM ingestion", () => {
  it("1. creates the intended 27 program records with no duplicate lender/program names", () => {
    expect(PROGRAMS).toHaveLength(27);
    expect(new Set(PROGRAMS.map((p: { lender: string; name: string }) => `${p.lender}|${p.name}`)).size).toBe(27);
  });

  it("2. covers all four lenders with their intended program counts", () => {
    const byLender = PROGRAMS.reduce((acc: Record<string, number>, p: { lender: string }) => {
      acc[p.lender] = (acc[p.lender] ?? 0) + 1;
      return acc;
    }, {});
    expect(byLender["GIANT Lending"]).toBe(8);
    expect(byLender["Jet Advantage Mortgage"]).toBe(8);
    expect(byLender["Brokers Choice Mortgage"]).toBe(6);
    expect(byLender["First Colony Wholesale"]).toBe(5);
  });

  it("3. NON-QM only — no agency, DPA, FHA, VA, USDA, or conventional programs ingested", () => {
const banned = /dpa|fha|va\b|usda|conventional|agency|true.?zero|calhfa/i;
    const names = PROGRAMS.map((p: { name: string }) => p.name).join(" • ");
    expect(names).not.toMatch(banned);
    for (const p of PROGRAMS) {
      const cfg = p.config as Record<string, unknown>;
      expect(String(cfg.notes ?? "").toLowerCase()).not.toContain("zero down");
    }
  });

  it("4. every program carries a documented NON-QM income doc type", () => {
    const allowed = ["full_doc", "bank_statement", "pnl_only", "dscr", "1099", "wvoe_only", "asset_depletion"];
    for (const p of PROGRAMS) {
      const cfg = p.config as { incomeDocTypes?: string[] };
      expect(cfg.incomeDocTypes?.length ?? 0).toBeGreaterThan(0);
      for (const doc of cfg.incomeDocTypes ?? []) expect(allowed).toContain(doc);
    }
  });

  it("5. GIANT SUB600 preserves the 500-FICO / 65% LTV headline discipline", () => {
    const sub600 = PROGRAMS.find((p: { lender: string; name: string }) => p.lender === "GIANT Lending" && p.name.includes("SUB600"));
    expect(sub600).toBeTruthy();
    const cfg = sub600.config as { minFico: number; baseMaxLtv: number; eligibilityLtvMatrix: Array<{ maxLtv: number }> };
    expect(cfg.minFico).toBe(500);
    expect(cfg.baseMaxLtv).toBe(65);
    expect(Math.max(...cfg.eligibilityLtvMatrix.map((r) => r.maxLtv))).toBeLessThanOrEqual(65);
  });

  it("6. First Colony DSCR uses 0.75 minimum with the 1.00 band granting the fuller grid", () => {
    const fcm = PROGRAMS.find((p: { lender: string; name: string }) => p.lender === "First Colony Wholesale" && p.name.includes("DSCR"));
    const cfg = fcm!.config as { minDscr: number; eligibilityLtvMatrix: Array<{ minDscr: number; maxDscrExclusive?: number; maxLtv: number }> };
    expect(cfg.minDscr).toBe(0.75);
    const band10 = cfg.eligibilityLtvMatrix.filter((r) => r.minDscr === 1.0);
    const bandFull = cfg.eligibilityLtvMatrix.filter((r) => r.minDscr === 0.75 && r.maxDscrExclusive === 1.0);
    expect(band10.length).toBeGreaterThan(bandFull.length);
    expect(Math.max(...band10.map((r) => r.maxLtv))).toBeGreaterThan(Math.max(...bandFull.map((r) => r.maxLtv)));
  });

  it("7. Second-lien NON-Q products are tagged as standalone seconds with CLTV leverage", () => {
    const seconds = PROGRAMS.filter((p: any) => p.config.lienPosition === "standalone_second");
    expect(seconds.length).toBe(3); // GIANT, Jet, Brokers Choice
    for (const s of seconds) {
      expect(s.config.ltvMetric).toBe("cltv");
      expect(s.config.baseMaxLtv).toBeGreaterThanOrEqual(85);
      expect(s.config.minFico).toBe(660);
    }
  });
});