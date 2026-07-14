"use client";

import { useMemo, useState } from "react";
import { SampleDataBadge, StatusBadge, Stat, fmtPct, fmtUsd } from "@/components/ui";
import type { ProgramEvaluation } from "@/domain/types/results";

interface GroupedEvaluations {
  eligible: ProgramEvaluation[];
  conditional: ProgramEvaluation[];
  manual: ProgramEvaluation[];
  ineligible: ProgramEvaluation[];
}

const MAX_COMPARE = 4;

function ProgramCard({
  e,
  selected,
  onToggle,
  disabled,
}: {
  e: ProgramEvaluation;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className={`border rounded-lg p-4 space-y-3 bg-white ${selected ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              disabled={disabled && !selected}
              aria-label={`Compare ${e.programName}`}
              className="rounded border-slate-300"
            />
            {e.programName}
          </label>
          <p className="text-sm text-slate-500">{e.lenderName}</p>
          {e.isSampleData ? <SampleDataBadge /> : null}
        </div>
        <div className="text-right">
          <StatusBadge status={e.status} />
          <p className="text-xs text-slate-500 mt-1">Match score {e.matchScore}/100</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        <Stat label="Max LTV" value={fmtPct(e.maxLtv, 1)} />
        <Stat label="Min FICO" value={e.minFico > 0 ? e.minFico : "Not required"} />
        <Stat label="Max DTI" value={e.maxDti != null ? fmtPct(e.maxDti, 0) : "N/A"} />
        <Stat label="Max loan" value={fmtUsd(e.maxLoanAmount)} />
        <Stat label="Qualifying income" value={e.estimatedQualifyingIncome != null ? `${fmtUsd(e.estimatedQualifyingIncome)}/mo` : "—"} />
        <Stat label="Reserves req." value={`${e.estimatedReservesRequiredMonths} mo`} />
        <Stat label="Documentation" value={e.documentationType} />
        <Stat label="Guideline" value={`${e.guidelineVersion} · eff. ${e.effectiveDate}`} />
      </dl>

      {e.failedRules.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-rose-700 uppercase">Failed rules</h4>
          <ul className="text-sm text-rose-800 list-disc pl-5">
            {e.failedRules.map((r) => (
              <li key={r.ruleId}>
                {r.userExplanation}
                {r.sourceSection ? <span className="text-xs text-slate-400"> ({r.sourceSection})</span> : null}
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

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">Why this ranking? (score breakdown)</summary>
        <table className="mt-2 w-full">
          <tbody>
            {e.scoreBreakdown.map((b) => (
              <tr key={b.factor}>
                <td className="pr-2 py-0.5">{b.factor}</td>
                <td className="pr-2 tabular-nums">
                  {b.points}/{b.maxPoints}
                </td>
                <td className="text-slate-400">{b.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="text-[11px] text-slate-400">
        Source: {e.sourceCitation}
        {e.lastVerifiedDate ? ` · last verified ${e.lastVerifiedDate}` : ""}
      </p>
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
    { label: "Reserves required", render: (e) => `${e.estimatedReservesRequiredMonths} mo` },
    { label: "Documentation", render: (e) => e.documentationType },
    { label: "Failed rules", render: (e) => e.failedRules.length },
    { label: "Warnings", render: (e) => e.warnings.length },
    { label: "Manual review items", render: (e) => e.manualReviewItems.length },
    { label: "Guideline version", render: (e) => `${e.guidelineVersion} (eff. ${e.effectiveDate})` },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left text-xs text-slate-500 p-2 border-b border-slate-200"></th>
            {items.map((e) => (
              <th key={e.programId} className="text-left text-xs p-2 border-b border-slate-200">
                <p className="font-semibold text-slate-800">{e.programName}</p>
                <p className="font-normal text-slate-500">{e.lenderName}</p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="odd:bg-slate-50">
              <td className="p-2 text-xs font-medium text-slate-500 whitespace-nowrap">{row.label}</td>
              {items.map((e) => (
                <td key={e.programId} className="p-2">
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

export function CompareSection({ grouped }: { grouped: GroupedEvaluations }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const all = useMemo(
    () => [...grouped.eligible, ...grouped.conditional, ...grouped.manual, ...grouped.ineligible],
    [grouped],
  );
  const selected = all.filter((e) => selectedIds.includes(e.programId));

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev,
    );
  }

  const sections: Array<{ title: string; items: ProgramEvaluation[] }> = [
    { title: `Eligible programs (${grouped.eligible.length})`, items: grouped.eligible },
    { title: `Conditional (${grouped.conditional.length})`, items: grouped.conditional },
    { title: `Manual review (${grouped.manual.length})`, items: grouped.manual },
    { title: `Ineligible (${grouped.ineligible.length})`, items: grouped.ineligible },
  ];

  return (
    <div className="space-y-6">
      {selected.length >= 2 && (
        <section className="bg-white rounded-lg border border-brand-200 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Side-by-side comparison ({selected.length}/{MAX_COMPARE})
          </h2>
          <CompareTable items={selected} />
        </section>
      )}

      {sections.map((section) =>
        section.items.length === 0 ? null : (
          <section key={section.title} className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">{section.title}</h2>
            <p className="text-xs text-slate-400">Select up to {MAX_COMPARE} programs to compare side by side.</p>
            <div className="space-y-3">
              {section.items.map((e) => (
                <ProgramCard
                  key={e.programId}
                  e={e}
                  selected={selectedIds.includes(e.programId)}
                  onToggle={() => toggle(e.programId)}
                  disabled={selectedIds.length >= MAX_COMPARE}
                />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
