import { ShieldQuestion } from "lucide-react";
import { Card, SectionHeading } from "@/components/ui";
import { LenderPostureBadge } from "@/components/lender-posture-badge";
import { factsFromScenario, snapshotFromEvaluation } from "@/domain/compensatingFactors/fromScenario";
import { scoreCompensatingFactors, type CompensatingFactorType } from "@/domain/compensatingFactors";
import { EDITORIAL_DISCLAIMER, resolvePostureProfile, type LenderFlexibilityProfile } from "@/domain/lenderPosture";
import type { CalculationSummary, ProgramEvaluation } from "@/domain/types/results";
import type { Scenario } from "@/domain/types/scenario";

const FACTOR_TITLES: Record<CompensatingFactorType, string> = {
  reserves_surplus: "Reserves surplus",
  ltv_cushion: "LTV cushion",
  dti_cushion: "DTI cushion",
  fico_cushion: "FICO cushion",
  clean_housing_history: "Housing history",
  credit_depth: "Credit depth",
  seasoning_surplus: "Seasoning surplus",
  residual_income: "Residual income",
  tenure: "Tenure",
  payment_shock: "Payment shock",
};

/** Concrete "what's missing" targets, expressed as exception-STRENGTHENING
 * moves — deliberately labeled as strengthening a request, never as
 * creating eligibility (Part 2, §4.3). */
const MISSING_FACTOR_TARGETS: Record<CompensatingFactorType, string> = {
  reserves_surplus: "Document additional reserves — 12 months against a 3- or 6-month requirement is one of the strongest positions a file can carry.",
  ltv_cushion: "Reduce the requested LTV meaningfully below the cap (not just to it) so the file carries real cushion.",
  dti_cushion: "Pay down or pay off a liability to open a DTI cushion under the ceiling.",
  fico_cushion: "A higher mid-score (rapid rescore where legitimate) would add margin over the floor.",
  clean_housing_history: "Document a clean 24-month housing history (0x30x24) via VOM/VOR.",
  credit_depth: "Document clean credit depth: no derogatories/collections, seasoned tradelines, low utilization.",
  seasoning_surplus: "More months past the credit event strengthens the request; document the event date precisely.",
  residual_income: "Document residual income — dollars left monthly after all obligations.",
  tenure: "Document longer employment/self-employment tenure beyond the program minimum.",
  payment_shock: "Show the proposed payment near or below the current housing payment.",
};

/**
 * Exception Readiness (Part 2, §4.2). Renders only when the scenario has a
 * conditional / manual-review / ineligible result AND at least one program
 * in the match set belongs to an exception-friendly lender per the
 * EDITORIAL posture layer. Compensating factors come from the
 * deterministic engine; posture never touches eligibility.
 */
