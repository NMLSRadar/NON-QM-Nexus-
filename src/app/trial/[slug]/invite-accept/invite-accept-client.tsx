"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendTrialActivationEmailIfNeeded } from "../activate/actions";

type Status = "establishing" | "setup" | "activating" | "success" | "error";

export function InviteAcceptClient({
  campaignSlug,
  campaignName,
  trialDurationDays,
  requireNmls,
  requireCompany,
  mode,
}: {
  campaignSlug: string;
  campaignName: string;
  trialDurationDays: number;
  requireNmls: boolean;
  requireCompany: boolean;
  mode: "new" | "existing";
}) {
  const [status, setStatus] = useState<Status>("establishing");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Activate the trial for the current (now signed-in) user. Called after
  // a new invitee chooses a password, or immediately after an existing
  // account signs in via its magic link.
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

    const { data, error: actErr } = await supabase.rpc("activate_trial", {
      p_campaign_slug: campaignSlug,
      p_normalized_email: user.email.toLowerCase().trim(),
      p_first_name: profile.firstName || null,
      p_last_name: profile.lastName || null,
      p_company_name: profile.companyName || null,
      p_nmls_number: profile.nmlsNumber || null,
      p_state: profile.state || null,
      // This page is reached only via an admin beta-invite link — the invitee
      // IS a beta tester, so flag them (the ordinary /trial/[slug] signup does
      // not pass this and stays non-beta).
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
      // Same hash-token pattern as the trial activation page: parse the
      // magic-link / invite-link tokens ourselves instead of relying on
      // SDK auto-detection, which can race the cookie-backed SSR client.
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setStatus("error");
        setMessage("We couldn’t verify your invitation link. It may have expired — ask for a new invite.");
        return;
      }

      setEmail(sessionData.session.user.email ?? "");

      if (mode === "existing") {
        // Existing account, signed in via magic link — activate immediately.
        await activate({});
      } else {
        // New invitee: they must choose a password before the trial lands.
        setStatus("setup");
      }
    }

    establishSession().catch(() => {
      setStatus("error");
      setMessage("Something went wrong verifying your link. Please try again.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, campaignSlug]);

  function handleSetupSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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
      return;
    }
    if (requireNmls && !profile.nmlsNumber) {
      setError("An NMLS number is required for this trial.");
      return;
    }

    createClient()
      .auth.updateUser({ password, data: { first_name: profile.firstName || null, last_name: profile.lastName || null, company_name: profile.companyName || null, nmls_number: profile.nmlsNumber || null, state: profile.state || null } })
      .then(async ({ error: updateErr }) => {
        if (updateErr) {
          setError(updateErr.message);
          return;
        }
        await activate(profile);
      })
      .catch(() => {
        setError("We couldn’t set your password. Please try again.");
      });
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

        {status === "setup" && (
          <form onSubmit={handleSetupSubmit} className="space-y-4">
            <div className="text-center space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                You’ve been invited
              </span>
              <h1 className="text-xl font-bold text-white">Create your account to start your trial</h1>
              <p className="text-sm text-slate-400">
                Your {trialDurationDays}-day {campaignName} trial starts as soon as you finish. No credit card.
              </p>
            </div>

            <div>
              <label htmlFor="invite-email" className="block text-xs font-medium text-slate-300 mb-1">
                Email
              </label>
              <input id="invite-email" value={email} readOnly className="w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-slate-400" />
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
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-2">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="gold-button gold-cta-glow w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? "Creating your account…" : `Create account & start ${trialDurationDays}-day trial`}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}