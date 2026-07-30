"use client";

import { useTransition } from "react";
import { cancelCompedOrgSubscription } from "./actions";

export function CancelCompButton({ orgSubscriptionId }: { orgSubscriptionId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          cancelCompedOrgSubscription(orgSubscriptionId);
        })
      }
      className="text-xs text-rose-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Canceling…" : "Cancel"}
    </button>
  );
}
