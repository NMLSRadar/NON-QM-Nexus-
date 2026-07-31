"use client";

import { useState, useTransition } from "react";
import { submitBulkMembershipRequest } from "./actions";
import { MAX_BULK_SEATS } from "@/lib/bulkMembership";

export function EnterpriseForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(undefined);
    startTransition(async () => {
      const result = await submitBulkMembershipRequest(formData);
      if (result.error) setError(result.error);
      else setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-300">
        Thanks — your request is in. We&apos;ll follow up shortly to work out seat count and pricing for your team.
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="companyName" className="block text-xs text-slate-400 mb-1">
          Company / brokerage name
        </label>
        <input
          id="companyName"
          name="companyName"
          required
          className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contactName" className="block text-xs text-slate-400 mb-1">
            Your name
          </label>
          <input
            id="contactName"
            name="contactName"
            required
            className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div>
          <label htmlFor="contactEmail" className="block text-xs text-slate-400 mb-1">
            Email
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
            className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contactPhone" className="block text-xs text-slate-400 mb-1">
            Phone (optional)
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div>
          <label htmlFor="seatCountRequested" className="block text-xs text-slate-400 mb-1">
            Approx. number of loan officers
          </label>
          <input
            id="seatCountRequested"
            name="seatCountRequested"
            type="number"
            min={1}
            max={MAX_BULK_SEATS}
            required
            className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className="block text-xs text-slate-400 mb-1">
          Anything else we should know? (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md gold-button gold-cta-glow text-sm font-medium px-5 py-2.5 disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Request a quote"}
      </button>
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </form>
  );
}
