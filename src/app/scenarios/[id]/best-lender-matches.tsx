"use client";

import { useMemo, useState } from "react";
import { Trophy, ChevronDown } from "lucide-react";
import { SampleDataBadge, StatusBadge, Stat, Pill, fmtPct, fmtUsd } from "@/components/ui";
import type { ProgramEvaluation } from "@/domain/types/results";
import type { MatchStatus } from "@/domain/types/enums";

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

function LenderCard({
  rank,
  e,
  selected,
  onToggle,
  disabled,
}: {
  rank: number;
  e: ProgramEvaluation;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = TONE_BY_STATUS[e.status];
  const isBestMatch = rank === 0 && (e.status === "strong_match" || e.status === "eligible");
  const isLowestReserves = e.estimatedReservesRequiredMonths != null;
  const isHighestLtv = e.maxLtv != null;

  return (
    <div
      className={`rounded-card border bg-white p-5 transition-all duration-200 hover:shadow-soft-hover ${
        selected ? "border-brand-500 ring-2 ring-brand-200" : `border-surface-border ring-1 ${RING_BY_STATUS[e.status]}`
      }`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <MatchScoreRing score={e.matchScore} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-ink-primary">{e.lenderName}</p>
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
export function BestLenderMatches({ evaluations }: { evaluations: ProgramEvaluation[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sorted = useMemo(() => [...evaluations].sort((a, b) => b.matchScore - a.matchScore), [evaluations]);
  const selected = sorted.filter((e) => selectedIds.includes(e.programId));

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev));
  }

  if (sorted.length === 0) {
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
          />
        ))}
      </div>
    </div>
  );
}
