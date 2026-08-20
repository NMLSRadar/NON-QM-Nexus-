"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, ChevronDown, Sparkles, CheckCircle2, AlertTriangle, Lock, XCircle } from "lucide-react";
import { SampleDataBadge, StatusBadge, Stat, Pill, fmtPct, fmtUsd } from "@/components/ui";
import type { ProgramEvaluation } from "@/domain/types/results";
import type { MatchStatus } from "@/domain/types/enums";
import { whyThisLender, potentialIssues, aiNarrative } from "@/domain/matching/narrative";
import { isPrivateGuidelinesLender } from "@/domain/privateGuidelines";
import { useCountUp } from "@/hooks/use-count-up";
import { PrivateGuidelinesMatchNote } from "@/components/private-guidelines-notice";

const MAX_COMPARE = 4;
/** Never show more than this many near-match/ineligible lenders — product
 * spec: "Do not display more than five ineligible or near-match lenders." */
const MAX_DISPLAYED_INELIGIBLE = 5;
/** Product spec: 3+ eligible lenders suppresses ineligible ones entirely. */
const ELIGIBLE_SUPPRESSION_THRESHOLD = 3;

// Green / yellow / red per the redesign brief — mapped from the same real
// MatchStatus the rest of the app already uses (see src/components/ui.tsx
// StatusBadge), not a new parallel scoring system.
const TONE_BY_STATUS: Record<MatchStatus, "green" | "amber" | "rose"> = {
  strong_match: "green",
  eligible: "green",
  conditional: "amber",
  eligible_with_restructuring: "amber",
  manual_review: "amber",
  ineligible: "rose",
};

const RING_BY_STATUS: Record<MatchStatus, string> = {
  strong_match: "ring-emerald-200",
  eligible: "ring-emerald-200",
  conditional: "ring-amber-200",
  eligible_with_restructuring: "ring-amber-200",
  manual_review: "ring-sky-200",
  ineligible: "ring-rose-100",
};

/** A program is "eligible" for the results-page display rule the moment it
 * isn't a hard-fail — strong_match/eligible/conditional/eligible_with_
 * restructuring/manual_review all count (see classifyStatus in
 * evaluateProgram.ts: only a hard rule failure produces "ineligible"). This
 * is the single source of truth for the eligible/ineligible split used by
 * the suppression rule below — never re-derive it differently elsewhere. */
function isEligibleStatus(status: MatchStatus): boolean {
  return status !== "ineligible";
}

function requiresCurrentMatrix(e: ProgramEvaluation): boolean {
  return e.ruleResults.some((r) => r.ruleName === "Current lender matrix confirmation");
}

function MatchScoreRing({ score }: { score: number }) {
  // Simple, dependency-free circular progress using conic-gradient — no
  // charting library needed for a single-number ring. Includes the
  // "Confidence Score" label as supporting text under the prominent number,
  // making the score and label a single cohesive component. The number
  // counts into place once on mount (respects prefers-reduced-motion).
  const { value, progress } = useCountUp(score, true);
  const deg = Math.round(((progress * score) / 100) * 360);
  return (
    <div className="confidence-score flex shrink-0 flex-col items-center" aria-label={`Confidence Score ${score} out of 100`}>
      <div
        className="confidence-score__ring relative grid place-items-center rounded-full"
        style={{ background: `conic-gradient(from -90deg, #fff4b8 0deg, #f0c860 ${Math.max(0, deg - 8)}deg, #a97812 ${deg}deg, #dadde3 ${deg}deg, #f8fafc 360deg)` }}
        aria-hidden
      >
        <div className="confidence-score__core grid place-items-center rounded-full">
          <span className="confidence-score__value tabular-nums">{value}</span>
        </div>
      </div>
      <span className="confidence-score__label">Confidence Score</span>
      <span className="confidence-score__rule" aria-hidden="true" />
    </div>
  );
}

type PricingGuidanceTier = "strong" | "layered" | "guidelines";

