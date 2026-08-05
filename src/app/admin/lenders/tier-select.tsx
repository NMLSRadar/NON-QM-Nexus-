"use client";

import { useTransition } from "react";
import { setLenderTier } from "./actions";

const TIER_LABELS: Record<number, string> = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3",
};

export function TierSelect({ lenderId, tierLevel }: { lenderId: string; tierLevel: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      defaultValue={tierLevel}
      disabled={pending}
      onChange={(e) => startTransition(() => setLenderTier(lenderId, Number(e.target.value)))}
      className="rounded border border-slate-300 text-sm px-2 py-1 disabled:opacity-60"
    >
      {[1, 2, 3].map((t) => (
        <option key={t} value={t}>
          {TIER_LABELS[t] ?? `Tier ${t}`}
        </option>
      ))}
    </select>
  );
}
