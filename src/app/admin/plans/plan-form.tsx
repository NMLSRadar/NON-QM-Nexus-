"use client";

import { useActionState } from "react";
import { upsertPlan, type PlanFormState } from "./actions";

interface PlanFormProps {
  plan?: {
    id: string;
    key: string;
    name: string;
    monthly_price_cents: number;
    tier_level: number;
    description: string | null;
    sort_order: number;
  };
}

const initialState: PlanFormState = {};

export function PlanForm({ plan }: PlanFormProps) {
  const [state, formAction, pending] = useActionState(upsertPlan, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Key (stable, no spaces)</label>
          <input
            name="key"
            defaultValue={plan?.key}
            required
            disabled={Boolean(plan)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Display name</label>
          <input name="name" defaultValue={plan?.name} required className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Monthly price (USD)</label>
          <input
            name="monthlyPriceDollars"
            type="number"
            min="0"
            step="0.01"
            defaultValue={plan ? plan.monthly_price_cents / 100 : undefined}
            required
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Lender tier level (1, 2, 3, ...)</label>
          <input
            name="tierLevel"
            type="number"
            min="1"
            defaultValue={plan?.tier_level}
            required
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
          <input
            name="description"
            defaultValue={plan?.description ?? undefined}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Sort order</label>
          <input
            name="sortOrder"
            type="number"
            defaultValue={plan?.sort_order ?? 0}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : plan ? "Save changes" : "Create plan"}
      </button>
    </form>
  );
}
