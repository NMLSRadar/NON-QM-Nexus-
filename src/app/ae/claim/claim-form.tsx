"use client";

import { useActionState, useState } from "react";
import { claimAeProfile, type ClaimResult } from "./actions";

interface ProfileOption {
  id: string;
  name: string;
  title: string | null;
  email: string;
  lenderName: string;
}

const initialState: ClaimResult = {};

export function ClaimForm({ profiles }: { profiles: ProfileOption[] }) {
  const [state, formAction] = useActionState(claimAeProfile, initialState);
  const [query, setQuery] = useState("");

  const filtered = profiles.filter((p) => `${p.name} ${p.lenderName} ${p.email}`.toLowerCase().includes(query.toLowerCase()));

  if (state.autoApproved !== undefined) {
    return (
      <div className="gold-panel rounded-2xl p-5">
        {state.autoApproved ? (
          <p className="text-emerald-400">Your claim was approved instantly — visit your AE dashboard to edit your profile.</p>
        ) : (
          <p className="text-amber-300">Your claim was submitted and is pending admin review. We&apos;ll notify you once it&apos;s approved.</p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input
        type="text"
        placeholder="Search by name or lender…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white"
      />
      <div className="max-h-72 overflow-y-auto space-y-1 gold-panel rounded-xl p-2">
        {filtered.length === 0 ? <p className="text-sm text-slate-500 p-2">No unclaimed profiles match.</p> : null}
        {filtered.map((p) => (
          <label key={p.id} className="flex items-center gap-2 p-2 rounded hover:bg-amber-500/5 cursor-pointer text-sm">
            <input type="radio" name="profileId" value={p.id} required />
            <span className="text-white">{p.name}</span>
            <span className="text-slate-500">
              — {p.title ?? "AE"} · {p.lenderName} · {p.email}
            </span>
          </label>
        ))}
      </div>
      {state.error ? <p className="text-sm text-rose-400">{state.error}</p> : null}
      <button type="submit" className="gold-button rounded-full px-5 py-2.5 text-sm font-semibold">
        Claim this profile
      </button>
    </form>
  );
}
