import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { SupabaseRepository, rowToScenario } from "@/lib/repository/supabaseRepository";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";
import { analyzeScenario } from "@/domain/analyze";
import { MatchStatus } from "@/domain/types/enums";

export interface AeMonthlyStats {
  views: number;
  phoneClicks: number;
  emailClicks: number;
  lenderScenarioMatches: number;
}

/** True only when every field is genuinely zero — callers (e.g.
 * statsPitchEmail) use this to decide whether real numbers exist to lead
 * with, per the "never fabricate metrics" rule. */
export function isAllZero(stats: AeMonthlyStats): boolean {
  return stats.views === 0 && stats.phoneClicks === 0 && stats.emailClicks === 0 && stats.lenderScenarioMatches === 0;
}

function monthBounds(month: string): { start: string; end: string } {
  // month is "YYYY-MM"
  const parts = month.split("-").map(Number);
  const y = parts[0] ?? new Date().getUTCFullYear();
  const m = parts[1] ?? new Date().getUTCMonth() + 1;
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  return { start, end };
}

const MATCHED_STATUSES: string[] = [MatchStatus.StrongMatch, MatchStatus.Eligible, MatchStatus.Conditional];

/**
 * Monthly rollup — every number here is a real count. Views/clicks come
 * straight from ae_profile_events. lenderScenarioMatches is computed LIVE
 * from real, stored scenarios (never a fabricated or cached number, and
 * never a separate "events log" that could drift from what the matching
 * engine would actually say today): it re-runs the SAME analyzeScenario
 * used everywhere else in the app against every real scenario created
 * platform-wide that month, and counts how many resulted in an eligible/
 * conditional/strong match for the AE's own lender — an AGGREGATE COUNT
 * only, never which broker or scenario (no viewer/submitter identity is
 * read here beyond what's needed to run the calculation).
 */
export async function getAeMonthlyStats(aeProfileId: string, month: string): Promise<AeMonthlyStats> {
  const service = createServiceRoleClient();
  const { start, end } = monthBounds(month);

  const { data: profile } = await service.from("ae_profiles").select("lender_id").eq("id", aeProfileId).maybeSingle();

  const [{ count: views }, { count: phoneClicks }, { count: emailClicks }] = await Promise.all([
    service.from("ae_profile_events").select("id", { count: "exact", head: true }).eq("ae_profile_id", aeProfileId).eq("event", "view").gte("created_at", start).lt("created_at", end),
    service.from("ae_profile_events").select("id", { count: "exact", head: true }).eq("ae_profile_id", aeProfileId).eq("event", "click_phone").gte("created_at", start).lt("created_at", end),
    service.from("ae_profile_events").select("id", { count: "exact", head: true }).eq("ae_profile_id", aeProfileId).eq("event", "click_email").gte("created_at", start).lt("created_at", end),
  ]);

  let lenderScenarioMatches = 0;
  if (profile?.lender_id) {
    const { data: scenarioRows, error } = await service
      .from("scenarios")
      .select("id, organization_id, name, created_by, data, created_at, updated_at")
      .gte("created_at", start)
      .lt("created_at", end);

    if (!error && scenarioRows && scenarioRows.length > 0) {
      const repo = new SupabaseRepository(service);
      const catalog = await repo.getCatalog(PLATFORM_CATALOG_ORGANIZATION_ID);
      for (const row of scenarioRows) {
        try {
          const scenario = rowToScenario(row as never);
          const analysis = analyzeScenario(scenario, catalog);
          const matched = analysis.evaluations.some((e) => e.lenderId === profile.lender_id && MATCHED_STATUSES.includes(e.status));
          if (matched) lenderScenarioMatches++;
        } catch {
          // A malformed/legacy scenario row should never crash the whole
          // stats rollup — skip it and keep counting the rest.
        }
      }
    }
  }

  return { views: views ?? 0, phoneClicks: phoneClicks ?? 0, emailClicks: emailClicks ?? 0, lenderScenarioMatches };
}

export function currentAndLastNMonths(n: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}
