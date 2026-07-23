"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "invalid" | "success";

export function ResetPasswordForm() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // The reset link lands here with the recovery token in the URL hash
    // fragment (#access_token=...&type=recovery) — the Supabase browser
    // client picks this up automatically on load and fires this event.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // In case the event already fired before this listener attached, also
    // check for an existing session directly.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus((s) => (s === "checking" ? "ready" : s));
    });

    const timeout = setTimeout(() => {
      setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatus("success");
  }

  if (status === "checking") {
    return <p className="text-sm text-slate-500">Verifying your reset link…</p>;
  }

  if (status === "invalid") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
          This reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className="text-sm text-slate-900 font-medium underline">
          Request a new link
        </Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
          Your password has been reset. You can now sign in with your new password.
        </p>
        <Link href="/login" className="text-sm text-slate-900 font-medium underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>
      {error ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}
