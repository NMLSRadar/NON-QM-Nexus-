import { describe, expect, it } from "vitest";
import { analyzeScenario } from "@/domain/analyze";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import { sampleScenarios } from "@/data/sampleScenarios";
import type { MatchStatus } from "@/domain/types/enums";

/**
 * Scenario regression harness (product spec §24).
 *
 * Pins the BEST display status of every sample scenario so any change to the
 * engine, rules, or sample data that shifts a system-level outcome fails
 * loudly here instead of drifting silently. This is the harness whose absence
 * previously allowed two statuses (`conditional`,
 * `eligible_with_restructuring`) to be unreachable while all unit tests
 * stayed green.
 *
 * Known dataset gap, tracked deliberately: product spec §21 asks the sample
 * set for at least four CONDITIONAL scenarios; this dataset currently
 * produces one (scn_itin). Rebalancing the demo rules/scenarios to hit four
 * is open work — update EXPECTED_BEST (not the assertions) when doing it.
 */

const catalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };
const ASOF = new Date("2026-07-01");

const EXPECTED_BEST: Record<string, MatchStatus> = {
  scn_bs_primary: "eligible_with_restructuring",
  scn_pnl: "strong_match",
  scn_dscr: "manual_review",
  scn_dscr_fti: "eligible",
  scn_foreign_national: "manual_review",
  scn_itin: "conditional",
  scn_npr_ead: "strong_match",
  scn_asset_depletion: "strong_match",
  scn_recent_bk: "eligible_with_restructuring",
  scn_rural: "ineligible",
  scn_non_warrantable: "eligible_with_restructuring",
  scn_high_dti: "eligible_with_restructuring",
};

const BAND_ORDER: MatchStatus[] = [
  "strong_match",
  "eligible",
  "conditional",
  "eligible_with_restructuring",
  "manual_review",
  "ineligible",
];

describe("scenario regression harness (§24)", () => {
  it("covers every sample scenario exactly once", () => {
    expect(sampleScenarios.map((s) => s.id).sort()).toEqual(Object.keys(EXPECTED_BEST).sort());
  });

  for (const scenario of sampleScenarios) {
    it(`${scenario.id}: best status is ${EXPECTED_BEST[scenario.id]}`, () => {
      const result = analyzeScenario(scenario, catalog, ASOF);
      expect(result.evaluations[0]?.status).toBe(EXPECTED_BEST[scenario.id]);
    });
  }

  it("every status band the UI displays is reachable somewhere in the dataset", () => {
    const seen = new Set<MatchStatus>();
    for (const scenario of sampleScenarios) {
      for (const e of analyzeScenario(scenario, catalog, ASOF).evaluations) seen.add(e.status);
    }
    for (const status of BAND_ORDER) {
      expect(seen.has(status)).toBe(true);
    }
  });

  it("evaluations are always ranked best-first by status band, then score", () => {
    for (const scenario of sampleScenarios) {
      const result = analyzeScenario(scenario, catalog, ASOF);
      const indices = result.evaluations.map((e) => BAND_ORDER.indexOf(e.status));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i] as number).toBeGreaterThanOrEqual(indices[i - 1] as number);
      }
    }
  });

  it("every evaluation is labeled sample data and carries the disclaimer; every restructuring option carries unlock IDs", () => {
    for (const scenario of sampleScenarios) {
      const result = analyzeScenario(scenario, catalog, ASOF);
      for (const e of result.evaluations) {
        expect(e.isSampleData).toBe(true);
        expect(e.disclaimer).toContain("Preliminary scenario analysis only");
      }
      for (const o of result.restructuring) {
        // Eligibility options must carry a real unlock ID per program they
        // unlock. Exception-strengthening options (chatbot Part 2 §4.3) are
        // deliberately NOT eligibility unlocks — they carry no unlock IDs and
        // are never fed into the eligible_with_restructuring display upgrade.
        if (o.kind === "exception_strengthening") {
          expect(o.programsPotentiallyUnlockedIds).toHaveLength(0);
        } else {
          expect(o.programsPotentiallyUnlockedIds).toHaveLength(o.programsPotentiallyUnlocked.length);
        }
      }
    }
  });
});
