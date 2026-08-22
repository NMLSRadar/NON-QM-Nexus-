import * as Sentry from "@sentry/nextjs";
import { analyzeScenario, type ProgramCatalog } from "@/domain/analyze";
import type { AnalysisResult } from "@/domain/types/results";
import type { Scenario } from "@/domain/types/scenario";
import { MAX_TIER_LEVEL } from "@/lib/platformCatalog";
import { getLenderAccessInfo, type LenderAccessInfo } from "@/lib/session";
import type { Repository } from "@/lib/store";
import { rankEvaluations } from "@/domain/matching/evaluateProgram";

const LOCKED_ACCESS: LenderAccessInfo = {
  tierLevel: 0,
  isPlatformAdmin: false,
  isTrial: false,
  trialExpiresAt: null,
};

interface ResultLoaderDependencies {
  getAccess?: () => Promise<LenderAccessInfo>;
  analyze?: typeof analyzeScenario;
}

export interface LoadedScenarioResults {
  access: LenderAccessInfo;
  analysis: AnalysisResult;
  degraded: boolean;
}

/**
 * Loads the core lender recommendations in failure-isolated stages.
 * Rules and membership enrichment may fail independently in production;
 * neither is allowed to erase the lender/program catalog or prevent the
 * saved scenario from receiving core program recommendations.
 */
export async function loadScenarioResults(
  repo: Repository,
  organizationId: string,
  scenario: Scenario,
  dependencies: ResultLoaderDependencies = {},
): Promise<LoadedScenarioResults> {
  const getAccess = dependencies.getAccess ?? getLenderAccessInfo;
  const analyze = dependencies.analyze ?? analyzeScenario;
  let degraded = false;

  let access: LenderAccessInfo;
  try {
    access = await getAccess();
  } catch (error) {
    degraded = true;
    access = LOCKED_ACCESS;
    console.error("Scenario result access lookup failed:", error);
    Sentry.captureException(error, { tags: { surface: "scenario-results-access" } });
  }

  let catalog: ProgramCatalog;
  try {
    catalog = access.tierLevel === 0 ? await repo.getCatalog(organizationId) : await repo.getCatalogForMatching(organizationId);
  } catch (error) {
    degraded = true;
    console.error("Full scenario match catalog failed; loading core catalog:", error);
    Sentry.captureException(error, { tags: { surface: "scenario-results-catalog" } });

    const [lenders, programs, rules] = await Promise.allSettled([
      repo.listLenders(organizationId, MAX_TIER_LEVEL),
      repo.listPrograms(organizationId, MAX_TIER_LEVEL),
      repo.listRules(organizationId, MAX_TIER_LEVEL),
    ]);
    if (lenders.status === "rejected" || programs.status === "rejected") {
      throw new AggregateError(
        [lenders.status === "rejected" ? lenders.reason : null, programs.status === "rejected" ? programs.reason : null].filter(Boolean),
        "Core lender/program catalog failed to load",
      );
    }
    catalog = {
      lenders: lenders.value,
      programs: programs.value,
      rules: rules.status === "fulfilled" ? rules.value : [],
    };
    if (rules.status === "rejected") {
      Sentry.captureException(rules.reason, { tags: { surface: "scenario-results-rules" } });
    }
  }

  let analysis: AnalysisResult;
  try {
    analysis = analyze(scenario, catalog);
  } catch (error) {
    // Program configs contain the core eligibility matrices. If one dynamic
    // rule row is malformed, retry without supplemental rules rather than
    // withholding every recommended lender from the user.
    degraded = true;
    console.error("Scenario analysis with supplemental rules failed; retrying core program analysis:", error);
    Sentry.captureException(error, { tags: { surface: "scenario-results-analysis-rules" } });
    try {
      analysis = analyze(scenario, { ...catalog, rules: [] });
    } catch (coreError) {
      // Last isolation layer: one malformed program config must not suppress
      // every other lender. Analyze programs independently, quarantine only
      // the rows that throw, and merge the successful recommendations.
      console.error("Combined core program analysis failed; isolating programs:", coreError);
      Sentry.captureException(coreError, { tags: { surface: "scenario-results-analysis-programs" } });
      const baseline = analyze(scenario, { lenders: [], programs: [], rules: [] });
      const evaluations = [] as AnalysisResult["evaluations"];
      const restructuring = [] as AnalysisResult["restructuring"];
      const lenderById = new Map(catalog.lenders.map((lender) => [lender.id, lender]));

      for (const program of catalog.programs) {
        const lender = lenderById.get(program.lenderId);
        if (!lender) continue;
        try {
          const isolated = analyze(scenario, { lenders: [lender], programs: [program], rules: [] });
          evaluations.push(...isolated.evaluations);
          restructuring.push(...isolated.restructuring);
        } catch (programError) {
          // Catalog metadata only; never log borrower/scenario data here.
          console.error("Quarantined program during scenario matching", { programId: program.id, lenderId: program.lenderId });
          Sentry.captureException(programError, { tags: { surface: "scenario-results-analysis-program", programId: program.id } });
        }
      }

      analysis = {
        ...baseline,
        evaluations: rankEvaluations(evaluations),
        restructuring,
      };
    }
  }

  return { access, analysis, degraded };
}