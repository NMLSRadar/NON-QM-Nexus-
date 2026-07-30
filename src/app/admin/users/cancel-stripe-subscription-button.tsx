"use client";

import { useState, useTransition } from "react";
import { cancelStripeSubscriptionAdmin } from "./actions";

/** Admin-side button to immediately cancel a user's LIVE Stripe
 * subscription via stripe.subscriptions.cancel() — only rendered for a
 * subscription whose source is "stripe" (see subscription-row.tsx); a
 * comped subscription has no Stripe object to cancel here. Asks for a
 * short reason (stored on the audit_logs entry) and a confirmation,
 * since this is an immediate/irreversible action on a real paid
 * subscription, not the customer's own graceful cancel-at-period-end. */
export function CancelStripeSubscriptionButton({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    const reason = window.prompt(`Reason for immediately canceling ${userEmail}'s Stripe subscription (stored in the audit log):`, "");
    if (reason === null) return; // canceled the prompt
    if (!window.confirm(`This ends ${userEmail}'s billing access with Stripe right now — no grace period. Continue?`)) return;

    setError(null);
    startTransition(async () => {
      const result = await cancelStripeSubscriptionAdmin(userId, reason);
      if (result.error) setError(result.error);
    });
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="text-xs text-rose-600 hover:underline disabled:opacity-50"
      >
        {pending ? "Canceling…" : "Cancel Stripe subscription"}
      </button>
      {error ? <span className="text-xs text-rose-700">{error}</span> : null}
    </span>
  );
}
