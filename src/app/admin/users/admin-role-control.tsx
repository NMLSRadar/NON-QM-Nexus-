"use client";

import { useState, useTransition } from "react";
import { resendPlatformAdminInvite, revokePendingPlatformAdminInvite, setPlatformAdminRole } from "./actions";

export function AdminRoleControl({
  userId,
  email,
  isAdmin,
  isCurrentUser,
  isPendingInvite,
}: {
  userId: string;
  email: string;
  isAdmin: boolean;
  isCurrentUser: boolean;
  isPendingInvite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  function run(action: () => Promise<{ error?: string; message?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result.error ? { tone: "error", text: result.error } : { tone: "success", text: result.message ?? "Saved." });
    });
  }

  if (isPendingInvite) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run(() => resendPlatformAdminInvite(userId))} className="rounded-md border border-amber-500/30 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">
            {pending ? "Working…" : "Resend invite"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Revoke the pending administrator invitation for ${email}?`)) run(() => revokePendingPlatformAdminInvite(userId));
            }}
            className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Revoke
          </button>
        </div>
        {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`text-xs ${feedback.tone === "error" ? "text-rose-300" : "text-emerald-300"}`}>{feedback.text}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <select
        aria-label={`Role for ${email}`}
        value={isAdmin ? "admin" : "user"}
        disabled={pending || isCurrentUser}
        onChange={(event) => {
          const makeAdmin = event.target.value === "admin";
          const verb = makeAdmin ? "grant platform administrator access to" : "remove platform administrator access from";
          if (window.confirm(`Are you sure you want to ${verb} ${email}?`)) run(() => setPlatformAdminRole(userId, makeAdmin));
        }}
        className="rounded-md border border-amber-500/25 bg-black/50 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="user">Standard user</option>
        <option value="admin">Platform admin</option>
      </select>
      {isCurrentUser ? <p className="text-[11px] text-slate-500">Your own role is protected.</p> : null}
      {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`text-xs ${feedback.tone === "error" ? "text-rose-300" : "text-emerald-300"}`}>{feedback.text}</p> : null}
    </div>
  );
}
