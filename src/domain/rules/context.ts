import type { Scenario } from "../types/scenario";
import type { CalculationSummary } from "../types/results";

/**
 * The evaluation context is the flat/nested object rules read from via dot-paths.
 * It combines raw scenario inputs with derived calculation outputs under `calc`.
 * Rules must only reference fields that appear here; the rules test harness
 * verifies referenced fields exist.
 */
export interface EvaluationContext {
  [key: string]: unknown;
  calc: {
    ltv: number | null;
    cltv: number | null;
    dti: number | null;
    dscr: number | null;
    qualifyingMonthlyIncome: number | null;
    reservesMonths: number | null;
  };
}

export function buildContext(scenario: Scenario, calc: CalculationSummary): EvaluationContext {
  return {
    ...scenario,
    calc: {
      ltv: calc.ltv?.value ?? null,
      cltv: calc.cltv?.value ?? null,
      dti: calc.dti?.value ?? null,
      dscr: calc.dscr?.value ?? null,
      qualifyingMonthlyIncome: calc.qualifyingMonthlyIncome?.value ?? null,
      reservesMonths: calc.results.find((r) => r.key === "available_reserves_months")?.value ?? null,
    },
  };
}

/** Resolve a dot-path (e.g. "calc.ltv" or "creditEvents.foreclosureMonthsSince"). */
export function resolvePath(ctx: EvaluationContext, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = ctx;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
