import Link from "next/link";
import { Mic, MessageSquareText, Sparkles, Zap, ArrowRight, AlertTriangle } from "lucide-react";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { Card, IconBadge, LinkButton, SectionHeading } from "@/components/ui";
import { ScenarioTable, type ScenarioRowData } from "@/components/scenario-table";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: <MessageSquareText className="h-5 w-5" />,
    title: "Natural Conversation",
    description: "Describe a borrower the way you'd explain it to a colleague — no forms, no dropdowns.",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "AI Guideline Matching",
    description: "We map what you say onto real lender guidelines and flag exactly what's missing.",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Instant Scenario Analysis",
    description: "LTV, DTI, reserves, and a ranked lender comparison — generated in seconds, not minutes.",
  },
];

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
    <div className="space-y-8">
      {/* Hero — Voice Scenario is the flagship feature and dominates the page. */}
      <section className="relative overflow-hidden rounded-card border border-surface-border bg-gradient-to-br from-brand-50 via-white to-white shadow-soft-lg p-6 sm:p-10">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-8">
          <div className="flex items-start gap-5">
            <IconBadge size="lg" className="shadow-soft">
              <Mic className="h-7 w-7" />
            </IconBadge>
            <div>
              <span className="inline-block rounded-full bg-brand-100 text-brand-800 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1">
                AI-Powered
              </span>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-ink-primary">Voice Scenario</h1>
              <p className="mt-2 max-w-xl text-sm sm:text-base text-ink-secondary">
                Describe your borrower naturally and let AI analyze hundreds of lender guidelines in seconds.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:ml-auto items-stretch sm:items-center gap-3 shrink-0">
            <LinkButton href="/scenarios/voice" size="lg" className="whitespace-nowrap">
              <Mic className="h-5 w-5" /> Start Voice Scenario
            </LinkButton>
            <LinkButton href="/scenarios/new" variant="secondary" size="lg" className="whitespace-nowrap">
              Create Manual Scenario
            </LinkButton>
          </div>
        </div>

        <div className="relative mt-8 grid sm:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-control bg-white/70 backdrop-blur border border-surface-border p-4 transition-all duration-200 hover:shadow-soft-hover hover:-translate-y-0.5"
            >
              <IconBadge size="sm">{f.icon}</IconBadge>
              <p className="mt-3 font-semibold text-ink-primary">{f.title}</p>
              <p className="mt-1 text-xs text-ink-secondary">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent scenarios */}
      <Card className="p-6">
        <SectionHeading
          title="Recent Scenarios"
          description="Your latest borrower scenarios and their best current match."
          actions={
            <>
              <Link href="/scenarios" className="text-sm font-medium text-ink-secondary hover:text-brand-700 transition-colors">
                View all
              </Link>
              <LinkButton href="/scenarios/new" size="sm">
                + New Scenario
              </LinkButton>
            </>
          }
        />
        <div className="mt-5">
          <ScenarioTable rows={summaries.slice(0, 8)} />
        </div>
        {scenarios.length > 8 ? (
          <div className="mt-4 text-center">
            <Link href="/scenarios" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              View all {scenarios.length} scenarios <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </Card>

      {topFails.length > 0 ? (
        <Card className="p-6">
          <SectionHeading
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Most Common Friction Points"
            description="The guideline rules causing the most declines across your current book."
          />
          <ul className="mt-4 grid sm:grid-cols-2 gap-3">
            {topFails.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between gap-2 rounded-control border border-surface-border px-4 py-2.5 text-sm"
              >
                <span className="text-ink-primary">{f.name}</span>
                <span className="rounded-full bg-brand-50 text-brand-700 text-xs font-semibold tabular-nums px-2 py-0.5">{f.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
