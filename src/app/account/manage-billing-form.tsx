"use client";

import { useState, useTransition } from "react";
import { openBillingPortal } from "./billing-actions";

/** Opens the Stripe-hosted Customer Portal (payment method, invoices, cancel/resume). */
export function ManageBillingForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function handleClick() {
    startTransition(async () => {
      const result = await openBillingPortal();
      if (result.url) {
        window.location.href = result.url;
      } else if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="rounded-md bg-slate-100 text-slate-900 text-sm font-medium px-4 py-1.5 hover:bg-slate-200 disabled:opacity-60"
      >
        {pending ? "Opening…" : "Manage billing"}
      </button>
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
