import type { GuidelinePosture } from "@/domain/lenderPosture";

/**
 * Lender posture sidenote (chatbot upgrade Part 2 §4.1).
 *
 * Renders a small badge next to a lender wherever the org has a posture profile
 * on record. Editorially sourced, never a guideline citation. When there is NO
 * profile for the lender, this renders NOTHING — silence, never an inferred
 * badge. Every tooltip closes with the editorial-source label.
 */

const EDITORIAL_LABEL = "Internal guidance based on market experience — not a lender guideline or commitment.";

const COPY: Record<GuidelinePosture, { label: string; tooltip: string; className: string }> = {
  exception_based: {
    label: "Exception-friendly",
    tooltip:
      "Known for guideline flexibility and a working exception process. Exceptions require compensating factors and are never guaranteed. " + EDITORIAL_LABEL,
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  moderate: {
    label: "Moderate flexibility",
    tooltip: "Guideline flexibility falls in the middle — exceptions are considered case-by-case, not routine. " + EDITORIAL_LABEL,
    className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  },
  rigid: {
    label: "Rigid guidelines",
    tooltip: "Tighter guidelines with limited exception appetite; tighter guidelines generally correlate with better pricing. " + EDITORIAL_LABEL,
    className: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  },
};

export function LenderPostureBadge({ posture }: { posture: GuidelinePosture | null | undefined }) {
  if (!posture) return null; // no profile on record -> no badge, no inference
  const c = COPY[posture];
  return (
    <span
      title={c.tooltip}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${c.className}`}
    >
      {c.label}
    </span>
  );
}

export { EDITORIAL_LABEL as POSTURE_EDITORIAL_LABEL };