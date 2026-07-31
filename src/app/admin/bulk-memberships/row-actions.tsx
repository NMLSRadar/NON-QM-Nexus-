"use client";

import { useTransition } from "react";
import { updateRequestStatus, sendNextBulkInvoice, cancelBulkMembership } from "./actions";

export function RequestRowActions({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <a href={`/admin/bulk-memberships/new?requestId=${requestId}`} className="text-xs text-blue-600 hover:underline">
        Convert
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void updateRequestStatus(requestId, "contacted");
          })
        }
        className="text-xs text-slate-500 hover:underline disabled:opacity-50"
      >
        Mark contacted
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void updateRequestStatus(requestId, "declined");
          })
        }
        className="text-xs text-rose-600 hover:underline disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}

export function SendNextInvoiceButton({ orgSubscriptionId }: { orgSubscriptionId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          void sendNextBulkInvoice(orgSubscriptionId);
        })
      }
      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send next invoice"}
    </button>
  );
}

export function CancelBulkButton({ orgSubscriptionId }: { orgSubscriptionId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          void cancelBulkMembership(orgSubscriptionId);
        })
      }
      className="text-xs text-rose-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Canceling…" : "Cancel"}
    </button>
  );
}