function getPricingGuidance(evaluations: ProgramEvaluation[]): {
  tier: PricingGuidanceTier;
  eyebrow: string;
  title: string;
  body: string;
  detail: string;
  metricValue: string;
  metricLabel: string;
} | null {
  const scores = evaluations.filter((e) => !e.guidelineVerificationRequired).map((e) => e.matchScore).filter(Number.isFinite);
  if (scores.length === 0) return null;

  const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  const highConfidenceCount = scores.filter((score) => score >= 83).length;

  if (highConfidenceCount >= 5) {
    return {
      tier: "strong",
      eyebrow: "Pricing Signal",
      title: "Strong Non-QM Scenario",
      body: "An 83%+ confidence score across five or more lender matches is a strong signal for a Non-QM scenario.",
      detail: "Guideline fit is consistently strong across multiple lenders, so rate and pricing should carry more weight when choosing the final lender.",
      metricValue: String(highConfidenceCount),
      metricLabel: "Lenders at 83%+",
    };
  }
  if (average >= 60 && average <= 82) {
    return {
      tier: "layered",
      eyebrow: "Balanced Review",
      title: "Pricing and Execution Matter Equally",
      body: "This scenario has potential layers, so pricing will be important — but it should not be considered by itself.",
      detail: "Guideline fit and matching the file to the right lender are equally important for this scenario.",
      metricValue: `${average}%`,
      metricLabel: "Average confidence",
    };
  }
  if (average <= 45) {
    return {
      tier: "guidelines",
      eyebrow: "Execution First",
      title: "Guidelines Matter More Than Rate",
      body: "Rate should carry very little weight for a file with this risk profile and these potential layers.",
      detail: "Prioritize an executable guideline fit. The rate does not matter if the deal cannot get done.",
      metricValue: `${average}%`,
      metricLabel: "Average confidence",
    };
  }
  return null;
}

export function ScenarioPricingGuidance({ evaluations, className = "" }: { evaluations: ProgramEvaluation[]; className?: string }) {
  const guidance = getPricingGuidance(evaluations);
  if (!guidance) return null;
  const Icon = guidance.tier === "strong" ? Sparkles : guidance.tier === "layered" ? AlertTriangle : XCircle;

  return (
    <aside className={`pricing-guidance pricing-guidance--${guidance.tier} ${className}`} aria-label="Scenario pricing guidance">
      <div className="pricing-guidance__topline">
        <span className="pricing-guidance__icon" aria-hidden="true"><Icon /></span>
        <span>{guidance.eyebrow}</span>
      </div>
      <div className="pricing-guidance__score" aria-label={`${guidance.metricLabel} ${guidance.metricValue}`}>
        <strong>{guidance.metricValue}</strong>
        <span>{guidance.metricLabel}</span>
      </div>
      <h2>{guidance.title}</h2>
      <p className="pricing-guidance__body">{guidance.body}</p>
      <p className="pricing-guidance__detail">{guidance.detail}</p>
    </aside>
  );
}

function StarRating({ score }: { score: number }) {
  const stars = Math.max(1, Math.min(5, Math.round(score / 20)));
  return (
    <span className="text-amber-500 text-sm tracking-tight" aria-label={`${stars} out of 5 stars`}>
      {"★".repeat(stars)}
      <span className="text-slate-300">{"★".repeat(5 - stars)}</span>
    </span>
  );
}

/** Locked variant of an eligible lender card — the lender belongs to a
 * membership tier the viewer hasn't subscribed to yet. Per the product
 * spec's membership-tier protection rule: the card stays visible and still
 * counts as an eligible match, but every guideline detail (stats, why-this-
 * lender, AI analysis, restrictions) is hidden behind an upgrade prompt. */
