"use client";

import { useEffect } from "react";

/**
 * Root error boundary for the App Router. Without this file, ANY uncaught
 * client-side exception anywhere in the tree falls through to Next.js's
 * generic blank page: "Application error: a client-side exception has
 * occurred" — no explanation, no way back in, nothing actionable. This
 * catches that instead and gives the user a real way forward: retry the
 * render, or go sign in again (the single most common real cause of a
 * stray client exception is a stale/invalidated auth session on the
 * client trying to reconcile against a server that no longer recognizes
 * it — reloading via a fresh sign-in resolves that class of issue).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled client-side exception:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6">
      <div className="w-full max-w-md rounded-2xl border border-[#3a2f0f] bg-[#111111] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#d4af37] to-[#8a6d1f] text-xl font-bold text-black">
          !
        </div>
        <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-white/60">
          This page hit an unexpected error. This is usually resolved by reloading, or by signing in
          again if your session has gone stale.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full bg-gradient-to-r from-[#f5d576] via-[#d4af37] to-[#a9822a] px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
          >
            Try again
          </button>
          <a
            href="/login"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/5"
          >
            Sign in again
          </a>
        </div>
      </div>
    </div>
  );
}
