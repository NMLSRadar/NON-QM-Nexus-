import { Mic, Sparkles, ClipboardList } from "lucide-react";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { Card, IconBadge, LinkButton, PageHeader } from "@/components/ui";
import type { ScenarioRowData } from "@/components/scenario-table";
import { ScenarioBrowser } from "./scenario-browser";

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
    <div className="space-y-6">
      <PageHeader
        title="Scenarios"
        subtitle="Manage and organize your borrower scenarios."
        actions={
          <>
            <LinkButton href="/scenarios/voice" variant="secondary">
              <Mic className="h-4 w-4" /> Voice Scenario
            </LinkButton>
            <LinkButton href="/scenarios/new">+ New Scenario</LinkButton>
          </>
        }
      />

      <Card className="p-6">
        <ScenarioBrowser rows={rows} />
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold text-ink-primary">About Scenarios</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Scenarios help you organize and track different borrower situations — create them with voice or manually,
          then let AI do the guideline comparison.
        </p>
        <div className="mt-5 grid sm:grid-cols-3 gap-4">
          {ABOUT_FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-control bg-gradient-to-br from-brand-50 to-white border border-surface-border p-4 transition-all duration-200 hover:shadow-soft-hover hover:-translate-y-0.5"
            >
              <IconBadge size="sm">{f.icon}</IconBadge>
              <p className="mt-3 font-semibold text-ink-primary">{f.title}</p>
              <p className="mt-1 text-xs text-ink-secondary">{f.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
