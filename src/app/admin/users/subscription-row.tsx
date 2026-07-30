"use client";

import { useTransition } from "react";
import { assignSubscription, reactivateSubscription } from "./actions";
import { CancelStripeSubscriptionButton } from "./cancel-stripe-subscription-button";

interface Plan {
  id: string;
  name: string;
}
interface Discount {
  id: string;
  name: string;
}

export function SubscriptionRow({
  userId,
  userEmail,
  currentPlanId,
  currentDiscountId,
  canceledAt,
  isLiveStripeSubscription,
  plans,
  discounts,
}: {
  userId: string;
  userEmail: string;
  currentPlanId: string | null;
  currentDiscountId: string | null;
  canceledAt: string | null;
  isLiveStripeSubscription: boolean;
  plans: Plan[];
  discounts: Discount[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        defaultValue={currentPlanId ?? ""}
        disabled={pending}
        className="rounded border border-slate-300 text-sm px-2 py-1 disabled:opacity-60"
        onChange={(e) =>
          startTransition(() => assignSubscription(userId, e.target.value || null, currentDiscountId))
        }
      >
        <option value="">No plan</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        defaultValue={currentDiscountId ?? ""}
        disabled={pending}
        className="rounded border border-slate-300 text-sm px-2 py-1 disabled:opacity-60"
        onChange={(e) => startTransition(() => assignSubscription(userId, currentPlanId, e.target.value || null))}
      >
        <option value="">No discount</option>
        {discounts.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {canceledAt ? (
        <span className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-200 text-slate-700 px-2 py-0.5">
            Canceled {new Date(canceledAt).toLocaleDateString()}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => reactivateSubscription(userId))}
            className="text-brand-700 hover:underline disabled:opacity-60"
          >
            Reactivate
          </button>
        </span>
      ) : currentPlanId ? (
        <span className="flex items-center gap-2">
          <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">Active</span>
          {isLiveStripeSubscription ? <CancelStripeSubscriptionButton userId={userId} userEmail={userEmail} /> : null}
        </span>
      ) : null}
    </div>
  );
}
