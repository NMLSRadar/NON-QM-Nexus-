"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.success) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
          If an account exists for that email, we&apos;ve sent a link to reset your password. Check your inbox.
        </p>
        <Link href="/login" className="text-sm text-slate-900 font-medium underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>
      {state.error ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-sm text-slate-600 text-center">
        <Link href="/login" className="text-slate-900 font-medium underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
