"use client";

import { useState, useTransition } from "react";
import { adminOverrideActivateTrial } from "./actions";

export function AdminOverrideForm({ campaignSlugs }: { campaignSlugs: string[] }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        const formData = new FormData(e.currentTarget);
        const email = String(formData.get("email") ?? "");
        const slug = String(formData.get("slug") ?? "");
        startTransition(async () => {
          const result = await adminOverrideActivateTrial(email, slug);
          if (result.error) setError(result.error);
          else {
            setSuccess(true);
            (e.target as HTMLFormElement).reset();
          }
        });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Existing user&apos;s email</label>
        <input name="email" type="email" required className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Campaign</label>
        <select name="slug" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {campaignSlugs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60">
        {pending ? "Activating…" : "Override & activate trial"}
      </button>
      {error ? <p className="text-xs text-rose-700 w-full">{error}</p> : null}
      {success ? <p className="text-xs text-emerald-700 w-full">Trial activated for this user, bypassing the duplicate-trial check.</p> : null}
    </form>
  );
}
