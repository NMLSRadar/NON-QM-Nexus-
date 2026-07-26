import Link from "next/link";
import { Clock, AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { ScenarioTable, type ScenarioRowData } from "@/components/scenario-table";
import { HomeVoiceHero } from "@/components/home-voice-hero";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [scenarios, catalog] = await Promise.all([repo.listScenarios(org), repo.getCatalog(org)]);

  const summaries: ScenarioRowData[] = scenarios.map((s) => {
    const analysis = analyzeScenario(s, catalog);
    return { scenario: s, best: analysis.evaluations[0] };
  });

  // Preserved from the original dashboard: the most common reasons
  // scenarios fail across the whole book, so a broker can see recurring
  // friction points at a glance.
  const failCounts = new Map<string, { name: string; count: number }>();
  for (const s of scenarios) {
    const analysis = analyzeScenario(s, catalog);
    for (const e of analysis.evaluations) {
      for (const f of e.failedRules) {
        const cur = failCounts.get(f.ruleName) ?? { name: f.ruleName, count: 0 };
        cur.count += 1;
        failCounts.set(f.ruleName, cur);
      }
    }
  }
  const topFails = [...failCounts.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  return (
    <div className="gold-theme space-y-8 -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl">
      {/* Hero — Voice Scenario is the flagship feature and dominates the page. */}
      <HomeVoiceHero />

      {/* Recent scenarios */}
      <section className="gold-panel rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Recent Scenarios</h2>
              <p className="text-sm text-slate-400">Your latest borrower scenarios and their best current match.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/scenarios" className="text-sm font-medium text-slate-300 hover:text-amber-300 transition-colors">
              View all
            </Link>
            <Link
              href="/scenarios/new"
              className="gold-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap"
            >
              <Plus className="h-4 w-4" /> New Scenario
            </Link>
          </div>
        </div>

        {scenarios.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-amber-500/15 bg-black/30 py-14 text-center">
            <div className="relative">
              <span className="gold-pulse-ring" style={{ inset: "-8px" }} />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
                📄
              </span>
            </div>
            <p className="mt-2 text-base font-semibold text-white">No scenarios yet</p>
            <p className="max-w-sm text-sm text-slate-400">Start a Voice Scenario or create one manually to see it here.</p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-white p-3 sm:p-4 shadow-xl">
            <ScenarioTable rows={summaries.slice(0, 8)} />
          </div>
        )}
        {scenarios.length > 8 ? (
          <div className="mt-4 text-center">
            <Link href="/scenarios" className="inline-flex items-center gap-1 text-sm font-medium text-amber-300 hover:underline">
              View all {scenarios.length} scenarios <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </section>

      {topFails.length > 0 ? (
        <section className="gold-panel rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Most Common Friction Points</h2>
              <p className="text-sm text-slate-400">The guideline rules causing the most declines across your current book.</p>
            </div>
          </div>
          <ul className="mt-4 grid sm:grid-cols-2 gap-3">
            {topFails.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/15 bg-black/30 px-4 py-2.5 text-sm"
              >
                <span className="text-slate-200">{f.name}</span>
                <span className="rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold tabular-nums px-2 py-0.5">{f.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
