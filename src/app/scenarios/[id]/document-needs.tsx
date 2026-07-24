"use client";

import { useState } from "react";
import { ChevronDown, FileCheck2 } from "lucide-react";
import { Pill } from "@/components/ui";
import type { NeedsListItem } from "@/domain/types/results";

/** Compact, collapsible document-needs list for the sidebar — grouped
 * Required-first, collapsed to the first 4 by default so it doesn't
 * dominate the page (per the redesign brief's "compact, collapsible"
 * sidebar direction). */
export function DocumentNeeds({ items }: { items: NeedsListItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...items].sort((a, b) => Number(b.required) - Number(a.required));
  const visible = expanded ? sorted : sorted.slice(0, 4);

  return (
    <div>
      <ul className="space-y-3">
        {visible.map((n, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <FileCheck2 className="h-4 w-4 mt-0.5 text-brand-600 shrink-0" aria-hidden />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-ink-primary">{n.label}</p>
                <Pill tone={n.required ? "gold" : "neutral"}>{n.required ? "Required" : "If applicable"}</Pill>
              </div>
              <p className="text-xs text-ink-secondary">{n.reason}</p>
            </div>
          </li>
        ))}
      </ul>
      {sorted.length > 4 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800 transition-colors"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Show fewer" : `View full document list (${sorted.length})`}
        </button>
      ) : null}
    </div>
  );
}
