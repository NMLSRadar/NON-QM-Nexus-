"use client";

import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import type { NeedsListItem } from "@/domain/types/results";

function ChecklistRows({ items }: { items: NeedsListItem[] }) {
  const sorted = [...items].sort((a, b) => Number(b.required) - Number(a.required));
  return (
    <ul className="checklist-rows space-y-2.5">
      {sorted.map((n, i) => (
        <li key={i} className="checklist-row flex items-start gap-2.5 text-sm">
          <span className="checklist-row__icon"><FileCheck2 className="h-4 w-4 text-amber-400" aria-hidden /></span>
          <div className="checklist-row__copy min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-white">{n.label}</p>
              <span
                className={`checklist-row__badge rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  n.required ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" : "border border-white/15 text-slate-400"
                }`}
              >
                {n.required ? "Required" : "If applicable"}
              </span>
            </div>
            <p className="text-xs text-slate-400">{n.reason}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DocumentChecklistCard({
  title,
  description,
  purchaseItems,
  refinanceItems,
  conditionalTitle,
  conditionalPurchaseItems,
  conditionalRefinanceItems,
}: {
  title: string;
  description: string;
  purchaseItems: NeedsListItem[];
  refinanceItems: NeedsListItem[];
  /** Optional, clearly-separated sub-list for items that only apply under
   * a specific additional condition (e.g. ITIN's bank-statement-only
   * documents) — never mixed into the main required/if-applicable list
   * above, so a reader never mistakes a conditional-combination item for
   * something universal to the section. */
  conditionalTitle?: string;
  conditionalPurchaseItems?: NeedsListItem[];
  conditionalRefinanceItems?: NeedsListItem[];
}) {
  const [tab, setTab] = useState<"purchase" | "refinance">("purchase");
  const conditionalItems = tab === "purchase" ? conditionalPurchaseItems : conditionalRefinanceItems;

  return (
    <div className="checklist-card gold-scenario-card rounded-2xl p-5">
      <div className="checklist-card__heading">
        <span className="checklist-card__medallion"><FileCheck2 className="h-5 w-5" aria-hidden /></span>
        <div><h3 className="text-lg font-bold text-white">{title}</h3><p className="mt-1 text-sm text-slate-400">{description}</p></div>
      </div>

      <div className="checklist-segmented-control mt-4 inline-flex rounded-full border border-amber-500/40 bg-black/40 p-1 text-xs font-semibold">
        {(["purchase", "refinance"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 capitalize transition-all ${
              tab === t ? "gold-grad-toggle text-black" : "text-slate-300 hover:text-white"
            }`}
          >
            {t === "purchase" ? "Purchase" : "Refinance"}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <ChecklistRows items={tab === "purchase" ? purchaseItems : refinanceItems} />
      </div>

      {conditionalItems && conditionalItems.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/80">{conditionalTitle}</p>
          <div className="mt-2">
            <ChecklistRows items={conditionalItems} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
