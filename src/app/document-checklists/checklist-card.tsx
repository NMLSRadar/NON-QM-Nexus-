"use client";

import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import type { NeedsListItem } from "@/domain/types/results";

function ChecklistRows({ items }: { items: NeedsListItem[] }) {
  const sorted = [...items].sort((a, b) => Number(b.required) - Number(a.required));
  return (
    <ul className="space-y-2.5">
      {sorted.map((n, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          <FileCheck2 className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-white">{n.label}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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
}: {
  title: string;
  description: string;
  purchaseItems: NeedsListItem[];
  refinanceItems: NeedsListItem[];
}) {
  const [tab, setTab] = useState<"purchase" | "refinance">("purchase");
  return (
    <div className="gold-scenario-card rounded-2xl border border-white/10 bg-[#0d0d0f] p-5">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>

      <div className="mt-4 inline-flex rounded-full border border-white/10 bg-black/40 p-1 text-xs font-semibold">
        {(["purchase", "refinance"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 capitalize transition-colors ${
              tab === t ? "bg-amber-500 text-black" : "text-slate-300 hover:text-white"
            }`}
          >
            {t === "purchase" ? "Purchase" : "Refinance"}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <ChecklistRows items={tab === "purchase" ? purchaseItems : refinanceItems} />
      </div>
    </div>
  );
}
