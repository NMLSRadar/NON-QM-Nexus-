"use client";

import { useTransition } from "react";
import { openBillingPortal } from "./billing-actions";

/** Opens the Stripe-hosted Customer Portal (payment method, invoices, cancel/resume). */
export function ManageBillingForm() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => openBillingPortal())}
      className="rounded-md bg-slate-100 text-slate-900 text-sm font-medium px-4 py-1.5 hover:bg-slate-200 disabled:opacity-60"
    >
      {pending ? "Opening…" : "Manage billing"}
    </button>
  );
}
