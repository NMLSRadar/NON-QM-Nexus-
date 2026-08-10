"use client";

import { useState, useTransition } from "react";
import { upsertPostureProfile, deletePostureProfile, markPostureReviewed } from "./actions";
import type { GuidelinePosture, PricingTendency } from "@/domain/lenderPosture";

export interface PostureProfileValue {
  lenderId: string;
  posture?: GuidelinePosture;
  pricingTendency?: PricingTendency;
  exceptionsConsidered?: boolean;
  exceptionChannel?: string;
  postureNotes?: string;
  isVerified?: boolean;
  lastReviewedAt?: string | null;
  profileId?: string;
}

const POSTURES: GuidelinePosture[] = ["exception_based", "moderate", "rigid"];
const PRICING: PricingTendency[] = ["typically_more_aggressive", "typically_mid", "typically_better_priced", "unknown"];

function stale(lastReviewedAt?: string | null): boolean {
  if (!lastReviewedAt) return true;
  const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  return new Date(lastReviewedAt).getTime() < cutoff;
}

export function PostureForm({ value }: { value: PostureProfileValue }) {
  const [pending, startTransition] = useTransition();
  const [posture, setPosture] = useState<GuidelinePosture>(value.posture ?? "moderate");
  const [pricing, setPricing] = useState<PricingTendency>(value.pricingTendency ?? "unknown");
  const [exceptions, setExceptions] = useState(value.exceptionsConsidered ?? false);
  const [channel, setChannel] = useState(value.exceptionChannel ?? "");
  const [notes, setNotes] = useState(value.postureNotes ?? "");

  const isStale = stale(value.lastReviewedAt);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() =>
          upsertPostureProfile({
            lenderId: value.lenderId,
            posture,
            pricingTendency: pricing,
            exceptionsConsidered: exceptions,
            exceptionChannel: channel || undefined,
            postureNotes: notes || undefined,
          }),
        );
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <select
        value={posture}
        onChange={(e) => setPosture(e.target.value as GuidelinePosture)}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        aria-label="Posture"
      >
        {POSTURES.map((p) => (
          <option key={p} value={p}>
            {p.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <select
        value={pricing}
        onChange={(e) => setPricing(e.target.value as PricingTendency)}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        aria-label="Pricing tendency"
      >
        {PRICING.map((p) => (
          <option key={p} value={p}>
            {p.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={exceptions} onChange={(e) => setExceptions(e.target.checked)} className="rounded border-slate-300" />
        Considers exceptions
      </label>
      {exceptions && (
        <input
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="Channel (e.g. AE submission)"
          className="w-40 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        />
      )}
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Posture notes"
        className="w-56 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : value.profileId ? "Update" : "Create"}
      </button>
      {isStale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">possibly stale</span>}
      {value.profileId && (
        <>
          <button
            type="button"
            onClick={() => startTransition(() => markPostureReviewed(value.profileId!))}
            disabled={pending}
            className="rounded-full border border-slate-300 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Mark reviewed
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => deletePostureProfile(value.profileId!))}
            disabled={pending}
            className="rounded-full border border-rose-200 px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
          </button>
        </>
      )}
    </form>
  );
}