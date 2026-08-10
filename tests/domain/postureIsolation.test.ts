import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import { analyzeScenario, type ProgramCatalog } from "@/domain/analyze";
import { mergePostureProfiles, resolvePostureProfile, type LenderFlexibilityProfile } from "@/domain/lenderPosture";
import { defaultPostureSeed } from "@/domain/lenderPosture/seed";
import { sampleScenarios } from "@/data/sampleScenarios";

/**
 * ISOLATION SUITE (Part 2, §7): lender posture must never change match
 * status or match score. Posture is display/advisory metadata — flipping a
 * lender between exception_based and rigid must leave every rule outcome
 * and every score identical.
 */

const catalog: ProgramCatalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };

function makeProfile(name: string, posture: LenderFlexibilityProfile["posture"]): LenderFlexibilityProfile {
  return {
    id: `test_${name}_${posture}`,
    organizationId: "org_a",
    canonicalName: name,
    aliases: [],
    posture,
    postureNotes: "test",
    pricingTendency: "unknown",
    exceptionsConsidered: posture === "exception_based",
    typicalCompensatingFactorsRequired: [],
    source: "org_editorial",
    isVerified: false,
    lastReviewedAt: "2026-08-10",
    confidence: "low",
  };
}

describe("posture isolation — posture can never touch eligibility", () => {
  it("identical rule outcomes and scores with posture flipped exception_based ↔ rigid", () => {
    const scenario = sampleScenarios[0]!;
    // The matching engine takes no posture input at all — the strongest
    // possible isolation. Run it twice while different posture directories
    // exist in scope, and diff the entire evaluation output.
    const flippedA = sampleLenders.map((l) => makeProfile(l.name, "exception_based"));
    const flippedB = sampleLenders.map((l) => makeProfile(l.name, "rigid"));

    const runA = analyzeScenario(scenario, catalog, new Date("2026-08-10"));
    void mergePostureProfiles(flippedA);
    const runB = analyzeScenario(scenario, catalog, new Date("2026-08-10"));
    void mergePostureProfiles(flippedB);
    const runC = analyzeScenario(scenario, catalog, new Date("2026-08-10"));

    const strip = (r: ReturnType<typeof analyzeScenario>) =>
      r.evaluations.map((e) => ({ programId: e.programId, status: e.status, score: e.matchScore, rules: e.ruleResults }));
    expect(strip(runB)).toEqual(strip(runA));
    expect(strip(runC)).toEqual(strip(runA));
  });

  it("structural guarantee: matching/rules/analyze modules never import the posture layer", () => {
    const root = join(__dirname, "..", "..", "src", "domain");
    const files: string[] = [];
    for (const dir of ["matching", "rules", "calc"]) {
      for (const f of readdirSync(join(root, dir))) {
        if (f.endsWith(".ts")) files.push(join(root, dir, f));
      }
    }
    files.push(join(root, "analyze.ts"));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("lenderPosture"), `${file} must not import the posture layer`).toBe(false);
      expect(source.includes("compensatingFactors"), `${file} must not import the compensating-factors engine`).toBe(false);
    }
  });
});

describe("org overrides — one org's read never affects another", () => {
  it("Org A reclassifying a lender does not affect Org B's merged view", () => {
    const orgAOverride = makeProfile("Greenbox Loans", "rigid");
    const orgAView = mergePostureProfiles([orgAOverride]);
    const orgBView = mergePostureProfiles([]); // Org B has no overrides

    expect(resolvePostureProfile("Greenbox Loans", orgAView)?.posture).toBe("rigid");
    expect(resolvePostureProfile("Greenbox Loans", orgBView)?.posture).toBe("exception_based");
    // The seed itself is untouched.
    expect(defaultPostureSeed.find((p) => p.canonicalName === "Greenbox Loans")?.posture).toBe("exception_based");
  });

  it("soft-deleted org overrides fall back to the seed", () => {
    const deleted = { ...makeProfile("Greenbox Loans", "rigid"), deletedAt: "2026-08-01T00:00:00Z" };
    const view = mergePostureProfiles([deleted]);
    expect(resolvePostureProfile("Greenbox Loans", view)?.posture).toBe("exception_based");
  });
});

describe("alias + fuzzy resolution", () => {
  const profiles = mergePostureProfiles([]);
  const cases: Array<[string, string]> = [
    ["Greenbox", "Greenbox Loans"],
    ["GBX", "Greenbox Loans"],
    ["HomeXpress", "HomeXpress Mortgage"],
    ["Home Xpress", "HomeXpress Mortgage"],
    ["Cale Mortgage", "Cake Mortgage"], // spec's trade-name normalization
    ["Deep Haven", "Deephaven Mortgage"],
    ["United Wholesale Mortgage", "UWM"],
    ["FNBA", "First National Bank of America"],
  ];
  for (const [query, expected] of cases) {
    it(`"${query}" → ${expected}`, () => {
      expect(resolvePostureProfile(query, profiles)?.canonicalName).toBe(expected);
    });
  }

  it("no profile on record → undefined (silence, not a guess)", () => {
    expect(resolvePostureProfile("Summit Non-QM (Sample)", profiles)).toBeUndefined();
    expect(resolvePostureProfile("Totally Unknown Lender", profiles)).toBeUndefined();
  });
});
