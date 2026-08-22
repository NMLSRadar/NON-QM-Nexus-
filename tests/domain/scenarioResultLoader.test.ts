import { describe, expect, it, vi } from "vitest";
import { analyzeScenario } from "@/domain/analyze";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import { extractFromTranscript } from "@/domain/voice/extract";
import { loadScenarioResults } from "@/app/scenarios/[id]/result-loader";
import type { Repository } from "@/lib/store";
import type { Scenario } from "@/domain/types/scenario";

function reportedScenario(): Scenario {
  const extraction = extractFromTranscript(
    "Purchase a one-million-dollar single-family primary residence at 80 percent LTV. 760 credit score, business bank statements, U.S. citizen.",
  );
  const input = buildScenarioInput(extraction, assess(extraction));
  return {
    ...input,
    id: "reported-scenario",
    organizationId: "org_demo",
    createdByUserId: "test-user",
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}

function repository(overrides: Partial<Repository> = {}): Repository {
  const scenario = reportedScenario();
  return {
    getCatalog: vi.fn().mockResolvedValue({ lenders: sampleLenders, programs: samplePrograms, rules: sampleRules }),
    getCatalogForMatching: vi.fn().mockResolvedValue({ lenders: sampleLenders, programs: samplePrograms, rules: sampleRules }),
    listScenarios: vi.fn().mockResolvedValue([scenario]),
    getScenario: vi.fn().mockResolvedValue(scenario),
    saveScenario: vi.fn().mockResolvedValue(scenario),
    listLenders: vi.fn().mockResolvedValue(sampleLenders),
    listAllLenders: vi.fn().mockResolvedValue(sampleLenders),
    listPrograms: vi.fn().mockResolvedValue(samplePrograms),
    listRules: vi.fn().mockResolvedValue(sampleRules),
    listPendingReviewLenderPrograms: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const adminAccess = async () => ({ tierLevel: 3, isPlatformAdmin: true, isTrial: false, trialExpiresAt: null });

describe("resilient scenario result loading", () => {
  it("still returns recommended lenders when the full catalog and supplemental rules query fail", async () => {
    const repo = repository({
      getCatalogForMatching: vi.fn().mockRejectedValue(new Error("full catalog query failed")),
      listRules: vi.fn().mockRejectedValue(new Error("rules query failed")),
    });

    const result = await loadScenarioResults(repo, "org_demo", reportedScenario(), { getAccess: adminAccess });

    expect(result.degraded).toBe(true);
    expect(result.analysis.evaluations.length).toBeGreaterThan(0);
    expect(repo.listLenders).toHaveBeenCalledWith("org_demo", 3);
    expect(repo.listPrograms).toHaveBeenCalledWith("org_demo", 3);
  });

  it("retries core program matching without malformed supplemental rules", async () => {
    const analyze = vi.fn((scenario: Scenario, catalog: Parameters<typeof analyzeScenario>[1]) => {
      if (catalog.rules.length > 0) throw new Error("malformed production rule");
      return analyzeScenario(scenario, catalog);
    });

    const result = await loadScenarioResults(repository(), "org_demo", reportedScenario(), { getAccess: adminAccess, analyze });

    expect(result.degraded).toBe(true);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(result.analysis.evaluations.length).toBeGreaterThan(0);
  });

  it("does not hide recommendations when access enrichment fails", async () => {
    const result = await loadScenarioResults(repository(), "org_demo", reportedScenario(), {
      getAccess: vi.fn().mockRejectedValue(new Error("membership lookup failed")),
    });

    expect(result.access.tierLevel).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.analysis.evaluations.length).toBeGreaterThan(0);
  });

  it("quarantines a throwing program instead of suppressing all other lender recommendations", async () => {
    const badProgramId = samplePrograms[0]?.id;
    const analyze = vi.fn((scenario: Scenario, catalog: Parameters<typeof analyzeScenario>[1]) => {
      if (catalog.rules.length > 0 || catalog.programs.length > 1 || catalog.programs[0]?.id === badProgramId) {
        throw new Error("malformed program");
      }
      return analyzeScenario(scenario, catalog);
    });

    const result = await loadScenarioResults(repository(), "org_demo", reportedScenario(), { getAccess: adminAccess, analyze });

    expect(result.degraded).toBe(true);
    expect(result.analysis.evaluations.length).toBeGreaterThan(0);
    expect(result.analysis.evaluations.some((evaluation) => evaluation.programId === badProgramId)).toBe(false);
  });
});