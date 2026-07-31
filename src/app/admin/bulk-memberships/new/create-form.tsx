"use client";

import { useState, useTransition } from "react";
import { createBulkMembership } from "../actions";
import { MAX_BULK_SEATS } from "@/lib/bulkMembership";

export function CreateBulkMembershipForm({
  defaultCompanyName,
  defaultContactName,
  defaultContactEmail,
  defaultSeatCount,
  requestId,
}: {
  defaultCompanyName?: string;
  defaultContactName?: string;
  defaultContactEmail?: string;
  defaultSeatCount?: number;
  requestId?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [checkoutUrl, setCheckoutUrl] = useState<string>();
  const [invoiceUrl, setInvoiceUrl] = useState<string>();
  const [billingMode, setBillingMode] = useState("custom_stripe");

  function handleSubmit(formData: FormData) {
    setError(undefined);
    setCheckoutUrl(undefined);
    setInvoiceUrl(undefined);
    startTransition(async () => {
      const result = await createBulkMembership(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setCheckoutUrl(result.checkoutUrl);
        setInvoiceUrl(result.invoiceUrl);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4 max-w-lg">
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
      <div>
        <label htmlFor="companyName" className="block text-xs text-ink-secondary mb-1">
          Company name
        </label>
        <input
          id="companyName"
          name="companyName"
          defaultValue={defaultCompanyName}
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contactName" className="block text-xs text-ink-secondary mb-1">
            Contact name
          </label>
          <input
            id="contactName"
            name="contactName"
            defaultValue={defaultContactName}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="contactEmail" className="block text-xs text-ink-secondary mb-1">
            Contact email
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={defaultContactEmail}
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="seatCount" className="block text-xs text-ink-secondary mb-1">
            Seat count (1-{MAX_BULK_SEATS})
          </label>
          <input
            id="seatCount"
            name="seatCount"
            type="number"
            min={1}
            max={MAX_BULK_SEATS}
            defaultValue={defaultSeatCount}
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="pricePerSeatCents" className="block text-xs text-ink-secondary mb-1">
            Negotiated price / seat / month ($)
          </label>
          <input
            id="pricePerSeatCents"
            name="pricePerSeatCentsDollars"
            type="number"
            min={0}
            step="0.01"
            required
            onChange={(e) => {
              const hidden = document.getElementById("pricePerSeatCentsHidden") as HTMLInputElement | null;
              if (hidden) hidden.value = String(Math.round(Number(e.target.value) * 100));
            }}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input type="hidden" id="pricePerSeatCentsHidden" name="pricePerSeatCents" defaultValue={0} />
        </div>
      </div>
      <div>
        <span className="block text-xs text-ink-secondary mb-1">Billing mode</span>
        <div className="flex gap-4 text-sm">
          {[
            { value: "custom_stripe", label: "Card (Stripe Checkout link)" },
            { value: "invoiced", label: "Invoiced (NET-30)" },
            { value: "comped", label: "Comped (free pilot)" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="billingMode"
                value={opt.value}
                checked={billingMode === opt.value}
                onChange={() => setBillingMode(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
      <button type="submit" disabled={pending} className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-60">
        {pending ? "Creating…" : "Create Bulk Membership"}
      </button>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {checkoutUrl ? (
        <p className="text-xs text-emerald-700">
          Checkout link created and emailed to the contact —{" "}
          <a href={checkoutUrl} target="_blank" rel="noreferrer" className="underline">
            copy it here too
          </a>
          .
        </p>
      ) : null}
      {invoiceUrl ? (
        <p className="text-xs text-emerald-700">
          Invoice sent —{" "}
          <a href={invoiceUrl} target="_blank" rel="noreferrer" className="underline">
            view it here too
          </a>
          .
        </p>
      ) : null}
    </form>
  );
}
