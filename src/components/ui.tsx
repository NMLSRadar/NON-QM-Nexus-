import type { ReactNode } from "react";
import { MatchStatus, SAMPLE_DATA_LABEL } from "@/domain/types/enums";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-lg border border-slate-200 shadow-sm p-4 ${className}`}>
      {title ? <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">{title}</h2> : null}
      {children}
    </section>
  );
}

const STATUS_STYLES: Record<MatchStatus, { label: string; className: string }> = {
  strong_match: { label: "Strong match", className: "bg-emerald-100 text-emerald-800" },
  eligible: { label: "Eligible", className: "bg-green-100 text-green-800" },
  conditional: { label: "Conditional", className: "bg-amber-100 text-amber-800" },
  eligible_with_restructuring: { label: "Eligible w/ restructuring", className: "bg-amber-100 text-amber-800" },
  manual_review: { label: "Manual review", className: "bg-sky-100 text-sky-800" },
  ineligible: { label: "Ineligible", className: "bg-rose-100 text-rose-800" },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const s = STATUS_STYLES[status];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

export function SampleDataBadge() {
  return (
    <span className="inline-block rounded bg-amber-50 border border-amber-300 text-amber-800 text-[11px] px-1.5 py-0.5">
      {SAMPLE_DATA_LABEL}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}
