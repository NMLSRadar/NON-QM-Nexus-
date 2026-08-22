"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function ScenarioResultsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Scenario results route failed:", error);
    Sentry.captureException(error, { tags: { surface: "scenario-results-route" } });
  }, [error]);

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 min-h-[70vh] bg-[#050505] px-4 py-12 sm:px-6">
      <div className="gold-glass mx-auto max-w-xl rounded-2xl border border-amber-500/30 p-7 text-center">
        <h1 className="text-xl font-bold text-white">Your scenario is safe</h1>
        <p className="mt-3 text-sm text-slate-300">
          Lender matching could not finish loading. Your completed Voice Scenario remains preserved in this browser.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="gold-button rounded-xl px-5 py-3 text-sm font-semibold">
            Retry lender matches
          </button>
          <Link href="/" className="gold-outline-button rounded-xl px-5 py-3 text-sm font-semibold">
            Return to saved Voice Scenario
          </Link>
        </div>
      </div>
    </div>
  );
}