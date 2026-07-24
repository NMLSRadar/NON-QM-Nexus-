import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileEdit, RotateCw, Layers, ClipboardList, Clock } from "lucide-react";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { Card, MetricTile, StatusBadge, SectionHeading, LinkButton, Pill, fmtNum, fmtPct, fmtUsd } from "@/components/ui";
import type { CalcResult } from "@/domain/types/results";
import type { MatchStatus } from "@/domain/types/enums";
import { BestLenderMatches } from "./best-lender-matches";
import { DocumentNeeds } from "./document-needs";
import { ScenarioActivity } from "./scenario-activity";

export const dynamic = "force-dynamic";

function CalcTrace({ calc }: { calc: CalcResult }) {
  return (
    <details className="text-xs text-ink-secondary">
      <summary className="cursor-pointer hover:text-brand-700 transition-colors">How was this calculated?</summary>
      <div className="mt-1 space-y-1 pl-3 border-l-2 border-surface-border">
        <p className="font-mono">{calc.formula}</p>
        <ul>
          {Object.entries(calc.inputs).map(([k, v]) => (
            <li key={k}>
              {k}: <span className="font-mono">{String(v ?? "—")}</span>
            </li>
          ))}
        </ul>
        {calc.notes?.map((n) => (
          <p key={n} className="text-amber-700">⚠ {n}</p>
        ))}
      </div>
    </details>
  );
}

function fmtCalc(calc: CalcResult): string {
  if (calc.value == null) return "—";
  switch (calc.unit) {
    case "percent":
      return fmtPct(calc.value);
    case "usd":
      return fmtUsd(calc.value);
    case "months":
      return `${calc.value} mo`;
    default:
      return fmtNum(calc.value);
  }
}

export default async function ScenarioResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const scenario = await repo.getScenario(org, id);
  if (!scenario) notFound();
  const catalog = await repo.getCatalog(org);
  const analysis = analyzeScenario(scenario, catalog);
  const best = analysis.evaluations[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link href="/scenarios" className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-brand-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> All scenarios
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-primary">{scenario.name}</h1>
              {best ? <StatusBadge status={best.status as MatchStatus} /> : null}
            </div>
            <p className="mt-1 text-sm text-ink-secondary">
              {scenario.loanPurpose?.replace(/_/g, " ") ?? "—"} · {scenario.propertyType?.replace(/_/g, " ") ?? "—"} ·{" "}
              {scenario.occupancy?.replace(/_/g, " ") ?? "—"} · {scenario.state ?? "—"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <LinkButton href="/scenarios/new" variant="secondary" size="sm">
              <FileEdit className="h-4 w-4" /> New Scenario
            </LinkButton>
            <LinkButton href="/scenarios/voice" size="sm">
              <RotateCw className="h-4 w-4" /> Run Again
            </LinkButton>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <SectionHeading icon={<Layers className="h-5 w-5" />} title="Scenario Snapshot" />
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricTile label="Purchase price" value={fmtUsd(scenario.purchasePrice)} />
              <MetricTile label="Estimated value" value={fmtUsd(scenario.estimatedValue)} />
              <MetricTile label="Loan amount" value={fmtUsd(scenario.requestedLoanAmount)} />
              <MetricTile label="FICO" value={scenario.fico ?? "—"} />
              <MetricTile label="Citizenship" value={scenario.citizenship?.replace(/_/g, " ") ?? "—"} />
              <MetricTile label="Income doc" value={scenario.incomeDocType ?? "—"} />
              <MetricTile label="Housing payment" value={fmtUsd(scenario.monthlyHousingPayment)} />
              <MetricTile label="Other liabilities" value={fmtUsd(scenario.monthlyLiabilities)} />
              <MetricTile label="Liquid assets" value={fmtUsd(scenario.liquidAssets)} />
              <MetricTile label="Vesting" value={scenario.vesting ?? "—"} />
              <MetricTile
                label="First-time homebuyer"
                value={scenario.firstTimeHomebuyer === undefined ? "—" : scenario.firstTimeHomebuyer ? "Yes" : "No"}
              />
              <MetricTile
                label="Investor experience"
                value={
                  scenario.investorExperience
                    ? scenario.investorExperience.replace(/_/g, " ")
                    : scenario.firstTimeInvestor
                      ? "first time investor"
                      : "—"
                }
              />
              <MetricTile label="Cash out" value={fmtUsd(scenario.requestedCashOut)} />
              {scenario.currentLoanBalance !== undefined && (
                <MetricTile label="Current loan balance" value={fmtUsd(scenario.currentLoanBalance)} />
              )}
              <MetricTile label="Interest-only" value={scenario.interestOnlyRequested ? "Requested" : "No"} />
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading icon={<ClipboardList className="h-5 w-5" />} title="Calculation Summary" />
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {analysis.calculation.results.map((c) => (
                <div key={c.key} className="relative rounded-control border border-surface-border bg-white p-4 overflow-hidden">
                  <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500 to-brand-200" aria-hidden />
                  <p className="text-xs text-ink-secondary">{c.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-ink-primary">{fmtCalc(c)}</p>
                  <div className="mt-1">
                    <CalcTrace calc={c} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Best Lender Matches — the signature section of the page. */}
          <Card className="p-6">
            <SectionHeading
              icon={<Layers className="h-5 w-5" />}
              title="Best Lender Matches"
              description="Every applicable lender program, ranked by real match score — sorted automatically."
            />
            <div className="mt-4">
              <BestLenderMatches evaluations={analysis.evaluations} />
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading title="How to make this work — restructuring options" />
            {analysis.restructuring.length === 0 ? (
              <p className="mt-3 text-sm text-ink-secondary">No restructuring options identified that would unlock additional programs.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {analysis.restructuring.map((o, i) => (
                  <div key={i} className="rounded-control border border-surface-border p-4">
                    <p className="text-sm font-semibold text-ink-primary">{o.changedVariable}</p>
                    <p className="text-sm text-ink-secondary">
                      <span className="line-through">{o.currentValue}</span> →{" "}
                      <span className="font-medium text-ink-primary">{o.suggestedValue}</span>
                    </p>
                    <p className="text-sm text-ink-secondary mt-1">{o.rationale}</p>
                    <p className="text-xs text-emerald-700 mt-1">Potentially unlocks: {o.programsPotentiallyUnlocked.join("; ")}</p>
                    {o.remainingConcerns.length > 0 && (
                      <p className="text-xs text-amber-700 mt-1">Remaining concerns: {o.remainingConcerns.join(" · ")}</p>
                    )}
                    <p className="text-xs text-ink-secondary mt-1">Required verification: {o.requiredVerification.join(" · ")}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-ink-secondary/70 mt-3">
              Restructuring options are honest structural changes only. Never misrepresent occupancy, income, assets,
              employment, ownership, citizenship, property use, or loan purpose.
            </p>
          </Card>

          <p className="text-xs text-ink-secondary border-t border-surface-border pt-4">{analysis.disclaimer}</p>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-5">
            <SectionHeading title="Document Needs List" />
            <div className="mt-3">
              <DocumentNeeds items={analysis.needsList} />
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeading icon={<Clock className="h-4 w-4" />} title="Scenario Activity" />
            <div className="mt-3">
              <ScenarioActivity createdAt={scenario.createdAt} updatedAt={scenario.updatedAt} />
            </div>
          </Card>

          {best?.isSampleData ? (
            <Card className="p-4">
              <Pill tone="amber">Sample data</Pill>
              <p className="mt-2 text-xs text-ink-secondary">
                This scenario is being compared against demonstration lender data, not real guidelines.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
