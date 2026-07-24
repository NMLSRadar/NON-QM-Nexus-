"use client";

import { useActionState } from "react";
import { reactivateSubscription, type ReactivateSubscriptionState } from "./subscription-actions";

const initialState: ReactivateSubscriptionState = {};

export function ReactivateSubscriptionForm({ label = "Reactivate subscription" }: { label?: string }) {
  const [state, formAction, pending] = useActionState(reactivateSubscription, initialState);

  if (state.success) {
    return (
      <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
        Your subscription is active again — lender-comparison access is restored.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Reactivating…" : label}
      </button>
    </form>
  );
}
