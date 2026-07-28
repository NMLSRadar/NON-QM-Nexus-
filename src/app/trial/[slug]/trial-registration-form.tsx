"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** localStorage key holding the pending trial registration's details
 * across the email-confirmation round-trip (this Supabase project
 * requires email confirmation before a session exists — mailer_autoconfirm
 * is off — so activation can only happen once the user clicks the
 * confirmation link and returns, not at this form's submit time). Cleared
 * once activation succeeds (see the /trial/[slug]/activate page). */
export const PENDING_TRIAL_KEY = "nqn_pending_trial_registration";

export interface PendingTrialRegistration {
  campaignSlug: string;
  email: string;
  normalizedEmail: string;
  firstName: string;
  lastName: string;
  companyName: string;
  nmlsNumber: string;
  state: string;
}

export function TrialRegistrationForm({
  campaignSlug,
  campaignName,
  trialDurationDays,
  requireNmls,
  requireCompany,
}: {
  campaignSlug: string;
  campaignName: string;
  trialDurationDays: number;
  requireNmls: boolean;
  requireCompany: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const companyName = String(form.get("companyName") ?? "").trim();
    const nmlsNumber = String(form.get("nmlsNumber") ?? "").trim();
    const state = String(form.get("state") ?? "").trim().toUpperCase();

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (requireNmls && !nmlsNumber) {
      setError("An NMLS number is required for this trial.");
      return;
    }
    if (requireCompany && !companyName) {
      setError("A company name is required for this trial.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/trial/${campaignSlug}/activate`,
      },
    });
    setPending(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    const pendingRegistration: PendingTrialRegistration = {
      campaignSlug,
      email,
      normalizedEmail: email.toLowerCase().trim(),
      firstName,
      lastName,
      companyName,
      nmlsNumber,
      state,
    };
    try {
      window.localStorage.setItem(PENDING_TRIAL_KEY, JSON.stringify(pendingRegistration));
    } catch {
      // localStorage unavailable (e.g. private-browsing edge case) — the
      // activation page falls back to activating with no extra profile
      // fields rather than failing outright.
    }
    setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <div className="text-center space-y-3">
        <p className="text-base font-semibold text-white">Check your email</p>
        <p className="text-sm text-slate-400">
          We sent a confirmation link to activate your account. Click it to start your {trialDurationDays}-day{" "}
          {campaignName} trial immediately — no credit card, nothing to cancel.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="firstName" className="block text-xs font-medium text-slate-300 mb-1">
            First name
          </label>
          <input id="firstName" name="firstName" required className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-1.5 text-sm text-white" />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-xs font-medium text-slate-300 mb-1">
            Last name
          </label>
          <input id="lastName" name="lastName" required className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-1.5 text-sm text-white" />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1">
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-1.5 text-sm text-white" />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-1.5 text-sm text-white"
        />
        <p className="text-[11px] text-slate-500 mt-1">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="companyName" className="block text-xs font-medium text-slate-300 mb-1">
          Company name{requireCompany ? "" : " (optional)"}
        </label>
        <input id="companyName" name="companyName" required={requireCompany} className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-1.5 text-sm text-white" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="nmlsNumber" className="block text-xs font-medium text-slate-300 mb-1">
            NMLS number{requireNmls ? "" : " (optional)"}
          </label>
          <input id="nmlsNumber" name="nmlsNumber" required={requireNmls} className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-1.5 text-sm text-white" />
        </div>
        <div>
          <label htmlFor="state" className="block text-xs font-medium text-slate-300 mb-1">
            Primary state (optional)
          </label>
          <input id="state" name="state" maxLength={2} placeholder="FL" className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-1.5 text-sm text-white" />
        </div>
      </div>

      {error ? <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-2">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="gold-button gold-cta-glow w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Creating your trial account…" : `Start my ${trialDurationDays}-day free trial`}
      </button>
    </form>
  );
}
