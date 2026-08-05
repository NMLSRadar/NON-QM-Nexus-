"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { invitePlatformAdmin } from "./actions";

export function AdminInviteForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await invitePlatformAdmin(email);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Invitation sent.");
      setEmail("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor="admin-invite-email" className="mb-1.5 block text-sm font-medium text-slate-200">
            Email address
          </label>
          <input
            id="admin-invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="newadmin@company.com"
            autoComplete="email"
            required
            disabled={pending}
            className="w-full rounded-lg border border-amber-500/25 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-600 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_0_24px_rgba(245,158,11,0.14)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {pending ? "Sending…" : "Invite administrator"}
        </button>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        New members receive a secure email link to choose a password. Existing users are promoted immediately.
      </p>
      {error ? <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</p> : null}
    </form>
  );
}
