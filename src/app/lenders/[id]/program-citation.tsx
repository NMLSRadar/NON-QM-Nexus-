"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Collapses a program's full guideline notes + source citation behind a
 * single "View guideline notes & source" button — collapsed by default.
 * The full verbiage (correction annotations, matrix detail, sourcing) is
 * real and valuable but was cluttering every program card by default; this
 * keeps the card clean while still making it one click away. Mirrors the
 * same expand/collapse pattern already used for scenario-results lender
 * cards (best-lender-matches.tsx).
 */
export function ProgramCitation({ notes, sourceCitation }: { notes?: string; sourceCitation: string }) {
  const [expanded, setExpanded] = useState(false);
  const urls = Array.from(sourceCitation.matchAll(/https?:\/\/[^\s,;]+/g), (match) => match[0].replace(/[).]+$/, ""));

  if (!notes && !sourceCitation) return null;

  return (
    <div className="mt-3 border-t border-amber-500/10 pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-amber-400 transition-colors hover:text-amber-300"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Hide guideline notes & source" : "View guideline notes & source"}
      </button>

      {expanded ? (
        <div className="mt-2 space-y-2">
          {notes ? <p className="whitespace-pre-line text-xs text-slate-400">{notes}</p> : null}
          <p className="text-xs text-slate-500">
            Source: <span className="italic">{sourceCitation}</span>
          </p>
          {urls.length ? (
            <div className="flex flex-wrap gap-2">
              {urls.map((url, index) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-amber-400 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-300">
                  {urls.length === 1 ? "View guideline / matrix" : `View source ${index + 1}`}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
