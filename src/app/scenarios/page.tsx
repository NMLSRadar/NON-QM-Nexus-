import { Mic, Sparkles, ClipboardList, Folder } from "lucide-react";
import Link from "next/link";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import type { ScenarioRowData } from "@/components/scenario-table";
import { ScenarioBrowser } from "./scenario-browser";
import { InviteMismatchBanner } from "@/components/invite-mismatch-banner";

export const dynamic = "force-dynamic";

const ABOUT_FEATURES = [
  {
    icon: <Mic className="h-5 w-5" />,
    title: "Voice Input",
    description: "Describe a borrower out loud — no forms to fill in.",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "AI Analysis",
    description: "Every scenario is scored against every eligible lender program automatically.",
  },
  {
    icon: <ClipboardList className="h-5 w-5" />,
    title: "Scenario Tracking",
    description: "Every scenario is saved so you can revisit, duplicate, or re-run it later.",
  },
];

export default async function ScenariosPage() {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [scenarios, catalog] = await Promise.all([repo.listScenarios(org), repo.getCatalog(org)]);

  const rows: ScenarioRowData[] = scenarios.map((s) => {
    const analysis = analyzeScenario(s, catalog);
    return { scenario: s, best: analysis.evaluations[0] };
  });

  return (
    <div className="nexus-workspace nexus-scenarios-page gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <InviteMismatchBanner />
      <div className="gold-scenarios-panel relative overflow-hidden p-6 sm:p-8">
        <div className="gold-ambient" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="gold-header-icon relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
              <Folder className="h-6 w-6 text-amber-300" />
            </span>
            <div>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight text-white">Scenarios</h1>
              <p className="mt-1 text-sm sm:text-base text-slate-400">
                Manage and organize your <span className="font-semibold text-amber-300">borrower scenarios</span>.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/scenarios/voice"
              className="gold-outline-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
            >
              <Mic className="h-4 w-4" /> Voice Scenario
            </Link>
            <Link
              href="/scenarios/new"
              className="gold-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
            >
              + New Scenario
            </Link>
          </div>
        </div>
      </div>

      <div className="gold-scenarios-panel p-4 sm:p-6">
        <ScenarioBrowser rows={rows} variant="dark" />
      </div>

      <div className="gold-panel rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white">About Scenarios</h2>
        <p className="mt-1 text-sm text-slate-400">
          Scenarios help you organize and track different borrower situations — create them with voice or manually,
          then let AI do the guideline comparison.
        </p>
        <div className="mt-5 grid sm:grid-cols-3 gap-4">
          {ABOUT_FEATURES.map((f) => (
            <div key={f.title} className="gold-card gold-fade-up rounded-2xl p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
                {f.icon}
              </span>
              <p className="mt-3 font-semibold text-white">{f.title}</p>
              <p className="mt-1 text-xs text-slate-400">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
