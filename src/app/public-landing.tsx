import Link from "next/link";
import { Mic, ClipboardCheck, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";

/** Public marketing landing page shown at "/" for anonymous visitors —
 * external-audit fix (2026-07-28): root previously redirected straight to
 * /login with no public-facing page at all. Every app route stays gated
 * exactly as it already was (middleware.ts's PROTECTED_PREFIXES is
 * unchanged); this is purely a new, unauthenticated view of "/" itself.
 * Deliberately consistent with the footer's own disclaimers (rendered
 * globally in layout.tsx, untouched here) — this page never claims to
 * issue approvals, credit decisions, or commitments to lend. */
export function PublicLanding() {
  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-10 bg-[#050505] rounded-b-3xl space-y-12">
      <section className="text-center max-w-3xl mx-auto space-y-5 pt-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
          <Sparkles className="h-3.5 w-3.5" /> Non-QM decision support
        </span>
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight text-white">
          Match a Non-QM scenario to the right lender — <span className="gold-text-gradient">in minutes, not hours</span>
        </h1>
        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto">
          Describe a borrower&apos;s scenario by voice or a short form, and get every applicable lender program ranked by
          real guideline eligibility — not pricing, not popularity. This is an underwriting-assistance and research
          tool; it does not issue loan approvals, credit decisions, or commitments to lend.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link href="/pricing" className="gold-button gold-cta-glow inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold">
            View pricing <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="gold-outline-button inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-3 max-w-5xl mx-auto">
        <div className="gold-scenario-card rounded-2xl border border-white/10 bg-[#0d0d0f] p-6">
          <span className="gold-header-icon relative flex h-11 w-11 items-center justify-center rounded-full">
            <Mic className="h-5 w-5 text-amber-300" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-white">Voice intake</h3>
          <p className="mt-1.5 text-sm text-slate-400">
            Describe a scenario out loud — purchase or refinance, income documentation, citizenship, credit — and the
            platform captures the vitals automatically, asking only for what&apos;s still missing.
          </p>
        </div>
        <div className="gold-scenario-card rounded-2xl border border-white/10 bg-[#0d0d0f] p-6">
          <span className="gold-header-icon relative flex h-11 w-11 items-center justify-center rounded-full">
            <ShieldCheck className="h-5 w-5 text-amber-300" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-white">Guideline-first ranking</h3>
          <p className="mt-1.5 text-sm text-slate-400">
            Every lender program is checked against the exact scenario&apos;s guideline requirements first — pricing and
            technology are only ever secondary, transparent factors, never the deciding one.
          </p>
        </div>
        <div className="gold-scenario-card rounded-2xl border border-white/10 bg-[#0d0d0f] p-6">
          <span className="gold-header-icon relative flex h-11 w-11 items-center justify-center rounded-full">
            <ClipboardCheck className="h-5 w-5 text-amber-300" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-white">Document checklists</h3>
          <p className="mt-1.5 text-sm text-slate-400">
            A standing, always-available reference for exactly what to have ready by loan type — Bank Statement, P&amp;L
            Only, DSCR, Asset Depletion, ITIN, Foreign National, and more.
          </p>
        </div>
      </section>

      <section className="text-center max-w-2xl mx-auto space-y-3 pb-4">
        <p className="text-sm text-slate-400">Ready to see it on your own book of business?</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/pricing" className="gold-button gold-cta-glow inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold">
            View pricing <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="gold-outline-button inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
          >
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
