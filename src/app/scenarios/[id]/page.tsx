import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileEdit, RotateCw, Layers, Clock } from "lucide-react";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { Card, StatusBadge, SectionHeading, LinkButton, Pill } from "@/components/ui";
import type { MatchStatus } from "@/domain/types/enums";
import { BestLenderMatches, ScenarioPricingGuidance } from "./best-lender-matches";
import { DocumentNeeds } from "./document-needs";
import { ScenarioActivity } from "./scenario-activity";
import { SponsoredAeContacts } from "./sponsored-ae-contacts";
import { FileClassificationCard } from "@/components/file-classification-card";
import { ScenarioComplexity } from "@/components/scenario-complexity";
import { classifyScenarioComplexity } from "@/domain/complexity";
import { getAeContactsByLenderIds } from "@/lib/ae/directory-data";
import { ClearVoiceDraftAfterResultsReady, ScenarioResultsRuntimeGuard } from "./results-runtime-guard";
import * as Sentry from "@sentry/nextjs";
import { loadScenarioResults } from "./result-loader";

export const dynamic = "force-dynamic";

export default async function ScenarioResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const scenario = await repo.getScenario(org, id);
  if (!scenario) notFound();
  const { access, analysis, degraded } = await loadScenarioResults(repo, org, scenario);
  const best = analysis.evaluations[0];
  let contactsByLender = {};
  if (access.tierLevel > 0) {
    try {
      contactsByLender = await getAeContactsByLenderIds([...new Set(analysis.evaluations.map((evaluation) => evaluation.lenderId))]);
    } catch (error) {
      // AE contact enrichment is optional. A directory/table/network failure
      // must never suppress the actual lender matches the user came for.
      console.error("Scenario result AE contact enrichment failed:", error);
      Sentry.captureException(error, { tags: { surface: "scenario-results-ae-enrichment" } });
    }
  }

  return (
    <ScenarioResultsRuntimeGuard>
      <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      {degraded ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Core lender recommendations are shown. Some supplemental guideline or account-enrichment data is temporarily unavailable.
        </div>
      ) : null}
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
          {/* Calculation Summary intentionally removed from this page (product
              spec: scenario-results cleanup) — LTV/DTI/DSCR/etc. are still
              computed in full by analyzeScenario above and drive lender
              eligibility, ranking, and the AI Analysis text below; they are
              simply no longer rendered as their own section. */}

          {/* Best Lender Matches — the signature section of the page. */}
          <Card className="p-6">
            <ScenarioPricingGuidance evaluations={analysis.evaluations} className="mb-5 lg:hidden" />
            <div className="mb-4">
              <ScenarioComplexity result={classifyScenarioComplexity(scenario)} />
            </div>
            {analysis.bankStatementFileClassification ? (
              <FileClassificationCard result={analysis.bankStatementFileClassification} />
            ) : null}
            {scenario.citizenship === "itin" ? (
              <div className="mb-4 rounded-control border border-brand-200 bg-brand-50/60 p-3.5">
                <p className="text-sm font-semibold text-brand-900">
                  ITIN borrower detected. Searching active ITIN loan programs and ranking the strongest lender matches.
                </p>
                <p className="mt-1 text-xs text-brand-800/80">
                  Only programs whose current, verified guidelines list ITIN as an eligible citizenship classification are
                  ranked below — a lender is never shown just because it&apos;s generally known for ITIN lending.
                </p>
              </div>
            ) : null}
            {scenario.fico == null && scenario.creditProfileType && scenario.creditProfileType !== "us_fico_score" ? (
              <div className="mb-4 rounded-control border border-brand-200 bg-brand-50/60 p-3.5">
                <p className="text-sm font-semibold text-brand-900">
                  {scenario.visaType === "F-1"
                    ? `The borrower has been classified as a foreign national based on the stated F-1 visa. `
                    : ""}
                  Credit profile: {scenario.creditProfileType.replace(/_/g, " ")} — no numeric U.S. FICO score was
                  provided, and that is a valid, resolved answer, not missing data.
                </p>
                <p className="mt-1 text-xs text-brand-800/80">
                  Non-QM Nexus prioritizes lenders that permit no-FICO or foreign-national borrowers, foreign credit, or
                  alternative credit documentation below. Maximum LTV and eligibility may depend on occupancy, housing
                  history, reserves, loan amount, and whether foreign or alternative credit can be documented.
                </p>
              </div>
            ) : null}
            <SectionHeading
              icon={<Layers className="h-5 w-5" />}
              title="Best Lender Matches"
              description="Every applicable lender program, ranked by real match score — sorted automatically."
            />
            <div className="mt-4">
              <BestLenderMatches evaluations={analysis.evaluations} tierLevel={access.tierLevel} contactsByLender={contactsByLender} />
            </div>
          </Card>

          <SponsoredAeContacts evaluatedLenderIds={[...new Set(analysis.evaluations.map((e) => e.lenderId))]} />

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
          <ScenarioPricingGuidance evaluations={analysis.evaluations} className="hidden lg:block lg:sticky lg:top-24" />

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
        <ClearVoiceDraftAfterResultsReady />
      </div>
    </ScenarioResultsRuntimeGuard>
  );
}
