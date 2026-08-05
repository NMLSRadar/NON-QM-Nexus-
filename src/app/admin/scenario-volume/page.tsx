import { requirePlatformAdmin } from "@/lib/admin";
import { getScenarioVolumeStats } from "@/lib/admin/scenarioVolumeStats";
import { fmtUsd } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmtMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function AdminScenarioVolumePage() {
  await requirePlatformAdmin();
  const stats = await getScenarioVolumeStats();
  const maxMonthlyVolume = Math.max(1, ...stats.monthly.map((m) => m.loanVolume));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Scenario Volume</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Total real requested loan amount across every scenario ever saved platform-wide (Voice Scenario and Manual Scenario, every
          organization), computed live from the scenarios table on every page load — never a cached counter or a fabricated figure. A
          scenario only counts toward the volume/average once it has an actual captured loan amount; scenarios still missing that vital
          are counted in &quot;Total scenarios&quot; but excluded from the dollar figures below.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="gold-panel rounded-2xl p-5 sm:col-span-2 lg:col-span-1">
          <p className="break-words text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-3xl">
            {fmtUsd(stats.totalLoanVolume)}
          </p>
          <p className="mt-1 text-sm text-slate-400">Total loan volume matched</p>
        </div>
        <div className="gold-panel rounded-2xl p-5">
          <p className="break-words text-3xl font-semibold leading-tight text-white">{stats.totalScenarios.toLocaleString()}</p>
          <p className="mt-1 text-sm text-slate-400">Scenarios saved (all orgs)</p>
        </div>
        <div className="gold-panel rounded-2xl p-5">
          <p className="break-words text-2xl font-semibold leading-tight text-white sm:text-3xl">{fmtUsd(stats.averageLoanAmount)}</p>
          <p className="mt-1 text-sm text-slate-400">Average loan amount</p>
        </div>
        <div className="gold-panel rounded-2xl p-5">
          <p className="break-words text-2xl font-semibold leading-tight text-white sm:text-3xl">
            {fmtUsd(stats.totalPropertyValueAnalyzed)}
          </p>
          <p className="mt-1 text-sm text-slate-400">Total property value analyzed</p>
        </div>
      </div>

      <div className="gold-panel rounded-2xl p-5 flex flex-wrap gap-x-8 gap-y-1 text-sm text-slate-400">
        <span>
          <span className="text-slate-300">{stats.scenariosWithLoanAmount.toLocaleString()}</span> of{" "}
          <span className="text-slate-300">{stats.totalScenarios.toLocaleString()}</span> scenarios have a captured loan amount
        </span>
        <span>
          First scenario: <span className="text-slate-300">{fmtDate(stats.earliestScenarioAt)}</span>
        </span>
        <span>
          Most recent: <span className="text-slate-300">{fmtDate(stats.latestScenarioAt)}</span>
        </span>
      </div>

      <section className="gold-panel rounded-2xl p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-amber-300/80">Last 12 months</h2>
        <div className="space-y-2">
          {stats.monthly.map((m) => (
            <div key={m.month} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-slate-400">{fmtMonth(m.month)}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-amber-300"
                  style={{ width: `${Math.max(m.loanVolume > 0 ? 3 : 0, (m.loanVolume / maxMonthlyVolume) * 100)}%` }}
                />
              </div>
              <span className="w-28 shrink-0 text-right font-medium text-white">{fmtUsd(m.loanVolume)}</span>
              <span className="w-24 shrink-0 text-right text-slate-500">
                {m.scenarioCount} scenario{m.scenarioCount === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
