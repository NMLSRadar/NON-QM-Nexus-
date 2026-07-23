"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthActionState } from "../login/actions";

const initialState: AuthActionState = { error: null };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

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
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>
      </div>
      {state.error ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-sm text-slate-600 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-slate-900 font-medium underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
