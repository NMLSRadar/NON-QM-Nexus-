import Link from "next/link";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/store";
import { Card, StatusBadge } from "@/components/ui";
import type { MatchStatus } from "@/domain/types/enums";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repo = getRepository();
  const org = getCurrentOrganizationId();
  const [scenarios, catalog] = await Promise.all([repo.listScenarios(org), repo.getCatalog(org)]);

  // Summarize each scenario's best status for the dashboard cards.
  const summaries = scenarios.map((s) => {
    const analysis = analyzeScenario(s, catalog);
    const best = analysis.evaluations[0];
    const counts = analysis.evaluations.reduce<Record<string, number>>((acc, e) => {
      acc[e.status] = (acc[e.status] ?? 0) + 1;
      return acc;
    }, {});
    return { scenario: s, best, counts, failedRules: analysis.evaluations.flatMap((e) => e.failedRules) };
  });

  const strongCount = summaries.filter((s) => s.best?.status === "strong_match" || s.best?.status === "eligible").length;
  const manualCount = summaries.filter((s) => s.best?.status === "manual_review").length;
  const ineligibleCount = summaries.filter((s) => s.best?.status === "ineligible").length;

  // Most common failed rules across all scenarios.
  const failCounts = new Map<string, { name: string; count: number }>();
  for (const s of summaries) {
    for (const f of s.failedRules) {
      const cur = failCounts.get(f.ruleName) ?? { name: f.ruleName, count: 0 };
      cur.count += 1;
      failCounts.set(f.ruleName, cur);
    }
  }
  const topFails = [...failCounts.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          href="/scenarios/new"
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          + New Scenario
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><p className="text-3xl font-semibold">{scenarios.length}</p><p className="text-sm text-slate-500">Scenarios</p></Card>
        <Card><p className="text-3xl font-semibold text-emerald-700">{strongCount}</p><p className="text-sm text-slate-500">With eligible matches</p></Card>
        <Card><p className="text-3xl font-semibold text-sky-700">{manualCount}</p><p className="text-sm text-slate-500">Best result: manual review</p></Card>
        <Card><p className="text-3xl font-semibold text-rose-700">{ineligibleCount}</p><p className="text-sm text-slate-500">No current eligibility</p></Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Recent scenarios" className="md:col-span-2">
          <ul className="divide-y divide-slate-100">
            {summaries.slice(0, 8).map(({ scenario, best }) => (
              <li key={scenario.id} className="py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <Link href={`/scenarios/${scenario.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                    {scenario.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {scenario.borrowerReference} · {scenario.incomeDocType ?? "—"} · {scenario.state ?? "—"}
                  </p>
                </div>
                {best ? <StatusBadge status={best.status as MatchStatus} /> : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Most common failed rules">
          {topFails.length === 0 ? (
            <p className="text-sm text-slate-500">No failed rules across current scenarios.</p>
          ) : (
            <ul className="space-y-2">
              {topFails.map((f) => (
                <li key={f.name} className="text-sm flex justify-between gap-2">
                  <span className="text-slate-700">{f.name}</span>
                  <span className="text-slate-400 tabular-nums">{f.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
