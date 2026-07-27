"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Extracting borrower information…",
  "Understanding occupancy…",
  "Calculating LTV…",
  "Calculating DTI…",
  "Calculating DSCR…",
  "Reading lender matrices…",
  "Checking overlays…",
  "Matching compensating factors…",
  "Ranking lenders…",
  "Preparing recommendations…",
];

/** Replaces a bare "Analyzing…" spinner with a sequence of real pipeline
 * stage names (matching the actual deterministic steps in
 * src/domain/analyze.ts: runCalculations -> evaluateProgram for every
 * program -> rankEvaluations -> restructuring/needs-list) — cosmetic
 * pacing only, not a claim about literal timing, since the real
 * calculation runs synchronously and near-instantly; this exists purely
 * so the wait doesn't feel like a bare, uninformative spinner. Advances on
 * an interval and stops advancing once mounted long enough to have shown
 * every step at least once. Respects prefers-reduced-motion by skipping
 * the fade transition (still cycles text, just without the animation). */
export function AiProcessingSequence({ active }: { active: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, 450);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status" aria-live="polite">
      <p key={index} className="gold-fade-up">
        {STEPS[index]}
      </p>
    </div>
  );
}