function LockedLenderCard({ e, rank }: { e: ProgramEvaluation; rank: number }) {
  const isBestMatch = rank === 0 && (e.status === "strong_match" || e.status === "eligible");
  return (
    <div
      className={`gold-fade-up rounded-card border bg-white p-5 ${isBestMatch ? "gold-shimmer-border" : "border-surface-border"}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="relative h-14 w-14 shrink-0 rounded-full grid place-items-center bg-surface-subtle">
            <Lock className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-ink-primary">{e.lenderName}</p>
              {isBestMatch ? (
                <Pill tone="gold">
                  <Trophy className="h-3 w-3 mr-1 inline" /> Best Match
                </Pill>
              ) : null}
            </div>
            <p className="text-sm text-ink-secondary">{e.programName}</p>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusBadge status={e.status} />
              <Pill tone="gold">Tier {e.lenderTierLevel} required</Pill>
            </div>
          </div>
        </div>
      </div>

      <PrivateGuidelinesMatchNote lenderName={e.lenderName} lenderId={e.lenderId} />

      <div className="mt-4 rounded-control border border-brand-100 bg-brand-50/40 p-4">
        <p className="text-sm font-semibold text-brand-900">
          This is a real eligible match for this scenario — the specific guideline details (max LTV, FICO, loan
          amount, reserves, and the full &ldquo;Why This Lender&rdquo; breakdown) are part of the plan tier above your
          current subscription.
        </p>
        <Link
          href="/pricing"
          className="gold-cta-glow mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-600 text-white text-xs font-semibold px-4 py-2 hover:bg-brand-700"
        >
          Upgrade to unlock this lender
        </Link>
      </div>
    </div>
  );
}

function LenderCard({
  rank,
  e,
  selected,
  onToggle,
  disabled,
  runnerUpName,
}: {
  rank: number;
  e: ProgramEvaluation;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  runnerUpName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = TONE_BY_STATUS[e.status];
  const isBestMatch = rank === 0 && (e.status === "strong_match" || e.status === "eligible");
  const isLowestReserves = e.estimatedReservesRequiredMonths != null;
  const isHighestLtv = e.maxLtv != null;
  const matrixPending = requiresCurrentMatrix(e);
  const verificationPending = e.guidelineVerificationRequired === true;

  return (
    <div
      className={`gold-fade-up rounded-card border bg-white p-5 transition-all duration-200 hover:shadow-soft-hover ${
        isBestMatch ? "gold-shimmer-border" : ""
      } ${
        selected ? "border-brand-500 ring-2 ring-brand-200" : `border-surface-border ring-1 ${RING_BY_STATUS[e.status]}`
      }`}
      style={{ animationDelay: `${Math.min(rank, 8) * 70}ms` }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <MatchScoreRing score={e.matchScore} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-ink-primary">{e.lenderName}</p>
              <StarRating score={e.matchScore} />
              {isBestMatch ? (
                <Pill tone="gold">
                  <Trophy className="h-3 w-3 mr-1 inline" /> Best Match
                </Pill>
              ) : null}
              {e.isSampleData ? <SampleDataBadge /> : null}
            </div>
            <p className="text-sm text-ink-secondary">{e.programName}</p>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusBadge status={e.status} />
              {rank === 1 && isHighestLtv ? <Pill tone="sky">Highest LTV</Pill> : null}
              {rank <= 2 && isLowestReserves && e.estimatedReservesRequiredMonths! <= 3 ? <Pill tone="sky">Lowest Reserves</Pill> : null}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={disabled && !selected}
            aria-label={`Compare ${e.programName}`}
            className="rounded border-surface-border accent-brand-600"
          />
          Compare
        </label>
      </div>

      <PrivateGuidelinesMatchNote lenderName={e.lenderName} lenderId={e.lenderId} />

      {verificationPending && (
        <div className="mt-4 rounded-control border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          <p className="font-bold">Guideline verification required — {e.documentationType}</p>
          <p className="mt-1">This bundled lender row does not yet contain an independently verified profile for the requested documentation program. No lender-level or sibling-program limits were used.</p>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 border-t border-surface-border pt-4">
        <Stat label={e.matchedIncomeDocType === "pnl_only" ? "P&L Only Max LTV" : `${e.documentationType} Max LTV`} value={verificationPending ? "Verification required" : matrixPending && e.maxLtv === 0 ? "Confirm matrix" : fmtPct(e.maxLtv, 1)} />
        <Stat label="Min FICO" value={verificationPending ? "Verification required" : matrixPending && e.minFico === 0 ? "Confirm matrix" : e.minFico != null && e.minFico > 0 ? e.minFico : "Not required"} />
        <Stat label="Max loan amount" value={verificationPending ? "Verification required" : matrixPending && e.maxLoanAmount === 0 ? "Confirm matrix" : fmtUsd(e.maxLoanAmount)} />
        <Stat label="Reserves required" value={verificationPending ? "Verification required" : matrixPending && (e.estimatedReservesRequiredMonths ?? 0) === 0 ? "Confirm matrix" : `${e.estimatedReservesRequiredMonths ?? "—"} mo`} />
        <Stat label="Max DTI" value={verificationPending ? "Verification required" : e.maxDti != null ? fmtPct(e.maxDti, 0) : "N/A"} />
        <Stat
          label="Qualifying income"
          value={e.estimatedQualifyingIncome != null ? `${fmtUsd(e.estimatedQualifyingIncome)}/mo` : "—"}
        />
        <Stat label="Matched Documentation" value={e.documentationType} />
      </dl>

      {e.pnl85SupportingStatementDisclaimer && (
        <div className="mt-4 rounded-control border-2 border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-950" role="note">
          {e.pnl85SupportingStatementDisclaimer}
        </div>
      )}

      {!verificationPending && <div className="mt-3 flex flex-wrap gap-1.5">
        {e.lienPosition === "standalone_second" && <Pill tone="gold">Standalone Second Lien</Pill>}
        {e.citizenshipEligible.includes("itin") && <Pill tone="gold">ITIN Eligible</Pill>}
        {e.itinSpecialist && <Pill tone="gold">ITIN Specialist</Pill>}
        {e.itinDscrConfirmed && <Pill tone="gold">ITIN DSCR Eligible</Pill>}
        {e.citizenshipEligible.includes("foreign_national") && <Pill tone="sky">Foreign National</Pill>}
        {e.foreignNationalSpecialist && <Pill tone="gold">Foreign National Specialist</Pill>}
        {e.matchedIncomeDocType === "bank_statement" && e.bankStatementCleanExecution && <Pill tone="gold">Clean-File Execution</Pill>}
        {e.matchedIncomeDocType === "bank_statement" && e.bankStatementFlexible && <Pill tone="gold">Bank Statement Flexibility</Pill>}
        {e.matchedIncomeDocType === "bank_statement" && <Pill tone="neutral">Bank Statement</Pill>}
        {e.matchedIncomeDocType === "dscr" && <Pill tone="neutral">DSCR</Pill>}
        {e.matchedIncomeDocType === "wvoe_only" && <Pill tone="neutral">WVOE Only</Pill>}
        {e.matchedIncomeDocType === "1099" && <Pill tone="neutral">1099</Pill>}
        {e.matchedIncomeDocType === "full_doc" && <Pill tone="neutral">Full Documentation</Pill>}
        {e.premierProduct && <Pill tone="gold">Premier Product</Pill>}
        {matrixPending && <Pill tone="neutral">Current matrix required</Pill>}
        {e.matchedIncomeDocType === "pnl_only" && <Pill tone="neutral">P&amp;L Only: Up to {fmtPct(e.maxLtv, 1)} LTV</Pill>}
        {e.matchedIncomeDocType === "asset_depletion" && <Pill tone="neutral">Asset Depletion</Pill>}
        {e.interestOnlyAvailable && <Pill tone="neutral">Interest-Only</Pill>}
      </div>}

      {(() => {
        const why = whyThisLender(e);
        const issues = potentialIssues(e);
        return (
          <div className="mt-4 grid sm:grid-cols-2 gap-4 border-t border-surface-border pt-4">
            {why.length > 0 && (
              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  <Sparkles className="h-3.5 w-3.5" /> Why This Lender?
                </h4>
                <ul className="mt-1.5 space-y-1">
                  {why.map((w) => (
                    <li key={w} className="flex items-start gap-1.5 text-sm text-ink-primary">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {issues.length > 0 && (
              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  <AlertTriangle className="h-3.5 w-3.5" /> Potential Issues
                </h4>
                <ul className="mt-1.5 space-y-1">
                  {issues.map((w) => (
                    <li key={w} className="flex items-start gap-1.5 text-sm text-ink-primary">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      <div className="mt-3 rounded-control bg-brand-50/40 border border-brand-100 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800 uppercase tracking-wide">
          <Sparkles className="h-3.5 w-3.5" /> AI Analysis
        </p>
        <p className="mt-1 text-sm text-ink-primary italic">
          &ldquo;{aiNarrative(e, rank, rank === 0 ? runnerUpName : undefined)}&rdquo;
        </p>
      </div>

      {(e.failedRules.length > 0 || e.warnings.length > 0 || e.manualReviewItems.length > 0 || e.scoreBreakdown.length > 0) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800 transition-colors"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Hide details" : "View guidelines & restrictions"}
        </button>
      )}

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-surface-border pt-3">
          {e.failedRules.length > 0 && (
            <div>
              <h4 className={`text-xs font-semibold uppercase ${tone === "rose" ? "text-rose-700" : "text-rose-700"}`}>Restrictions</h4>
              <ul className="text-sm text-rose-800 list-disc pl-5">
                {e.failedRules.map((r) => (
                  <li key={r.ruleId}>
                    {r.userExplanation}
                    {r.sourceSection ? <span className="text-xs text-ink-secondary"> ({r.sourceSection})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.warnings.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-700 uppercase">Warnings</h4>
              <ul className="text-sm text-amber-800 list-disc pl-5">
                {e.warnings.map((r) => (
                  <li key={r.ruleId}>{r.userExplanation}</li>
                ))}
              </ul>
            </div>
          )}
          {e.manualReviewItems.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-sky-700 uppercase">Manual review</h4>
              <ul className="text-sm text-sky-800 list-disc pl-5">
                {e.manualReviewItems.map((r) => (
                  <li key={r.ruleId}>{r.userExplanation}</li>
                ))}
              </ul>
            </div>
          )}
          {e.scoreBreakdown.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink-secondary uppercase">Approval confidence — score breakdown</h4>
              <table className="mt-1 w-full text-xs">
                <tbody>
                  {e.scoreBreakdown.map((b) => (
                    <tr key={b.factor}>
                      <td className="pr-2 py-0.5 text-ink-primary">{b.factor}</td>
                      <td className="pr-2 tabular-nums">
                        {b.points}/{b.maxPoints}
                      </td>
                      <td className="text-ink-secondary">{b.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-ink-secondary">
            Source: {e.sourceCitation}
            {e.lastVerifiedDate ? ` · last verified ${e.lastVerifiedDate}` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** A suppressed-by-default near-match / ineligible lender card — only ever
 * rendered when the scenario has fewer than 3 eligible lenders (product
 * spec section 3-4). Always clearly labeled and always explains the exact
 * disqualifying reason(s), drawn from this program's own real failed
 * rules — never invented. */
function IneligibleLenderCard({ e }: { e: ProgramEvaluation }) {
  const reasons = e.failedRules.length > 0 ? e.failedRules.map((r) => r.userExplanation) : potentialIssues(e);
  return (
    <div className="rounded-card border border-rose-100 bg-rose-50/30 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-ink-primary">{e.lenderName}</p>
            {e.isSampleData ? <SampleDataBadge /> : null}
          </div>
          <p className="text-sm text-ink-secondary">{e.programName}</p>
        </div>
        <Pill tone="rose">
          <XCircle className="h-3 w-3 mr-1 inline" /> Currently Ineligible
        </Pill>
      </div>

      <PrivateGuidelinesMatchNote lenderName={e.lenderName} lenderId={e.lenderId} />

      {reasons.length > 0 && (
        <div className="mt-3 border-t border-rose-100 pt-3">
          <h4 className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Guideline Conflict</h4>
          <ul className="mt-1.5 text-sm text-rose-800 list-disc pl-5 space-y-0.5">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CompareTable({ items }: { items: ProgramEvaluation[] }) {
  const rows: Array<{ label: string; render: (e: ProgramEvaluation) => React.ReactNode }> = [
    { label: "Status", render: (e) => <StatusBadge status={e.status} /> },
    { label: "Confidence Score", render: (e) => `${e.matchScore}/100` },
    { label: "Max LTV", render: (e) => (requiresCurrentMatrix(e) && e.maxLtv === 0 ? "Confirm matrix" : fmtPct(e.maxLtv, 1)) },
    { label: "Min FICO", render: (e) => (requiresCurrentMatrix(e) && e.minFico === 0 ? "Confirm matrix" : e.minFico != null && e.minFico > 0 ? e.minFico : "Not required") },
    { label: "Max DTI", render: (e) => (e.maxDti != null ? fmtPct(e.maxDti, 0) : "N/A") },
    { label: "Max loan amount", render: (e) => (requiresCurrentMatrix(e) && e.maxLoanAmount === 0 ? "Confirm matrix" : fmtUsd(e.maxLoanAmount)) },
    { label: "Reserves required", render: (e) => (requiresCurrentMatrix(e) && (e.estimatedReservesRequiredMonths ?? 0) === 0 ? "Confirm matrix" : `${e.estimatedReservesRequiredMonths ?? "—"} mo`) },
    { label: "Documentation", render: (e) => e.documentationType },
    {
      label: "Guideline source",
      render: (e) => (
        <span className={isPrivateGuidelinesLender(e.lenderName) ? "font-semibold text-amber-700" : "text-ink-secondary"}>
          {isPrivateGuidelinesLender(e.lenderName) ? "Not public — confirm with AE" : "Published"}
        </span>
      ),
    },
  ];

  return (
    <div className="overflow-x-auto rounded-tablecell border border-surface-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left text-xs text-ink-secondary p-3 border-b border-surface-border bg-brand-50/40"></th>
            {items.map((e) => (
              <th key={e.programId} className="text-left text-xs p-3 border-b border-surface-border bg-brand-50/40">
                <p className="font-semibold text-ink-primary">{e.programName}</p>
                <p className="font-normal text-ink-secondary">{e.lenderName}</p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="odd:bg-slate-50/60">
              <td className="p-3 text-xs font-medium text-ink-secondary whitespace-nowrap">{row.label}</td>
              {items.map((e) => (
                <td key={e.programId} className="p-3">
                  {row.render(e)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The signature experience of the scenario detail page: every applicable
 * program ranked by real match score, color-coded, with an inline
 * side-by-side compare — replaces the old flat grouped list.
 *
 * Display rule (product spec — scenario-results cleanup): eligible lenders
 * always render first, ranked strongest to weakest. Ineligible lenders are
 * suppressed entirely once there are 3+ eligible lenders; with 1-2 (or 0)
 * eligible lenders, up to 5 near-match/ineligible lenders are shown after
 * them, each clearly labeled with its exact disqualifying reason. A locked
 * (higher-tier) eligible lender still counts toward the 3-lender threshold
 * — it just renders with its guideline details hidden behind an upgrade
 * prompt instead of being excluded. */
export function BestLenderMatches({
  evaluations,
  tierLevel,
}: {
  evaluations: ProgramEvaluation[];
  /** The viewer's subscription tier (0 = no active plan). When there are
   * zero evaluations AND tierLevel is 0, the empty state isn't "no lenders
   * matched this scenario" — it's "there's nothing to match against yet
   * because this account has no active subscription" (the shared lender
   * catalog is tier-gated; see src/lib/repository/supabaseRepository.ts).
   * Those are two very different situations and need two different
   * messages — the generic one reads exactly like a broken matching
   * engine to a brand-new, not-yet-subscribed account. Also controls which
   * eligible lender cards render locked (lenderTierLevel > tierLevel). */
  tierLevel?: number;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Evaluations arrive from analyzeScenario already ranked with guideline
  // eligibility taking priority over match score (rankEvaluations: status
  // band first, then score, then name) — that ordering must never be
  // discarded in favor of a pure match-score sort, or an ineligible program
  // could visually outrank an eligible one.
  const eligible = useMemo(() => evaluations.filter((e) => !e.guidelineVerificationRequired && isEligibleStatus(e.status)), [evaluations]);
  const ineligible = useMemo(() => evaluations.filter((e) => e.guidelineVerificationRequired || !isEligibleStatus(e.status)), [evaluations]);
  const displayedIneligible = useMemo(
    () => (eligible.length >= ELIGIBLE_SUPPRESSION_THRESHOLD ? [] : ineligible.slice(0, MAX_DISPLAYED_INELIGIBLE)),
    [eligible.length, ineligible],
  );

  const effectiveTier = tierLevel ?? Number.POSITIVE_INFINITY;
  const selectableEligible = eligible.filter((e) => e.lenderTierLevel <= effectiveTier);
  const selected = selectableEligible.filter((e) => selectedIds.includes(e.programId));

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev));
  }

  if (evaluations.length === 0) {
    if (tierLevel === 0) {
      return (
        <div className="rounded-control border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">No active subscription — lender matching is locked for this account.</p>
          <p className="mt-1 text-amber-800">
            The scenario itself was captured and calculated correctly; there just isn&apos;t a plan on this account yet
            to compare it against real lender guidelines.
          </p>
          <Link
            href="/pricing"
            className="gold-cta-glow mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-600 text-white text-xs font-semibold px-4 py-2 hover:bg-brand-700"
          >
            View plans & subscribe
          </Link>
        </div>
      );
    }
    return <p className="text-sm text-ink-secondary">No applicable lender programs found for this scenario yet.</p>;
  }

  return (
    <div className="space-y-4">
      {selected.length >= 2 && (
        <div>
          <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-2">
            Side-by-side ({selected.length}/{MAX_COMPARE})
          </p>
          <CompareTable items={selected} />
        </div>
      )}

      <div className="space-y-4">
        {eligible.map((e, i) => {
          const locked = e.lenderTierLevel > effectiveTier;
          if (locked) return <LockedLenderCard key={e.programId} e={e} rank={i} />;
          return (
            <LenderCard
              key={e.programId}
              rank={i}
              e={e}
              selected={selectedIds.includes(e.programId)}
              onToggle={() => toggle(e.programId)}
              disabled={selectedIds.length >= MAX_COMPARE}
              runnerUpName={i === 0 ? eligible[1]?.lenderName : undefined}
            />
          );
        })}
      </div>

      {displayedIneligible.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="border-t border-surface-border pt-4">
            <h3 className="text-sm font-semibold text-ink-primary">
              {eligible.length === 0 ? "Strongest near-match lenders" : "Near-match / currently ineligible lenders"}
            </h3>
            <p className="mt-0.5 text-xs text-ink-secondary">
              Shown for reference only — these programs do not currently qualify for this scenario. See
              &ldquo;How to make this work&rdquo; below for the specific changes that could unlock eligibility.
            </p>
          </div>
          <div className="space-y-3">
            {displayedIneligible.map((e) => (
              <IneligibleLenderCard key={e.programId} e={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
