"use client";

import { useTransition } from "react";
import { revokeInvite } from "./actions";

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

export function InvitesList({ invites }: { invites: InviteRow[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      {invites.map((invite) => (
        <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
          <div>
            <p className="text-sm text-white">{invite.email}</p>
            <p className="text-xs text-slate-400">
              {invite.role.replace(/_/g, " ")} · expires {new Date(invite.expiresAt).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => revokeInvite(invite.id))}
            className="text-xs text-rose-400 hover:text-rose-300 underline disabled:opacity-50"
          >
            Revoke
          </button>
        </div>
      ))}
    </div>
  );
}
