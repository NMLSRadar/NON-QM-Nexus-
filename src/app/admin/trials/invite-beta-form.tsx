"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { inviteBetaTester } from "./actions";

/**
 * Streamlined beta flow (2026-08-10): admin types an email + picks a
 * campaign and an invitation email goes out automatically. The invitee
 * does NOT need to sign up first — from the email they either create
 * their account (new invitee) or sign in (existing account), and the
 * trial starts automatically either way.
 */
export function InviteBetaForm({ campaignSlugs }: { campaignSlugs: string[] }) {
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState(campaignSlugs[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await inviteBetaTester(email, slug);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Invite sent.");
      setEmail("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="invite-email" className="block text-xs font-medium text-slate-600 mb-1">
            Loan officer&apos;s email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="loan.officer@lender.com"
            autoComplete="off"
            required
            disabled={pending}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="invite-campaign" className="block text-xs font-medium text-slate-600 mb-1">
            Campaign
          </label>
          <select
            id="invite-campaign"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            required
            disabled={pending}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          >
            {campaignSlugs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending || !email.trim() || !slug}
          className="inline-flex items-center gap-2 rounded bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
        >
          <Mail className="h-4 w-4" aria-hidden />
          {pending ? "Sending…" : "Send beta invite"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        An email goes out automatically. The loan officer creates their account (or signs in) from that email — no
        pre-registration needed — and the trial activates by itself.
      </p>
      {error ? <p className="text-xs text-rose-700 w-full">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700 w-full">{message}</p> : null}
    </form>
  );
}