"use client";

import { useActionState, useState } from "react";
import { cancelSubscription, type CancelSubscriptionState } from "./subscription-actions";

const initialState: CancelSubscriptionState = {};

export function CancelSubscriptionForm({ isStripe = false }: { isStripe?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(cancelSubscription, initialState);

  if (state.success) {
    return (
      <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
        {isStripe
          ? "Your subscription is set to cancel at the end of the current billing period — you keep access until then."
          : "Your subscription has been canceled. You've lost lender-comparison access immediately — contact us if you'd like to reactivate."}
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-rose-700 hover:text-rose-900 underline"
      >
        Cancel subscription
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-slate-700">
        {isStripe
          ? "Are you sure? You'll keep access until the end of your current billing period, then it cancels — no further charges. You can resume any time before then."
          : "Are you sure? You'll immediately lose access to lender comparisons. This can't be undone yourself — you'd need to contact us to reactivate."}
      </p>
      {state.error ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{state.error}</p> : null}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-rose-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-rose-700 disabled:opacity-60"
        >
          {pending ? "Canceling…" : "Yes, cancel my subscription"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-md bg-slate-100 text-slate-900 text-sm font-medium px-4 py-1.5 hover:bg-slate-200"
        >
          Never mind
        </button>
      </div>
    </form>
  );
}
