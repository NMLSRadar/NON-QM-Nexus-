"use client";

/**
 * Scenario Complexity classification — rendered just above the ranked lender
 * results. Shows the deterministic band (High / Moderate / Low Complexity)
 * from src/domain/complexity.ts plus up to the four most relevant short
 * fragment reasons. Compact, color + icon + text (never colour alone),
 * works in both dark and light themes, with a subtle entrance animation.
 */
import { AlertTriangle, CheckCircle2, Activity, type LucideIcon } from "lucide-react";
import type { ComplexityLevel, ComplexityResult } from "@/domain/complexity";

const STYLES: Record<
  ComplexityLevel,
  { label: string; icon: LucideIcon; accent: string; pill: string; bar: string }
> = {
  high: {
    label: "High Complexity",
    icon: AlertTriangle,
    accent: "text-rose-700",
    pill: "border-rose-200 bg-rose-50 text-rose-800",
    bar: "bg-rose-500",
  },
  moderate: {
    label: "Moderate Complexity",
    icon: Activity,
    accent: "text-amber-700",
    pill: "border-amber-200 bg-amber-50 text-amber-800",
    bar: "bg-amber-500",
  },
  low: {
    label: "Low Complexity",
    icon: CheckCircle2,
    accent: "text-emerald-700",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-800",
    bar: "bg-emerald-500",
  },
};

export function ScenarioComplexity({ result }: { result: ComplexityResult }) {
  const s = STYLES[result.level];
  const Icon = s.icon;
  const bullets = result.reasons.slice(0, 4);

  return (
    <div
      className="scenario-complexity rounded-control border border-surface-border bg-white p-4"
      aria-label={`${s.label}. Reasons: ${bullets.join(", ") || "clean, straightforward file."}`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-inset ${s.pill} ${s.accent}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className={`text-sm font-bold ${s.accent}`}>{s.label}</p>
        </div>
        <span className={`h-1.5 w-16 overflow-hidden rounded-full ${s.pill}`} aria-hidden="true">
          <span className={`block h-full ${s.bar} complexity-fill`} />
        </span>
      </div>

      {bullets.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
          {bullets.map((r) => (
            <li key={r} className="flex items-center gap-1.5 text-xs text-ink-primary">
              <span className={`h-1 w-1 shrink-0 rounded-full ${s.bar}`} aria-hidden="true" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2.5 text-xs text-ink-secondary">
          Clean, standard file — strong credit, conventional structure, full documentation.
        </p>
      )}
    </div>
  );
}