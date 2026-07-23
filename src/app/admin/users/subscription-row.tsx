"use client";

import { useTransition } from "react";
import { assignSubscription } from "./actions";

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
  currentPlanId,
  currentDiscountId,
  plans,
  discounts,
}: {
  userId: string;
  currentPlanId: string | null;
  currentDiscountId: string | null;
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
    </div>
  );
}
