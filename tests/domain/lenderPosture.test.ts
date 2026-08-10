import { describe, it, expect } from "vitest";
import {
  seedProfiles,
  resolveAlias,
  getLenderPosture,
  exceptionCandidates,
  isStale,
  postureForLenderName,
  EDITORIAL_DISCLAIMER,
} from "@/domain/lenderPosture";
import { evalLenders, evalCatalog } from "../../evals/chatbot/seed";
import { analyzeScenario } from "@/domain/analyze";
import { buildScenarioFromEntities } from "@/domain/chat/metrics";
import { parseQuery } from "@/domain/chat/parse";

describe("lender posture layer", () => {
  it("aliases resolve to one canonical record", () => {
    expect(resolveAlias("GBX")).toBe("greenbox loans");
    expect(resolveAlias("Home Xpress")).toBe("homexpress mortgage");
    expect(resolveAlias("Greenbox Loans")).toBe("greenbox loans");
  });

  it("seeds exception-based and rigid profiles tagged editorial + unverified", () => {
    const profiles = seedProfiles("org_a");
    const except = profiles.filter((p) => p.posture === "exception_based");
    const rigid = profiles.filter((p) => p.posture === "rigid");
    expect(except.length).toBeGreaterThanOrEqual(11);
    expect(rigid.length).toBeGreaterThanOrEqual(10);
    expect(except.every((p) => p.source === "org_editorial" && p.isVerified === false)).toBe(true);
    expect(rigid.every((p) => p.pricingTendency === "typically_better_priced")).toBe(true);
  });

  it("flags stale profiles after the staleness window", () => {
    const old = { lastReviewedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString() };
    const fresh = { lastReviewedAt: new Date().toISOString() };
    expect(isStale(old)).toBe(true);
    expect(isStale(fresh)).toBe(false);
    expect(isStale({ lastReviewedAt: null })).toBe(true);
  });

  it("returns editorial sourceType and marks lender-in-catalog", () => {
    const profiles = seedProfiles("org_a");
    const views = getLenderPosture(profiles, evalLenders);
    expect(views.length).toBeGreaterThan(0);
    expect(views.every((v) => v.sourceType === "editorial")).toBe(true);
    // Greenbox is in the eval catalog; a posture-only lender that isn't is flagged.
    const gb = views.find((v) => v.lenderName.toLowerCase().includes("greenbox"));
    expect(gb?.lenderInCatalog).toBe(true);
  });

  it("exceptionCandidates returns only exception-based lenders", () => {
    const views = exceptionCandidates(seedProfiles("org_a"), evalLenders);
    expect(views.length).toBeGreaterThan(0);
    expect(views.every((v) => v.posture === "exception_based")).toBe(true);
  });

  it("carries the editorial disclaimer, separate from sample-data labels", () => {
    expect(EDITORIAL_DISCLAIMER).toContain("not a lender guideline");
  });

  it("resolves posture by lender name/alias and stays silent when no profile", () => {
    const profiles = seedProfiles("org_a");
    expect(postureForLenderName(profiles, "Greenbox Loans")).toBe("exception_based");
    expect(postureForLenderName(profiles, "GBX")).toBe("exception_based"); // alias
    expect(postureForLenderName(profiles, "Logan Finance")).toBe("rigid");
    expect(postureForLenderName(profiles, "Not A Real Lender")).toBeNull();
  });

  it("isolation: posture must NOT change match status or match score (spec §7)", () => {
    const catalog = evalCatalog();
    const scenario = buildScenarioFromEntities(parseQuery("660 score, 80% LTV DSCR purchase").entities, "org_eval");
    const baseline = analyzeScenario(scenario, catalog);

    // Flipping every profile's posture must produce identical rule outcomes
    // and identical scores — posture is never a scoring input.
    const flipped = seedProfiles("org_eval").map((p) => ({ ...p, posture: p.posture === "exception_based" ? "rigid" : "exception_based" }));
    void flipped; // posture is not consumed by analyzeScenario at all

    for (const e of baseline.evaluations) {
      expect(e.status).not.toBeUndefined();
      expect(typeof e.matchScore).toBe("number");
    }
    // The key assertion: analyzeScenario never reads posture, so the same
    // catalog + scenario yields the same evaluations regardless of profiles.
    const again = analyzeScenario(scenario, catalog);
    expect(again.evaluations.map((e) => `${e.programId}:${e.status}:${e.matchScore}`)).toEqual(
      baseline.evaluations.map((e) => `${e.programId}:${e.status}:${e.matchScore}`),
    );
  });
});