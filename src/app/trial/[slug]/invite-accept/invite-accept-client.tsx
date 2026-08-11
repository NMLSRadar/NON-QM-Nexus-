"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendTrialActivationEmailIfNeeded } from "../activate/actions";
import { consumeTrialInvite } from "./actions";

type Status = "establishing" | "setup" | "login" | "checkemail" | "activating" | "success" | "error";

/**
 * Invite-accept flow (streamlined beta, 2026-08-10). The page is reached
 * only with a valid, server-validated app-invite token (see page.tsx); this
 * client gets a pre-validated immutable inviteEmail + starting mode.
 *
 * - New invitee: create account (choose password) → a Supabase confirmation
 *   email goes out (this project requires email confirmation) → they return
 *   here → session exists → trial activates.
 * - Existing account: sign in (password) or a magic sign-in link → session
 *   exists → trial activates.
 * - Either path may also arrive already signed-in (e.g. they were logged in,
 *   or are returning from a confirmation/sign-in redirect that carried the
 *   session tokens in the URL hash) → the trial activates immediately.
 *
 * The activation is always gated on the signed-in email matching the invite
 * email — an invite can't be redeemed by a different logged-in account.
 */
export function InviteAcceptClient({
  campaignSlug,
  campaignName,
  trialDurationDays,
  requireNmls,
  requireCompany,
  inviteToken,
  inviteEmail,
  mode,
}: {
  campaignSlug: string;
  campaignName: string;
  trialDurationDays: number;
  requireNmls: boolean;
  requireCompany: boolean;
  inviteToken: string;
  inviteEmail: string;
  mode: "new" | "existing";
}) {
  const [status, setStatus] = useState<Status>("establishing");
  const [flowMode, setFlowMode] = useState<"new" | "existing">(mode);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkEmailMessage, setCheckEmailMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const normalizedInviteEmail = inviteEmail.toLowerCase().trim();

  /** Activate the (now signed-in) user's trial via activate_trial, stamped
   * as a beta tester. Called after a new invitee confirms+returns, or right
   * after an existing account signs in. */
  async function activate(profile: Record<string, string>) {
    setStatus("activating");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setStatus("error");
      setMessage("We couldn’t confirm your account from this link. Try signing in directly.");
      return;
    }
    if (user.email.toLowerCase().trim() !== normalizedInviteEmail) {
      setStatus("error");
      setMessage(`This invite is for ${inviteEmail}. Sign out and open the invite link again from that account.`);
      return;
    }

    const { data, error: actErr } = await supabase.rpc("activate_trial", {
      p_campaign_slug: campaignSlug,
      p_normalized_email: user.email.toLowerCase().trim(),
      p_first_name: profile.firstName || null,
      p_last_name: profile.lastName || null,
      p_company_name: profile.companyName || null,
      p_nmls_number: profile.nmlsNumber || null,
      p_state: profile.state || null,
      // Reached only via an admin beta-invite link — the invitee IS a beta
      // tester, so flag them (the ordinary /trial/[slug] signup does not pass
      // this and stays non-beta).
      p_is_beta: true,
    });

    if (actErr) {
      setStatus("error");
      setMessage(actErr.message);
      return;
    }

    setStatus("success");
    setMessage(
      data && Array.isArray(data) && data[0]?.expires_at
        ? `Full access until ${new Date(data[0].expires_at).toLocaleDateString()}.`
        : "Full access has started."
    );
    // Consume the invite token so a used invite link can't be redeemed again.
    consumeTrialInvite(inviteToken, campaignSlug).catch(() => {
      // best-effort — never block activation on the token cleanup
    });
    sendTrialActivationEmailIfNeeded().catch(() => {
      // best-effort — never block the redirect on email delivery
    });
    setTimeout(() => {
      window.location.href = "/scenarios";
    }, 2500);
  }

  useEffect(() => {
    const supabase = createClient();

    async function establishSession() {
      // Same hash-token pattern as the trial activation / reset-password
      // pages: parse the confirmation / sign-in tokens ourselves instead of
      // relying only on SDK auto-detection, which can race the cookie-backed
      // @supabase/ssr client.
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        await activate({});
      } else {
        // No session: show the create-account (new) or sign-in (existing) UI.
        setStatus(flowMode === "existing" ? "login" : "setup");
      }
    }

    establishSession().catch(() => {
      setStatus("error");
      setMessage("Something went wrong verifying your link. Please try again.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Build the return URL (keeps the validated invite token so the post
   * confirmation/sign-in return re-lands on this validated page with a
   * session) for both signUp and magic-link flows. */
  function returnUrl(): string {
    return `${window.location.origin}/trial/${campaignSlug}/invite-accept?token=${encodeURIComponent(inviteToken)}`;
  }

  async function handleSetupSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setSubmitting(false);
      return;
    }
    const profile = {
      firstName: String(form.get("firstName") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
      companyName: String(form.get("companyName") ?? "").trim(),
      nmlsNumber: String(form.get("nmlsNumber") ?? "").trim(),
      state: String(form.get("state") ?? "").trim().toUpperCase(),
    };
    if (requireCompany && !profile.companyName) {
      setError("A company name is required for this trial.");
      setSubmitting(false);
      return;
    }
    if (requireNmls && !profile.nmlsNumber) {
      setError("An NMLS number is required for this trial.");
      setSubmitting(false);
      return;
    }

    const { error: signUpErr } = await createClient().auth.signUp({
      email: inviteEmail,
      password,
      options: { emailRedirectTo: returnUrl() },
    });
    setSubmitting(false);

    if (signUpErr) {
      setError(signUpErr.message);
      // The address may already be registered in auth (e.g. an earlier
      // broken invite created it) even though we derived "new" — surface a
      // path over to the sign-in form rather than a dead end.
      if (/already registered|already been registered/i.test(signUpErr.message)) {
        setFlowMode("existing");
      }
      return;
    }

    setCheckEmailMessage(
      `We sent a confirmation link to ${inviteEmail}. Click it to confirm your account and start your ${trialDurationDays}-day ${campaignName} trial.`
    );
    setStatus("checkemail");
  }

  async function handleLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const { error: signInErr } = await createClient().auth.signInWithPassword({
      email: inviteEmail,
      password,
    });
    setSubmitting(false);
    if (signInErr) {
      setError(signInErr.message);
      return;
    }
    await activate({});
  }

  async function handleMagicLink() {
    setError(null);
    setSubmitting(true);
    const { error } = await createClient().auth.signInWithOtp({
      email: inviteEmail,
      options: { emailRedirectTo: returnUrl() },
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCheckEmailMessage(`We sent a sign-in link to ${inviteEmail}. Click it to start your ${trialDurationDays}-day ${campaignName} trial.`);
    setStatus("checkemail");
  }

  /** Resend the appropriate email for the current flow: a confirmation link
   * for new invitees, a sign-in link for existing accounts. */
  async function handleResend() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    if (flowMode === "new") {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: inviteEmail,
        options: { emailRedirectTo: returnUrl() },
      });
      setSubmitting(false);
      if (error) {
        setError(error.message);
        setStatus("setup");
        return;
      }
      setCheckEmailMessage(`We resent a confirmation link to ${inviteEmail}.`);
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email: inviteEmail,
        options: { emailRedirectTo: returnUrl() },
      });
      setSubmitting(false);
      if (error) {
        setError(error.message);
        setStatus("login");
        return;
      }
      setCheckEmailMessage(`We resent a sign-in link to ${inviteEmail}.`);
    }
  }

  return (
    <main className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[70vh] max-w-md mx-auto flex items-center">
      <div className="gold-card rounded-2xl p-6 w-full space-y-5">
        {(status === "establishing" || status === "activating") && (
          <p className="text-sm text-slate-300 text-center">
            {status === "establishing" ? "Verifying your invitation…" : "Activating your trial…"}
          </p>
        )}

        {status === "success" && (
          <div className="text-center space-y-3">
            <p className="text-base font-semibold text-white">Your trial is active!</p>
            <p className="text-sm text-slate-400">{message} Taking you to your dashboard…</p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center space-y-3">
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-3">{message}</p>
            <Link href="/login" className="inline-block text-sm text-amber-300 hover:underline">
              Go to sign in
            </Link>
          </div>
        )}

        {status === "checkemail" && (
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold text-white">Check your email</p>
            <p className="text-sm text-slate-400">{checkEmailMessage}</p>
            <button
              type="button"
              disabled={submitting}
              onClick={handleResend}
              className="mx-auto block text-xs text-slate-500 hover:text-slate-300 underline disabled:opacity-60"
            >
              Didn’t get it? Resend
            </button>
          </div>
        )}

        {status === "setup" && (
          <form onSubmit={handleSetupSubmit} className="space-y-4">
            <div className="text-center space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                You’ve been invited
              </span>
              <h1 className="text-xl font-bold text-white">Create your account to start your trial</h1>
              <p className="text-sm text-slate-400">
                Your {trialDurationDays}-day {campaignName} trial starts as soon as you confirm. No credit card.
              </p>
            </div>

            <div>
              <label htmlFor="invite-email" className="block text-xs font-medium text-slate-300 mb-1">
                Email
              </label>
              <input id="invite-email" value={inviteEmail} readOnly className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-slate-400" />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1">
                Password
              </label>
              <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-white" />
              <p className="text-[11px] text-slate-500 mt-1">At least 8 characters.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-xs font-medium text-slate-300 mb-1">
                  First name
                </label>
                <input id="firstName" name="firstName" className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-xs font-medium text-slate-300 mb-1">
                  Last name
                </label>
                <input id="lastName" name="lastName" className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-white" />
              </div>
            </div>

            <div>
              <label htmlFor="companyName" className="block text-xs font-medium text-slate-300 mb-1">
                Company name{requireCompany ? "" : " (optional)"}
              </label>
              <input id="companyName" name="companyName" required={requireCompany} className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-white" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="nmlsNumber" className="block text-xs font-medium text-slate-300 mb-1">
                  NMLS number{requireNmls ? "" : " (optional)"}
                </label>
                <input id="nmlsNumber" name="nmlsNumber" required={requireNmls} className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label htmlFor="state" className="block text-xs font-medium text-slate-300 mb-1">
                  Primary state (optional)
                </label>
                <input id="state" name="state" maxLength={2} placeholder="FL" className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-white" />
              </div>
            </div>

            {error ? (
              <div className="space-y-2">
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-2">{error}</p>
                {flowMode === "existing" && (
                  <button type="button" onClick={() => { setError(null); setStatus("login"); }} className="block text-xs text-amber-300 hover:underline">
                    That email may already have an account — sign in instead
                  </button>
                )}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="gold-button gold-cta-glow w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? "Creating your account…" : `Create account & start ${trialDurationDays}-day trial`}
            </button>

            <button type="button" onClick={() => { setError(null); setStatus("login"); }} className="block mx-auto text-xs text-slate-500 hover:text-slate-300 underline">
              Already have an account? Sign in
            </button>
          </form>
        )}

        {status === "login" && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="text-center space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                You’ve been invited
              </span>
              <h1 className="text-xl font-bold text-white">Sign in to start your trial</h1>
              <p className="text-sm text-slate-400">
                Your {trialDurationDays}-day {campaignName} trial starts as soon as you’re signed in. No credit card.
              </p>
            </div>

            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1">
                Email
              </label>
              <input id="login-email" value={inviteEmail} readOnly className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-slate-400" />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-300 mb-1">
                Password
              </label>
              <input id="login-password" name="password" type="password" required autoComplete="current-password" className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-white" />
            </div>

            {error ? <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-2">{error}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="gold-button gold-cta-glow w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in & start trial"}
            </button>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-700/60" />
              or
              <span className="h-px flex-1 bg-slate-700/60" />
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleMagicLink}
              className="w-full rounded-xl border border-amber-500/30 bg-black/40 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-black/60 disabled:opacity-60"
            >
              Email me a sign-in link
            </button>

            <button type="button" onClick={() => { setError(null); setStatus("setup"); }} className="block mx-auto text-xs text-slate-500 hover:text-slate-300 underline">
              New here? Create your account
            </button>
          </form>
        )}
      </div>
    </main>
  );
}