"use client";

import { useState } from "react";
import { Mic, MessageSquareText, Sparkles, Zap, PenSquare } from "lucide-react";
import Link from "next/link";
import VoiceClient from "@/app/scenarios/voice/voice-client";
import { GoldWaveform } from "@/components/gold-waveform";

const FEATURES = [
  {
    icon: <MessageSquareText className="h-5 w-5" />,
    title: "Natural Conversation",
    description: "Describe a borrower the way you'd explain it to a colleague — no forms, no dropdowns.",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "AI Guideline Matching",
    description: "We map what you say onto real lender guidelines and flag exactly what's missing.",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Instant Scenario Analysis",
    description: "LTV, DTI, reserves, and a ranked lender comparison — generated in seconds, not minutes.",
  },
];

/** The homepage's Voice Scenario hero. Clicking "Start Voice Scenario"
 * reveals the SAME VoiceClient used on the dedicated /scenarios/voice
 * page directly inline — one click, no redirect, no duplicate matching
 * logic (see docs on parity between voice/manual scenario paths). */
export function HomeVoiceHero() {
  const [voiceActive, setVoiceActive] = useState(false);

  return (
    <section className="gold-theme gold-sheen relative overflow-hidden rounded-3xl border border-amber-500/25 bg-[#080808] p-6 sm:p-10 shadow-[0_0_60px_-20px_rgba(212,175,55,0.35)]">
      <div className="gold-ambient" />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-8">
        <div className="flex items-start gap-5">
          <div className="relative shrink-0 h-16 w-16">
            <span className="gold-pulse-ring" />
            <span className="gold-pulse-ring delay-1" />
            <span className="gold-pulse-ring delay-2" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 shadow-[0_0_30px_-4px_rgba(240,200,96,0.8)]">
              <Mic className="h-7 w-7 text-black" />
            </span>
          </div>
          <div>
            <span className="inline-block rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-300 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1">
              AI-Powered
            </span>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Voice <span className="gold-text-gradient">Scenario</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm sm:text-base text-slate-300">
              Describe your borrower naturally and let AI analyze hundreds of lender guidelines in seconds.
            </p>
          </div>
        </div>

        <div className="hidden xl:block flex-1">
          <GoldWaveform active={voiceActive} />
        </div>
      </div>

      <div className="relative z-10 mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => setVoiceActive(true)}
          aria-pressed={voiceActive}
          className="gold-button gold-cta-glow inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold whitespace-nowrap"
        >
          <Mic className="h-5 w-5" /> Start Voice Scenario
        </button>
        <Link
          href="/scenarios/new"
          className="gold-outline-button inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold whitespace-nowrap"
        >
          <PenSquare className="h-4 w-4" /> Create Manual Scenario
        </Link>
      </div>

      <div className="relative z-10 mt-8 grid sm:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="gold-card gold-fade-up rounded-2xl p-4"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
              {f.icon}
            </span>
            <p className="mt-3 font-semibold text-white">{f.title}</p>
            <p className="mt-1 text-xs text-slate-400">{f.description}</p>
          </div>
        ))}
      </div>

      {voiceActive ? (
        <div id="home-voice-panel" className="light-surface relative z-10 mt-8 rounded-2xl bg-white p-4 sm:p-6 shadow-2xl gold-fade-up">
          <div
            role="status"
            aria-live="polite"
            className="mb-3 flex items-center gap-2 text-xs font-medium text-amber-700"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-600" />
            </span>
            Voice Scenario is live — speak or type below. Applicable lenders will appear automatically once enough
            details are captured.
          </div>
          <VoiceClient />
        </div>
      ) : null}
    </section>
  );
}
