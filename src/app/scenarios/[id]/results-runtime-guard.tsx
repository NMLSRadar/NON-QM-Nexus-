"use client";

import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { VOICE_DRAFT_STORAGE_KEY } from "@/domain/voice/draft";

export class ScenarioResultsRuntimeGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Scenario results render failed:", error, info);
    Sentry.captureException(error, { tags: { surface: "scenario-results-render" } });
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="gold-theme gold-page -mx-4 -my-6 min-h-[70vh] bg-[#050505] px-4 py-12 sm:px-6">
          <div className="gold-glass mx-auto max-w-xl rounded-2xl border border-amber-500/30 p-7 text-center">
            <h1 className="text-xl font-bold text-white">Your scenario was saved</h1>
            <p className="mt-3 text-sm text-slate-300">
              The lender-results display hit a temporary error. Your completed Voice Scenario is still preserved and can be reopened without dictating it again.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button type="button" onClick={() => window.location.reload()} className="gold-button rounded-xl px-5 py-3 text-sm font-semibold">
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
    return this.props.children;
  }
}

export function ClearVoiceDraftAfterResultsReady() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(VOICE_DRAFT_STORAGE_KEY);
    } catch {
      // Successful results are already visible; storage cleanup is non-critical.
    }
  }, []);
  return null;
}