export function ExceptionReadiness({
  scenario,
  calc,
  evaluations,
  postureProfiles,
}: {
  scenario: Scenario;
  calc: CalculationSummary;
  evaluations: ProgramEvaluation[];
  postureProfiles: LenderFlexibilityProfile[];
}) {
  const needsHelp = evaluations.filter((e) => e.status === "conditional" || e.status === "manual_review" || e.status === "ineligible");
  if (needsHelp.length === 0) return null;

  const exceptionMatches = evaluations
    .map((e) => ({ evaluation: e, profile: resolvePostureProfile(e.lenderName, postureProfiles) }))
    .filter((x): x is { evaluation: ProgramEvaluation; profile: LenderFlexibilityProfile } => x.profile?.posture === "exception_based");
  if (exceptionMatches.length === 0) return null;

  // 1. What's failing, and by how much — the top not-clean program's rules.
  const focus = needsHelp[0]!;
  const failing = [...focus.failedRules, ...focus.manualReviewItems].slice(0, 4);

  // 2. Compensating factors on this file (deterministic engine).
  const assessment = scoreCompensatingFactors(factsFromScenario(scenario, calc), snapshotFromEvaluation(focus));
  const present = assessment.factors.filter((f) => f.present);

  // 4. Exception-friendly lenders in the match set (deduped by lender).
  const lenderRows = [...new Map(exceptionMatches.map((x) => [x.profile.canonicalName, x])).values()];

  // 5. Draft narrative — deterministic template from the assessment's
  // narrativeInputs only (never from posture text). No entitlement language.
  const narrative = [
    `Requesting guideline review on: ${scenario.name}. ${scenario.loanPurpose?.replace(/_/g, " ") ?? ""} · ${scenario.propertyType?.replace(/_/g, " ") ?? ""} · ${scenario.occupancy?.replace(/_/g, " ") ?? ""}${scenario.fico ? ` · ${scenario.fico} FICO` : ""}${calc.ltv?.value != null ? ` · ${calc.ltv.value}% LTV` : ""}.`,
    failing.length > 0 ? `Variance requested: ${failing.map((r) => r.userExplanation).join(" ")}` : "",
    present.length > 0
      ? `Compensating factors: ${present.map((f) => `${FACTOR_TITLES[f.type]} — ${f.actualValue} (${f.strength.replace(/_/g, " ")})`).join("; ")}.`
      : "Compensating factors to be documented.",
    present.length > 0 ? `Documentation available: ${[...new Set(present.map((f) => f.verificationNeeded))].join("; ")}.` : "",
    "We understand any exception is discretionary and subject to full underwriting review.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <Card className="p-6">
      <SectionHeading
        icon={<ShieldQuestion className="h-5 w-5" />}
        title="Exception Readiness"
        description="This scenario doesn't clear every published guideline as stated — here's what an exception request would stand on."
      />

      <div className="mt-4 space-y-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-700">What&apos;s failing, and by how much</h4>
          <ul className="mt-1.5 list-disc pl-5 text-sm text-ink-primary">
            {failing.map((r) => (
              <li key={r.ruleId}>
                {r.userExplanation}
                <span className="text-xs text-ink-secondary"> ({focus.lenderName} — {focus.programName})</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Compensating factors on this file</h4>
          {present.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-secondary">
              None of the documented facts register as compensating factors yet — see what&apos;s missing below.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {present.map((f) => (
                <li key={f.type} className="text-sm text-ink-primary">
                  <span className="font-semibold">{FACTOR_TITLES[f.type]}</span>{" "}
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">{f.strength.replace(/_/g, " ")}</span>{" "}
                  — {f.actualValue}. <span className="text-xs text-ink-secondary">Proof: {f.verificationNeeded}.</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-ink-secondary">
            Overall file strength: <span className="font-semibold">{assessment.overallStrength}</span> ({assessment.strongFactorCount} strong
            factor{assessment.strongFactorCount === 1 ? "" : "s"}). Describes file strength only — not a likelihood of approval.
          </p>
        </div>

        {assessment.missingHighValueFactors.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">What would most strengthen the request</h4>
            <ul className="mt-1.5 list-disc pl-5 text-sm text-ink-primary">
              {assessment.missingHighValueFactors.slice(0, 3).map((t) => (
                <li key={t}>
                  <span className="font-medium">{FACTOR_TITLES[t]}:</span> {MISSING_FACTOR_TARGETS[t]}{" "}
                  <span className="text-xs text-amber-700">(strengthens an exception request — does not create eligibility)</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-700">Who in this match set considers exceptions</h4>
          <ul className="mt-1.5 space-y-1">
            {lenderRows.map(({ evaluation, profile }) => (
              <li key={profile.canonicalName} className="flex flex-wrap items-center gap-2 text-sm text-ink-primary">
                <span className="font-medium">{evaluation.lenderName}</span>
                <LenderPostureBadge posture={profile.posture} />
                <span className="text-xs text-ink-secondary">via {profile.exceptionChannel ?? "the lender's AE"}</span>
              </li>
            ))}
          </ul>
        </div>

        <details className="rounded-control border border-surface-border p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-primary">Draft exception request narrative</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-ink-secondary">{narrative}</pre>
          <p className="mt-2 text-[11px] text-ink-secondary/80">
            Draft only — generated deterministically from the assessment above (never from posture notes). Review, edit, and send through
            the lender&apos;s exception channel.
          </p>
        </details>

        <p className="text-xs text-ink-secondary/80">
          An exception is discretionary, requires AE or credit-committee review, and pricing may differ from the published matrix.{" "}
          {EDITORIAL_DISCLAIMER}
        </p>
      </div>
    </Card>
  );
}
