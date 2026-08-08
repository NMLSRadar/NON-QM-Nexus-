import { describe, expect, it } from "vitest";
import { getProgramConfigRuntimeIssues } from "@/lib/repository/supabaseRepository";
// The production ingestion is intentionally plain ESM so Vercel can run it directly.
// @ts-expect-error The JavaScript ingestion module has no declaration file.
import { programs } from "../../scripts/ingest_planet_home_2026_08_06.mjs";

describe("Planet Home Lending catalog regression", () => {
  const rows = programs("planet-regression-lender");

  it("keeps all 21 verified programs compatible with the runtime quarantine", () => {
    expect(rows).toHaveLength(21);
    for (const [name, config] of rows) {
      expect(getProgramConfigRuntimeIssues(config), name).toEqual([]);
      expect(config.active, name).toBe(true);
      expect(config.currentVersionPending, name).toBe(false);
      expect(config.excludedFromVerifiedMatching, name).toBe(false);
    }
  });

  it("uses exact state arrays instead of unsupported ALL_EXCEPT shorthand", () => {
    for (const [name, config] of rows) {
      expect(Array.isArray(config.eligibleStates), name).toBe(true);
      expect(config.eligibleStates, name).toContain("CA");
      expect(config.eligibleStates, name).toContain("TX");
      expect(config.eligibleStates, name).not.toContain("MA");
    }

    const heloanRows = rows.filter(([name]: [string]) => name.includes("HELOAN"));
    expect(heloanRows).toHaveLength(2);
    for (const [name, config] of heloanRows) {
      for (const excludedState of ["DC", "IA", "MA", "NY", "RI", "TN"]) {
        expect(config.eligibleStates, `${name}: ${excludedState}`).not.toContain(excludedState);
      }
    }
  });
});
