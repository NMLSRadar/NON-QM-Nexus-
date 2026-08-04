// Platform-wide scenario dollar-volume tracker (admin marketing metric).
//
// "Dollar volume" here means the sum of Scenario.requestedLoanAmount across
// every real, non-deleted scenario ever saved platform-wide (any
// organization) — the actual loan amount the matching engine used to
// evaluate lender eligibility for that scenario (see
// src/domain/matching/baseChecks.ts / score.ts, which both key off this
// same field). This is a REAL, re-derivable number computed live from the
// scenarios table every time the page loads — never a cached counter, a
// sampled estimate, or a number nudged for a better-looking marketing
// figure. If a scenario never had a loan amount captured (requestedLoanAmount
// is undefined), it is excluded from the volume sum AND from the count used
// to compute the average, so the average is never diluted by scenarios that
// contributed nothing to the total (never-fabricate rule).
//
// Cross-tenant by design: scenarios_select RLS scopes a normal session to
// only the caller's own organization(s), but this admin metric is
// deliberately platform-wide (every org's scenarios), so it must run through
// the service-role client — gated by requirePlatformAdmin() at the page
// level, never exposed to a non-admin caller.
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export interface ScenarioMonthlyVolume {
  month: string; // "YYYY-MM"
  scenarioCount: number;
  loanVolume: number;
}

export interface ScenarioVolumeStats {
  /** Every non-deleted scenario row platform-wide, regardless of whether it
   * has a captured loan amount. */
  totalScenarios: number;
  /** Of totalScenarios, how many have a real, captured requestedLoanAmount
   * (> 0) — the denominator for averageLoanAmount and the only scenarios
   * that contribute to totalLoanVolume. */
  scenariosWithLoanAmount: number;
  /** Sum of requestedLoanAmount across every scenario that has one. This is
   * the headline "dollar volume run through the platform" marketing figure. */
  totalLoanVolume: number;
  /** totalLoanVolume / scenariosWithLoanAmount, or 0 when none exist. */
  averageLoanAmount: number;
  /** Sum of estimatedValue (subject property value) across scenarios that
   * have one — a secondary supporting figure, kept clearly separate from
   * loan volume since it measures property value analyzed, not loan volume
   * matched. */
  totalPropertyValueAnalyzed: number;
  /** Oldest and newest scenario creation timestamps platform-wide, so the
   * page can honestly caption "since <date>" instead of implying an
   * arbitrary start. Null when there are no scenarios at all. */
  earliestScenarioAt: string | null;
  latestScenarioAt: string | null;
  /** Last 12 calendar months (oldest first), each with a real count + real
   * volume for that month — for a simple trend table. Always exactly 12
   * entries so the page can render a fixed-width table/sparkline. */
  monthly: ScenarioMonthlyVolume[];
}

interface ScenarioVolumeRow {
  created_at: string;
  data: { requestedLoanAmount?: number; estimatedValue?: number } | null;
}

const PAGE_SIZE = 1000;

async function fetchAllScenarioRows(): Promise<ScenarioVolumeRow[]> {
  const service = createServiceRoleClient();
  const rows: ScenarioVolumeRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await service
      .from("scenarios")
      .select("created_at, data")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load scenarios for volume stats: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as ScenarioVolumeRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last 12 calendar months ending this month, oldest first, e.g.
 * ["2025-09", ..., "2026-08"]. Mirrors the pattern in src/lib/ae/stats.ts's
 * currentAndLastNMonths, kept local since the sort order needed here
 * (oldest-first, for a left-to-right trend table) is the reverse of that
 * helper's newest-first output. */
function last12MonthKeys(): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export async function getScenarioVolumeStats(): Promise<ScenarioVolumeStats> {
  const rows = await fetchAllScenarioRows();

  let totalLoanVolume = 0;
  let scenariosWithLoanAmount = 0;
  let totalPropertyValueAnalyzed = 0;
  const monthlyMap = new Map<string, { scenarioCount: number; loanVolume: number }>();
  for (const key of last12MonthKeys()) monthlyMap.set(key, { scenarioCount: 0, loanVolume: 0 });

  for (const row of rows) {
    const loanAmount = row.data?.requestedLoanAmount;
    const propertyValue = row.data?.estimatedValue;
    if (typeof loanAmount === "number" && loanAmount > 0) {
      totalLoanVolume += loanAmount;
      scenariosWithLoanAmount += 1;
      const key = monthKey(row.created_at);
      const bucket = monthlyMap.get(key);
      if (bucket) {
        bucket.scenarioCount += 1;
        bucket.loanVolume += loanAmount;
      }
    }
    if (typeof propertyValue === "number" && propertyValue > 0) {
      totalPropertyValueAnalyzed += propertyValue;
    }
  }

  const monthly: ScenarioMonthlyVolume[] = last12MonthKeys().map((month) => {
    const bucket = monthlyMap.get(month) ?? { scenarioCount: 0, loanVolume: 0 };
    return { month, scenarioCount: bucket.scenarioCount, loanVolume: bucket.loanVolume };
  });

  return {
    totalScenarios: rows.length,
    scenariosWithLoanAmount,
    totalLoanVolume,
    averageLoanAmount: scenariosWithLoanAmount > 0 ? totalLoanVolume / scenariosWithLoanAmount : 0,
    totalPropertyValueAnalyzed,
    earliestScenarioAt: rows.length > 0 ? (rows[0]?.created_at ?? null) : null,
    latestScenarioAt: rows.length > 0 ? (rows[rows.length - 1]?.created_at ?? null) : null,
    monthly,
  };
}
