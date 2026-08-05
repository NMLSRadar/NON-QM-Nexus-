import Link from "next/link";
import type { Metadata } from "next";
import { Clock, AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ScenarioTable, type ScenarioRowData } from "@/components/scenario-table";
import { HomeVoiceHero } from "@/components/home-voice-hero";
import { PublicLanding } from "./public-landing";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "NON-QM Nexus — Non-QM Scenario Analysis & Lender Match",
  description:
    "Match Non-QM mortgage scenarios—DSCR, bank statement, ITIN, foreign national—to verified lender guidelines by real eligibility, not pricing.",
  path: "/",
});

export default async function DashboardPage() {
  // External-audit fix (2026-07-28): "/" previously had no public-facing
  // view at all — an anonymous visitor calling getCurrentOrganizationId()
  // below would immediately hit its own redirect("/login"). Every other
  // app route stays gated exactly as before (middleware.ts is untouched);
  // this only adds a real marketing page for the SIGNED-OUT case at "/"
  // itself, before any of the authenticated dashboard logic runs.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <PublicLanding />;

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
    <div className="gold-theme gold-page space-y-8 -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl">
      {/* Hero — Voice Scenario is the flagship feature and dominates the page. */}
      <HomeVoiceHero />

      {/* Recent scenarios — premium black/gold card-row redesign */}
      <section className="gold-scenarios-panel p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <span className="gold-header-icon relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
              <Clock className="h-6 w-6 text-amber-300" />
            </span>
            <div>
              <h2 className="text-[32px] font-bold leading-tight text-white">Recent Scenarios</h2>
              <p className="mt-1 text-sm text-slate-400">
                Your <span className="font-semibold text-amber-300">latest borrower scenarios</span> and their{" "}
                <span className="font-semibold text-amber-300">best current match</span>.
              </p>
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
          <div className="mt-6">
            <ScenarioTable rows={summaries.slice(0, 8)} variant="dark" />
          </div>
        )}
        {scenarios.length > 8 ? (
          <div className="mt-6 text-center">
            <Link
              href="/scenarios"
              className="gold-view-all-button inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold"
            >
              View all {scenarios.length} scenarios <ArrowRight className="gold-view-all-arrow h-4 w-4" />
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
