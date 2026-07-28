"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, ChevronDown, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { SampleDataBadge, StatusBadge, Stat, Pill, fmtPct, fmtUsd } from "@/components/ui";
import type { ProgramEvaluation } from "@/domain/types/results";
import type { MatchStatus } from "@/domain/types/enums";
import { whyThisLender, potentialIssues, aiNarrative } from "@/domain/matching/narrative";

const MAX_COMPARE = 4;

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

function MatchScoreRing({ score }: { score: number }) {
  // Simple, dependency-free circular progress using conic-gradient — no
  // charting library needed for a single-number ring.
  const deg = Math.round((score / 100) * 360);
  return (
    <div
      className="relative h-14 w-14 shrink-0 rounded-full grid place-items-center"
      style={{ background: `conic-gradient(#C99712 ${deg}deg, #ECECEC 0deg)` }}
      aria-hidden
    >
      <div className="h-11 w-11 rounded-full bg-white grid place-items-center">
        <span className="text-sm font-bold tabular-nums text-ink-primary">{score}</span>
      </div>
    </div>
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

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 border-t border-surface-border pt-4">
        <Stat label="Max LTV" value={fmtPct(e.maxLtv, 1)} />
        <Stat label="Min FICO" value={e.minFico > 0 ? e.minFico : "Not required"} />
        <Stat label="Max loan amount" value={fmtUsd(e.maxLoanAmount)} />
        <Stat label="Reserves required" value={`${e.estimatedReservesRequiredMonths ?? "—"} mo`} />
        <Stat label="Max DTI" value={e.maxDti != null ? fmtPct(e.maxDti, 0) : "N/A"} />
        <Stat
          label="Qualifying income"
          value={e.estimatedQualifyingIncome != null ? `${fmtUsd(e.estimatedQualifyingIncome)}/mo` : "—"}
        />
        <Stat label="Documentation" value={e.documentationType} />
        <Stat label="Guideline" value={`eff. ${e.effectiveDate}`} />
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {e.loanPurposes.includes("cash_out_refinance") && <Pill tone="sky">Cash-Out Eligible</Pill>}
        {e.citizenshipEligible.includes("itin") && <Pill tone="gold">ITIN Eligible</Pill>}
        {e.itinSpecialist && <Pill tone="gold">ITIN Specialist</Pill>}
        {e.citizenshipEligible.includes("foreign_national") && <Pill tone="sky">Foreign National</Pill>}
        {e.foreignNationalSpecialist && <Pill tone="gold">Foreign National Specialist</Pill>}
        {e.bankStatementCleanExecution && <Pill tone="gold">Clean-File Execution</Pill>}
        {e.bankStatementFlexible && <Pill tone="gold">Bank Statement Flexibility</Pill>}
        {e.incomeDocTypes.includes("bank_statement") && <Pill tone="neutral">Bank Statement</Pill>}
        {e.incomeDocTypes.includes("dscr") && <Pill tone="neutral">DSCR</Pill>}
        {e.incomeDocTypes.includes("pnl_only") && <Pill tone="neutral">P&amp;L Only</Pill>}
        {e.incomeDocTypes.includes("asset_depletion") && <Pill tone="neutral">Asset Depletion</Pill>}
        {e.interestOnlyAvailable && <Pill tone="neutral">Interest-Only</Pill>}
        {e.occupancies.includes("investment") && <Pill tone="neutral">Investment Property</Pill>}
      </div>

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

function CompareTable({ items }: { items: ProgramEvaluation[] }) {
  const rows: Array<{ label: string; render: (e: ProgramEvaluation) => React.ReactNode }> = [
    { label: "Status", render: (e) => <StatusBadge status={e.status} /> },
    { label: "Match score", render: (e) => `${e.matchScore}/100` },
    { label: "Max LTV", render: (e) => fmtPct(e.maxLtv, 1) },
    { label: "Min FICO", render: (e) => (e.minFico > 0 ? e.minFico : "Not required") },
    { label: "Max DTI", render: (e) => (e.maxDti != null ? fmtPct(e.maxDti, 0) : "N/A") },
    { label: "Max loan amount", render: (e) => fmtUsd(e.maxLoanAmount) },
    { label: "Reserves required", render: (e) => `${e.estimatedReservesRequiredMonths ?? "—"} mo` },
    { label: "Documentation", render: (e) => e.documentationType },
    { label: "Guideline version", render: (e) => `${e.guidelineVersion} (eff. ${e.effectiveDate})` },
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
 * side-by-side compare — replaces the old flat grouped list. */
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
   * engine to a brand-new, not-yet-subscribed account. */
  tierLevel?: number;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sorted = useMemo(() => [...evaluations].sort((a, b) => b.matchScore - a.matchScore), [evaluations]);
  const selected = sorted.filter((e) => selectedIds.includes(e.programId));

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev));
  }

  if (sorted.length === 0) {
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
        {sorted.map((e, i) => (
          <LenderCard
            key={e.programId}
            rank={i}
            e={e}
            selected={selectedIds.includes(e.programId)}
            onToggle={() => toggle(e.programId)}
            disabled={selectedIds.length >= MAX_COMPARE}
            runnerUpName={i === 0 ? sorted[1]?.lenderName : undefined}
          />
        ))}
      </div>
    </div>
  );
}
