"use client";

import { useState, useTransition } from "react";
import { createTrialCampaign } from "./actions";

export function CreateCampaignForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createTrialCampaign(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Campaign name</label>
          <input name="name" required placeholder="e.g. Loan Officer Beta Testing" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">URL slug</label>
          <input name="slug" required placeholder="e.g. loan-officer-beta" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
        <input name="description" placeholder="Shown on the trial landing page" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Trial length (days)</label>
          <input name="trialDurationDays" type="number" defaultValue={14} min={1} max={90} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Max redemptions</label>
          <input name="maxRedemptions" type="number" min={1} placeholder="Unlimited" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Starts (optional)</label>
          <input name="startsAt" type="date" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Ends (optional)</label>
          <input name="endsAt" type="date" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Allowed email domains (comma-separated, optional)</label>
        <input name="allowedEmailDomains" placeholder="e.g. acmebrokerage.com, acmelending.com" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" name="requireOnePerEmail" defaultChecked className="rounded border-slate-300" /> One redemption per email
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" name="requireNmls" className="rounded border-slate-300" /> Require NMLS number
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" name="requireCompany" className="rounded border-slate-300" /> Require company name
        </label>
      </div>
      {error ? <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{error}</p> : null}
      {success ? <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">Campaign created.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}
