"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PENDING_TRIAL_KEY, type PendingTrialRegistration } from "../trial-registration-form";

type Status = "activating" | "success" | "error";

export function ActivateTrialClient({ campaignSlug }: { campaignSlug: string }) {
  const [status, setStatus] = useState<Status>("activating");
  const [message, setMessage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function establishSessionThenActivate() {
      // Same pattern as reset-password-form.tsx: parse the confirmation
      // link's hash tokens ourselves rather than relying purely on the
      // SDK's automatic detection, which we've found doesn't consistently
      // win the race with the cookie-backed @supabase/ssr client.
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, "", window.location.pathname);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setStatus("error");
        setMessage("We couldn't verify your account from this link. Try signing in directly — your trial may already be active.");
        return;
      }

      let pending: PendingTrialRegistration | null = null;
      try {
        const raw = window.localStorage.getItem(PENDING_TRIAL_KEY);
        if (raw) pending = JSON.parse(raw) as PendingTrialRegistration;
      } catch {
        // ignore — activate with no extra profile fields below
      }

      const email = sessionData.session.user.email ?? pending?.email ?? "";
      const normalizedEmail = email.toLowerCase().trim();

      const { data, error } = await supabase.rpc("activate_trial", {
        p_campaign_slug: pending?.campaignSlug ?? campaignSlug,
        p_normalized_email: normalizedEmail,
        p_first_name: pending?.firstName ?? null,
        p_last_name: pending?.lastName ?? null,
        p_company_name: pending?.companyName || null,
        p_nmls_number: pending?.nmlsNumber || null,
        p_state: pending?.state || null,
      });

      try {
        window.localStorage.removeItem(PENDING_TRIAL_KEY);
      } catch {
        // ignore
      }

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("success");
      setExpiresAt(Array.isArray(data) && data[0] ? data[0].expires_at : null);
      setTimeout(() => {
        window.location.href = "/scenarios";
      }, 2500);
    }

    establishSessionThenActivate();
  }, [campaignSlug]);

  return (
    <div className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[60vh] max-w-md mx-auto flex items-center">
      <div className="gold-card rounded-2xl p-6 w-full text-center space-y-3">
        {status === "activating" && <p className="text-sm text-slate-300">Activating your trial…</p>}
        {status === "success" && (
          <>
            <p className="text-base font-semibold text-white">Your trial is active!</p>
            <p className="text-sm text-slate-400">
              {expiresAt ? `Full access until ${new Date(expiresAt).toLocaleDateString()}.` : "Full access has started."} Taking you
              to your dashboard…
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-3">{message}</p>
            <Link href="/login" className="text-sm text-amber-300 hover:underline">
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
