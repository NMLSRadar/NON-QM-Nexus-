"use client";

import { useTransition } from "react";
import { setCampaignActive } from "./actions";

export function CampaignActiveToggle({ campaignId, isActive }: { campaignId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
      <input
        type="checkbox"
        checked={isActive}
        disabled={pending}
        onChange={(e) => startTransition(() => setCampaignActive(campaignId, e.target.checked))}
        className="rounded border-slate-300"
      />
      {pending ? "Saving…" : isActive ? "Active" : "Inactive"}
    </label>
  );
}
