import { EDITORIAL_DISCLAIMER, POSTURE_LABELS, POSTURE_TOOLTIPS, type GuidelinePosture } from "@/domain/lenderPosture";

/**
 * Lender posture sidenote badge (Part 2, §4.1). Editorial market-experience
 * context only — display-layer, never an eligibility or scoring input, and
 * never rendered inside a guideline citation block.
 *
 * No profile on record → the caller passes no posture → renders NOTHING.
 * Silence, not a guess.
 */
export function LenderPostureBadge({ posture, variant = "light" }: { posture?: GuidelinePosture | null; variant?: "light" | "dark" }) {
  if (!posture) return null;
  const tones = {
    light: {
      exception_based: "border-emerald-200 bg-emerald-50 text-emerald-700",
      moderate: "border-amber-200 bg-amber-50 text-amber-700",
      rigid: "border-slate-200 bg-slate-50 text-slate-600",
    },
    dark: {
      exception_based: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
      moderate: "border-amber-400/40 bg-amber-500/10 text-amber-300",
      rigid: "border-slate-400/40 bg-slate-500/10 text-slate-300",
    },
  } as const;
  return (
    <span
      title={`${POSTURE_TOOLTIPS[posture]} ${EDITORIAL_DISCLAIMER}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${tones[variant][posture]}`}
    >
      {POSTURE_LABELS[posture]}
    </span>
  );
}
