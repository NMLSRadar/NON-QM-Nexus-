import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  FileCheck2,
  Mic,
  ShieldCheck,
  Star,
  Mic2,
  Gauge,
  Target,
  Users,
  FileStack,
} from "lucide-react";
import { GuidelineEngine } from "@/components/guideline-engine";

/* ----------------------------------------------------------------------- */
/*  Homepage rebuilt to the design reference: ivory/navy/champagne in light  */
/*  mode, the existing navy/gold in dark mode, with the animated Guideline   */
/*  Engine as the centerpiece. Header chrome is the global dark-navy one.    */
/* ----------------------------------------------------------------------- */

const BADGES = [
  { icon: <Star className="h-3.5 w-3.5" fill="currentColor" />, label: "Non-QM Decision Intelligence" },
  { icon: <span className="h-2 w-2 rounded-full bg-emerald-400" />, label: "Live Guideline Intelligence", live: true },
];

const STATS = [
  { icon: <Users className="h-5 w-5" />, value: "50+", label: "Lenders" },
  { icon: <FileStack className="h-5 w-5" />, value: "Hundreds", label: "Programs" },
  { icon: <Target className="h-5 w-5" />, value: "Guideline-First", label: "Matching" },
];

const FEATURES = [
  {
    icon: <Mic2 className="h-6 w-6" />,
    title: "Voice Intake",
    desc: "Capture complex scenarios naturally with AI-powered voice intake.",
    href: "/scenarios/voice",
    art: <VoiceIntakeArt />,
    tags: [
      ["Loan Purpose", "DSCR Investor"],
      ["Property Type", "SFR"],
      ["Credit Score", "680"],
      ["LTV", "75%"],
    ],
  },
  {
    icon: <Gauge className="h-6 w-6" />,
    title: "Guideline-first ranking",
    desc: "Our engine evaluates thousands of data points to surface the best-fitting non-QM programs.",
    href: "/scenarios",
    art: <RankingArt />,
  },
  {
    icon: <ClipboardCheck className="h-6 w-6" />,
    title: "Document checklists",
    desc: "Instant, program-specific checklists so you collect the right docs the first time.",
    href: "/document-checklists",
    art: <ChecklistArt />,
  },
];

export function PublicLanding() {
  return (
    <div className="nexus-landing gold-theme gold-page -mx-4 -my-6 overflow-hidden bg-[#050505] px-4 pb-12 pt-6 sm:px-6 sm:pb-16">
      {/* HERO */}
      <section className="relative mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="nexus-hero-content relative z-10">
            <div className="flex flex-wrap gap-2.5">
              {BADGES.map((b) => (
                <span key={b.label} className="nexus-eyebrow">
                  <span className={b.live ? "relative flex h-2 w-2" : ""} aria-hidden>
                    {b.icon}
                  </span>
                  {b.label}
                </span>
              ))}
            </div>

            <h1 className="nexus-headline text-left">
              <span className="block">Match a Non-QM scenario</span>
              <span className="block">to the right lender —</span>
              <span className="nexus-gold-copy block">in seconds, not hours</span>
            </h1>

            <p className="nexus-description text-left">
              <span className="block text-left">Hundreds of non-QM programs at your fingertips.</span>
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/scenarios/new" className="nexus-primary-cta nexus-start-cta group">
                <span>Start a Scenario</span>
                <ArrowRight className="nexus-cta-arrow h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/scenarios/voice" className="nexus-voice-cta group">
                <Mic className="h-4 w-4" aria-hidden="true" />
                <span>Voice Scenario</span>
              </Link>
            </div>
          </div>

          {/* The animated centerpiece */}
          <div className="relative z-10 mx-auto w-full max-w-[440px]">
            <div className="h-px w-0" aria-hidden />
            <GuidelineEngine className="mx-auto sm:block" />
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="nexus-stats mx-auto mt-12 max-w-4xl">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-amber-500/20 sm:grid-cols-3">
          {STATS.map((s, i) => (
            <div key={s.label} className="nexus-stat px-6 py-5">
              <span className="nexus-stat-icon" aria-hidden>
                {s.icon}
              </span>
              <div>
                <p className="nexus-stat-value">{s.value}</p>
                <p className="nexus-stat-label">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURE CARDS */}
      <section aria-label="Platform capabilities" className="relative z-10 mx-auto mt-12 grid max-w-6xl gap-5 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.title} className="nexus-feature-card nexus-feature-home group">
            <div className="nexus-card-art" aria-hidden="true">
              {f.art}
            </div>
            <span className="nexus-icon-orbit" aria-hidden="true">
              {f.icon}
            </span>
            <h2>{f.title}</h2>
            <p>{f.desc}</p>
            {"tags" in f && f.tags ? (
              <div className="nexus-tags">
                {f.tags.map(([k, v]) => (
                  <span key={k as string} className="nexus-tag">
                    <span>{k as string}:</span> {v as string}
                  </span>
                ))}
              </div>
            ) : (
              <div className="nexus-tags">
                <Link href={f.href} className="nexus-viewall">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </article>
        ))}
      </section>

      {/* CLOSING */}
      <section className="relative z-10 mx-auto mt-12 max-w-4xl text-center">
        <div className="nexus-closing-prompt">
          <span className="nexus-divider" aria-hidden="true" />
          <p>
            <Star className="h-4 w-4" fill="currentColor" aria-hidden="true" />
            Ready to see it on your own book of business?
          </p>
          <span className="nexus-divider" aria-hidden="true" />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link href="/pricing" className="nexus-primary-cta group">
            <span>View pricing</span>
            <ArrowRight className="nexus-cta-arrow h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/login" className="nexus-closing-cta">
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}

/* Decorative card-art miniatures (aria-hidden, purely visual). */

function VoiceIntakeArt() {
  return (
    <div>
      <div className="nexus-audio-wave">
        {Array.from({ length: 13 }, (_, index) => (
          <span key={index} style={{ "--bar-height": `${14 + ((index * 17) % 72)}px` } as CSSProperties} />
        ))}
      </div>
      <span className="nexus-listening">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Listening… 00:24
      </span>
    </div>
  );
}

function RankingArt() {
  return (
    <div>
      <div className="nexus-chart-columns">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} style={{ "--column-height": `${20 + index * 10}px` } as CSSProperties} />
        ))}
        <BarChart3 className="nexus-chart-line" />
      </div>
      <div className="nexus-rank-list">
        <span>1. Lender A · 98%</span>
        <span>2. Lender B · 94%</span>
        <span>3. Lender C · 91%</span>
      </div>
    </div>
  );
}

function ChecklistArt() {
  return (
    <div className="nexus-document-stack" aria-hidden="true">
      <span><FileCheck2 /></span>
      <span><ClipboardCheck /></span>
      <span><ShieldCheck /></span>
    </div>
  );
}