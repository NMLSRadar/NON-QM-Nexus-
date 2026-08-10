import { SectionHeading, Card, Pill } from "@/components/ui";
import { scoreCompensatingFactors, type CompensatingFactorAssessment } from "@/domain/compensatingFactors/score";
import { resolveAlias, type LenderFlexibilityProfile } from "@/domain/lenderPosture";
import { EDITORIAL_DISCLAIMER } from "@/domain/lenderPosture";
import type { AnalysisResult, ProgramEvaluation } from "@/domain/types/results";
import type { Scenario } from "@/domain/types/scenario";

/**
 * Exception Readiness section (chatbot upgrade Part 2 §4.2).
 *
 * Triggers when the scenario returns conditional / manual review / ineligible
 * AND at least one program in the match set belongs to an exception_based
 * lender. Renders: what's failing and by how much → the itemized compensating
 * factors on this file → what's missing → which exception-based lenders will
 * consider an exception → a draft exception narrative (from narrativeInputs
 * only, never from posture text) → the standing caveat.
 *
 * Posture is advisory only and never affects the match status/score shown
 * elsewhere on the page.
 */

const TRIGGER_STATUSES = new Set(["conditional", "manual_review", "ineligible"]);

export function ExceptionReadiness({
  scenario,
  analysis,
  postureProfiles,
}: {
  scenario: Scenario;
  analysis: AnalysisResult;
  postureProfiles: LenderFlexibilityProfile[];
}) {
  const best = analysis.evaluations[0];
  if (!best || !TRIGGER_STATUSES.has(best.status)) return null;

  // Exception-based lenders present in the match set.
  const matchLenderNames = new Set(analysis.evaluations.map((e) => resolveAlias(e.lenderName)));
  const exceptionLenders = postureProfiles.filter(
    (p) => p.posture === "exception_based" && matchLenderNames.has(resolveAlias(p.lenderId)),
  );
  if (exceptionLenders.length === 0) return null; // no exception-based lender qualifies the trigger

  // The top exception-based evaluation — the primary candidate for an exception.
  const targetEval =
    analysis.evaluations.find((e) => exceptionLenders.some((p) => resolveAlias(p.lenderId) === resolveAlias(e.lenderName))) ?? best;

  const assessment = buildAssessment(scenario, analysis, targetEval);
  const issue = targetEval.failedRules[0];
  const narrative = buildNarrative(scenario, targetEval, assessment);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <SectionHeading title="Exception Readiness" />
        <Pill tone="amber">advisory</Pill>
      </div>
      <p className="mt-1 text-xs text-ink-secondary">
        Eligibility is decided by the rules above. This section is advisory — it describes file strength for a case-by-case
        exception request, never a likelihood of approval.
      </p>

      {/* 1. What's failing, and by how much */}
      {issue ? (
        <div className="mt-4 rounded-control border border-rose-500/25 bg-rose-500/5 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">What&apos;s failing</p>
          <p className="mt-1 text-sm text-ink-primary">
            <span className="font-semibold">{targetEval.lenderName} — {targetEval.programName}:</span> {issue.userExplanation}
          </p>
        </div>
      ) : null}

      {/* 2. Compensating factors on this file */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Compensating factors on this file</p>
        <ul className="mt-2 space-y-1.5">
          {assessment.factors
            .filter((f) => f.present)
            .sort((a, b) => strengthRank(b.strength) - strengthRank(a.strength))
            .map((f) => (
              <li key={f.type} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-ink-secondary">
                  <span className="font-medium capitalize text-ink-primary">{f.type.replace(/_/g, " ")}</span> — {f.explanation}
                  <span className="block text-xs text-ink-secondary/70">Proves it: {f.verificationNeeded}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${strengthClass(f.strength)}`}>{f.strength}</span>
              </li>
            ))}
          {assessment.factors.filter((f) => f.present).length === 0 && (
            <li className="text-sm text-ink-secondary">No compensating factors are documented on this file yet — that is the gap to close.</li>
          )}
        </ul>
      </div>

      {/* 3. What's missing */}
      {assessment.missingHighValueFactors.length > 0 && (
        <div className="mt-4 rounded-control border border-brand-200 bg-brand-50/50 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">What would most improve this file</p>
          <p className="mt-1 text-sm text-ink-primary">
            {assessment.missingHighValueFactors.map((m) => m.replace(/_/g, " ")).join(", ")} — these carry the most weight for an
            exception request.
          </p>
        </div>
      )}

      {/* 4. Which lenders will consider an exception */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Which lenders will consider an exception</p>
        <ul className="mt-2 space-y-1">
          {exceptionLenders.map((p) => (
            <li key={p.id} className="text-sm text-ink-primary">
              {lenderDisplayName(p)} — {p.exceptionsConsidered ? `considers exceptions${p.exceptionChannel ? ` via ${p.exceptionChannel}` : ""}` : "not flagged"}
            </li>
          ))}
        </ul>
      </div>

      {/* 5. Draft exception narrative */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Draft exception request narrative</p>
        <div className="mt-2 space-y-2 rounded-control border border-surface-border bg-black/20 p-3.5">
          {narrative.map((line, i) => (
            <p key={i} className="text-sm text-ink-primary/90">
              {line}
            </p>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-ink-secondary/70">
          Draft for your AE conversation — copy and edit freely. It does not assert entitlement to an exception.
        </p>
      </div>

      {/* 6. Standing caveat */}
      <p className="mt-4 border-t border-surface-border pt-3 text-xs text-ink-secondary/80">
        An exception is discretionary, requires AE or credit-committee review, and pricing may differ from the published matrix. {EDITORIAL_DISCLAIMER}
      </p>
    </Card>
  );
}

function lenderDisplayName(p: LenderFlexibilityProfile): string {
  return p.lenderId
    .split(/[ _-]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function buildAssessment(scenario: Scenario, analysis: AnalysisResult, ev: ProgramEvaluation): CompensatingFactorAssessment {
  const calc = analysis.calculation;
  return scoreCompensatingFactors({
    requestedLtv: calc.ltv?.value ?? undefined,
    maxAllowableLtv: ev.maxLtv,
    actualReservesMonths: scenario.reserveAmountMonthsRequested,
    requiredReservesMonths: ev.estimatedReservesRequiredMonths,
    calculatedDti: calc.dti?.value ?? undefined,
    maxAllowableDti: ev.maxDti,
    actualFico: scenario.fico,
    programMinFico: ev.minFico,
    mortgageLates30x24: scenario.creditEvents?.mortgageLates30x12,
    selfEmploymentMonths: scenario.selfEmploymentMonths,
    minSelfEmploymentMonths: 12,
  });
}

function buildNarrative(scenario: Scenario, ev: ProgramEvaluation, assessment: CompensatingFactorAssessment): string[] {
  const lines: string[] = [];
  lines.push(`Scenario: ${scenario.loanPurpose?.replace(/_/g, " ") ?? "n/a"} · ${scenario.occupancy?.replace(/_/g, " ") ?? "n/a"} · ${scenario.propertyType?.replace(/_/g, " ") ?? "n/a"}.`);
  lines.push(`Requested variance: we are asking ${ev.lenderName} (${ev.programName}) to consider ${ev.failedRules[0]?.userExplanation ?? "a guideline variance"}.`);
  const strengths = assessment.factors.filter((f) => f.present).sort((a, b) => strengthRank(b.strength) - strengthRank(a.strength));
  if (strengths.length) {
    lines.push(
      `Compensating factors: ${strengths
        .slice(0, 4)
        .map((f) => `${f.type.replace(/_/g, " ")} ${f.actualValue} (${f.requiredValue})`)
        .join("; ")}.`,
    );
  }
  lines.push(`Documentation available: ${strengths.map((f) => f.verificationNeeded).filter((v) => v && v !== "—").join(", ") || "to be provided"}.`);
  return lines;
}

function strengthRank(s: string): number {
  return { none: 0, slight: 1, moderate: 2, strong: 3, very_strong: 4 }[s] ?? 0;
}
function strengthClass(s: string): string {
  return {
    slight: "bg-slate-500/15 text-slate-300",
    moderate: "bg-sky-500/15 text-sky-300",
    strong: "bg-emerald-500/15 text-emerald-300",
    very_strong: "bg-emerald-500/25 text-emerald-200",
    none: "bg-slate-500/10 text-slate-400",
  }[s] ?? "bg-slate-500/15 text-slate-300";
}