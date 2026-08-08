"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Collapsible lender-level Notes card — collapsed by default. Some lenders
 * (e.g. Cake Mortgage) carry long research/audit notes that were pushing
 * the rest of the page down; this keeps the card compact while the full
 * text stays one click away. Mirrors the same expand/collapse pattern used
 * for per-program guideline notes (program-citation.tsx).
 */
export function LenderNotes({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card title="Notes" dark>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-amber-400 transition-colors hover:text-amber-300"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Hide notes" : "View notes"}
      </button>

      {expanded ? <p className="mt-3 text-sm text-slate-400 whitespace-pre-line">{notes}</p> : null}
    </Card>
  );
}
