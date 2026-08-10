"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GuidelinePosture, PricingTendency } from "@/domain/lenderPosture";
import { upsertPostureDefault } from "./actions";

interface EditableProfile {
  canonicalName: string;
  posture: GuidelinePosture;
  pricingTendency: PricingTendency;
  postureNotes: string;
  exceptionsConsidered: boolean;
  exceptionChannel: string;
  aliases: string[];
}

export function PostureEditor({ profile }: { profile: EditableProfile }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(profile);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function save(markReviewed: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await upsertPostureDefault({ ...form, markReviewed, exceptionChannel: form.exceptionChannel || undefined });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full border border-amber-500/25 px-3 py-1 text-xs text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
      >
        Edit / review
      </button>
    );
  }

  return (
    <div className="w-full max-w-md space-y-2 rounded-control border border-amber-500/20 p-3 text-xs">
      <label className="block text-slate-400">
        Posture
        <select
          value={form.posture}
          onChange={(e) => setForm({ ...form, posture: e.target.value as GuidelinePosture, exceptionsConsidered: e.target.value === "exception_based" })}
          className="mt-1 w-full rounded border border-amber-500/25 bg-black/40 px-2 py-1 text-white"
        >
          <option value="exception_based">Exception-friendly</option>
          <option value="moderate">Moderate flexibility</option>
          <option value="rigid">Rigid guidelines</option>
        </select>
      </label>
      <label className="block text-slate-400">
        Pricing tendency (directional only — never a figure)
        <select
          value={form.pricingTendency}
          onChange={(e) => setForm({ ...form, pricingTendency: e.target.value as PricingTendency })}
          className="mt-1 w-full rounded border border-amber-500/25 bg-black/40 px-2 py-1 text-white"
        >
          <option value="typically_more_aggressive">Typically more aggressive (flexibility premium)</option>
          <option value="typically_mid">Typically mid</option>
          <option value="typically_better_priced">Typically better priced</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>
      <label className="block text-slate-400">
        Notes
        <textarea
          value={form.postureNotes}
          onChange={(e) => setForm({ ...form, postureNotes: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded border border-amber-500/25 bg-black/40 px-2 py-1 text-white"
        />
      </label>
      <label className="block text-slate-400">
        Exception channel
        <input
          value={form.exceptionChannel}
          onChange={(e) => setForm({ ...form, exceptionChannel: e.target.value })}
          placeholder="e.g. AE submission, credit committee"
          className="mt-1 w-full rounded border border-amber-500/25 bg-black/40 px-2 py-1 text-white"
        />
      </label>
      {error && <p className="text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => save(true)} className="rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-1 font-medium text-black disabled:opacity-40">
          {pending ? "Saving…" : "Save + mark reviewed"}
        </button>
        <button type="button" disabled={pending} onClick={() => save(false)} className="rounded-full border border-amber-500/25 px-3 py-1 text-slate-300 disabled:opacity-40">
          Save only
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-1 text-slate-500">
          Cancel
        </button>
      </div>
    </div>
  );
}
