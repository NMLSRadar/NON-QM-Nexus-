"use client";

import { useEffect, useRef, useState } from "react";
import type { ProgramEvaluation } from "@/domain/types/results";

const TONE_BAR: Record<string, string> = {
  strong_match: "bg-emerald-500",
  eligible: "bg-emerald-500",
  conditional: "bg-amber-500",
  eligible_with_restructuring: "bg-amber-500",
  manual_review: "bg-sky-500",
  ineligible: "bg-rose-400",
};

/** The right-hand panel of the 3-panel live voice experience: as the
 * borrower's transcript resolves more vitals, this re-runs the SAME
 * deterministic analyzeScenario() the final results page uses (client-
 * side, against a catalog fetched once — see getVoiceCatalog()) and shows
 * the top matches reordering live. Rank-change arrows are computed by
 * diffing against the previous render's rank map — real deltas from the
 * real score, not a canned animation. */
export function LiveLenderRankings({
  evaluations,
  loading,
  enoughData,
}: {
  evaluations: ProgramEvaluation[];
  loading: boolean;
  enoughData: boolean;
}) {
  const prevRanks = useRef<Map<string, number>>(new Map());
  const [, forceRerender] = useState(0);

  const top = evaluations.slice(0, 5);

  useEffect(() => {
    const next = new Map<string, number>();
    top.forEach((e, i) => next.set(e.programId, i));
    prevRanks.current = next;
    forceRerender((n) => n + 1);
    // Only the rank map needs to persist across renders for the delta
    // arrows below — no need to depend on `top` by reference identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top.map((e) => `${e.programId}:${e.matchScore}`).join(",")]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading your lender catalog…</p>;
  }
  if (!enoughData || top.length === 0) {
    return <p className="text-sm text-slate-500">Speak a few more details — real lenders will start ranking live here.</p>;
  }

  return (
    <ul className="space-y-2" aria-live="polite">
      {top.map((e, i) => {
        const prevRank = prevRanks.current.get(e.programId);
        const moved = prevRank !== undefined && prevRank !== i ? (prevRank > i ? "up" : "down") : null;
        return (
          <li
            key={e.programId}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 transition-all duration-500"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold">
              {i + 1}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_BAR[e.status] ?? "bg-slate-400"}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{e.lenderName}</p>
              <p className="truncate text-xs text-slate-500">{e.programName}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {moved === "up" && <span className="text-emerald-600 text-xs" aria-label="Moved up">▲</span>}
              {moved === "down" && <span className="text-rose-500 text-xs" aria-label="Moved down">▼</span>}
              <div className="flex flex-col items-end leading-tight">
                <span className="text-sm font-bold tabular-nums text-slate-900">{Math.round(e.matchScore)}%</span>
                <span className="text-[8px] font-medium uppercase tracking-wide text-slate-400">Confidence</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
