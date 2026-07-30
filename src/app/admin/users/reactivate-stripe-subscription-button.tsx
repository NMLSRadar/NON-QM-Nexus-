"use client";

import { useState, useTransition } from "react";
import { reactivateStripeSubscriptionAdmin } from "./actions";

/** Admin-side button to reactivate a canceled Stripe-sourced subscription
 * — only rendered when the subscription's source is "stripe" AND it's
 * currently canceled (see subscription-row.tsx). The real Stripe path
 * (resume vs. recreate a new subscription) is decided server-side, based
 * on the subscription's real current Stripe status, not guessed here. */
export function ReactivateStripeSubscriptionButton({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = () => {
    const reason = window.prompt(`Reason for reactivating ${userEmail}'s Stripe subscription (stored in the audit log):`, "");
    if (reason === null) return; // canceled the prompt
    if (!window.confirm(`Reactivate ${userEmail}'s subscription now?`)) return;

    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await reactivateStripeSubscriptionAdmin(userId, reason);
      if (result.error) setError(result.error);
      else if (result.message) setMessage(result.message);
    });
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="text-brand-700 hover:underline disabled:opacity-60"
      >
        {pending ? "Reactivating…" : "Reactivate Stripe subscription"}
      </button>
      {error ? <span className="text-xs text-rose-700">{error}</span> : null}
      {message ? <span className="text-xs text-emerald-700">{message}</span> : null}
    </span>
  );
}
