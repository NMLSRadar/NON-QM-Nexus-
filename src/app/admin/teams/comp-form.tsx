"use client";

import { useActionState } from "react";
import { compOrgSubscription } from "./actions";

interface CompFormState {
  error?: string;
}

export function CompForm({
  organizations,
  plans,
}: {
  organizations: Array<{ id: string; name: string }>;
  plans: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState<CompFormState, FormData>(async (_prev, formData) => compOrgSubscription(formData), {});

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="organizationId" className="block text-xs text-ink-secondary mb-1">
            Organization
          </label>
          <select id="organizationId" name="organizationId" required className="rounded border border-surface-border px-3 py-2 text-sm">
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="planId" className="block text-xs text-ink-secondary mb-1">
            Plan
          </label>
          <select id="planId" name="planId" required className="rounded border border-surface-border px-3 py-2 text-sm">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="seatCount" className="block text-xs text-ink-secondary mb-1">
            Seats
          </label>
          <input id="seatCount" name="seatCount" type="number" min={1} defaultValue={5} required className="w-20 rounded border border-surface-border px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={pending} className="rounded-control bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-60">
          {pending ? "Saving…" : "Grant / update"}
        </button>
      </div>
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
    </form>
  );
}
