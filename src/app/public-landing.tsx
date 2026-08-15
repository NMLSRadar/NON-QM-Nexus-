import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bolt,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  Mic,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";

const WAVE_STRANDS = Array.from({ length: 8 }, (_, index) => index);
const DATA_PARTICLES = Array.from({ length: 14 }, (_, index) => index);

function DataWave({ side }: { side: "left" | "right" }) {
  return (
    <div className={`nexus-data-wave nexus-data-wave-${side}`} aria-hidden="true">
      <div className="nexus-wave-strands">
        {WAVE_STRANDS.map((strand) => (
          <span key={strand} style={{ "--strand": strand } as CSSProperties} />
        ))}
      </div>
      <div className="nexus-wave-particles">
        {DATA_PARTICLES.map((particle) => (
          <i
            key={particle}
            style={{
              "--particle-x": `${2 + ((particle * 37) % 89)}%`,
              "--particle-y": `${9 + ((particle * 53) % 77)}%`,
              "--particle-size": `${2 + (particle % 3)}px`,
              "--particle-duration": `${5 + (particle % 5) * 1.1}s`,
              "--particle-delay": `${particle * -0.42}s`,
            } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

function BookDemoCta() {
  return (
    <button type="button" className="nexus-demo-cta group">
      <CalendarDays className="nexus-cta-icon h-4 w-4" aria-hidden="true" />
      <span>Book a demo</span>
      {/* TODO(robert): wire demo booking flow (e.g. /demo page or calendar embed) — intentionally non-functional for now. */}
    </button>
  );
}

function PrimaryCta() {
  return (
    <Link href="/pricing" className="nexus-primary-cta group">
      <span>View pricing</span>
      <ArrowRight className="nexus-cta-arrow h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function SignInCta() {
  return (
    <Link href="/login" className="nexus-closing-cta">
      Sign in
    </Link>
  );
}

export function PublicLanding({ programCount: _programCount = null }: { programCount?: number | null }) {
  const programLine = "HUNDREDS OF NON-QM PROGRAMS AT YOUR FINGERTIPS!";
  return (
    <div className="nexus-landing gold-theme gold-page -mx-4 -my-6 overflow-hidden bg-[#050505] px-4 pb-10 pt-6 sm:px-6 sm:pb-14">
      <section className="nexus-hero relative mx-auto max-w-7xl pt-8 text-center sm:pt-10 lg:pt-12">
        <DataWave side="left" />
        <DataWave side="right" />

        <div className="nexus-hero-content relative z-10 mx-auto flex max-w-5xl flex-col items-center">
          <span className="nexus-eyebrow">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Non-QM decision support
          </span>

          <h1 className="nexus-headline">
            <span className="block">Match a Non-QM scenario to the</span>
            <span className="block">
              right lender — <span className="nexus-gold-copy">in seconds, not</span>
            </span>
            <span className="nexus-gold-copy block">hours</span>
          </h1>

          <div className="nexus-program-callout">
            <span className="nexus-bolt-wrap" aria-hidden="true">
              <Bolt className="h-5 w-5" fill="currentColor" />
            </span>
            <span>{programLine}</span>
          </div>

          <p className="nexus-description">
            Describe a borrower&apos;s scenario by voice or a short form, and get every applicable lender program ranked by
            real guideline eligibility — not pricing, not popularity.
            <span className="mt-2 block">
              This is an underwriting-assistance and research tool; it does not issue loan approvals, credit decisions,
              or commitments to lend.
            </span>
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <BookDemoCta />
            <PrimaryCta />
            <SignInCta />
          </div>
        </div>
      </section>

      <section aria-label="Platform capabilities" className="nexus-feature-grid relative z-10 mx-auto mt-10 grid max-w-6xl gap-5 lg:grid-cols-3">
        <article className="nexus-feature-card nexus-feature-voice">
          <div className="nexus-card-art" aria-hidden="true">
            <div className="nexus-audio-wave">
              {Array.from({ length: 13 }, (_, index) => (
                <span key={index} style={{ "--bar-height": `${14 + ((index * 17) % 72)}px` } as CSSProperties} />
              ))}
            </div>
          </div>
          <span className="nexus-icon-orbit" aria-hidden="true">
            <Mic className="h-7 w-7" />
          </span>
          <h2>Voice intake</h2>
          <p>
            Describe a scenario out loud — purchase or refinance, income documentation, citizenship, credit — and the
            platform captures the vitals automatically, asking only for what&apos;s still missing.
          </p>
        </article>

        <article className="nexus-feature-card nexus-feature-ranking">
          <div className="nexus-card-art" aria-hidden="true">
            <div className="nexus-chart-columns">
              {Array.from({ length: 7 }, (_, index) => (
                <span key={index} style={{ "--column-height": `${20 + index * 10}px` } as CSSProperties} />
              ))}
              <BarChart3 className="nexus-chart-line" />
            </div>
          </div>
          <span className="nexus-icon-orbit" aria-hidden="true">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <h2>Guideline-first ranking</h2>
          <p>
            Every lender program is checked against the exact scenario&apos;s guideline requirements — eligibility decides
            the ranking. Pricing is never a factor of any kind.
          </p>
        </article>

        <article className="nexus-feature-card nexus-feature-documents">
          <div className="nexus-card-art nexus-document-stack" aria-hidden="true">
            <span><FileCheck2 /></span>
            <span><ClipboardCheck /></span>
            <span><FileCheck2 /></span>
          </div>
          <span className="nexus-icon-orbit" aria-hidden="true">
            <ClipboardCheck className="h-7 w-7" />
          </span>
          <h2>Document checklists</h2>
          <p>
            A standing, always-available reference for exactly what to have ready by loan type — Bank Statement, P&amp;L
            Only, DSCR, Asset Depletion, ITIN, Foreign National, and more.
          </p>
        </article>
      </section>

      <section className="nexus-closing-section relative z-10 mx-auto mt-9 max-w-4xl text-center">
        <div className="nexus-closing-prompt">
          <span className="nexus-divider" aria-hidden="true" />
          <p>
            <Star className="h-4 w-4" fill="currentColor" aria-hidden="true" />
            Ready to see it on your own book of business?
          </p>
          <span className="nexus-divider" aria-hidden="true" />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta />
          <SignInCta />
        </div>
      </section>
    </div>
  );
}
