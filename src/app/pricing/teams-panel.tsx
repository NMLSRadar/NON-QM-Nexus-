import Link from "next/link";
import { Card } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * Presentational only — the volume breakpoints below must stay in sync with
 * scripts/stripe-team-billing.js's TEAM_VOLUME_BREAKPOINTS, which is the
 * actual billing source of truth (Stripe's own tiered pricing). Both are
 * PLACEHOLDERS awaiting real discount percentages from the owner — see
 * HANDOFF.md / the final report's "volume-breakpoint constants" note.
 */
const DISPLAY_BREAKPOINTS = [
  { range: "1-4 seats", note: "full per-seat price" },
  { range: "5-9 seats", note: "volume discount" },
  { range: "10+ seats", note: "contact us for a custom rate" },
];

export function TeamsPanel({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <Card dark className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Teams</h2>
          <p className="mt-1 text-sm text-slate-400 max-w-md">
            One subscription, any number of seats, one bill. Your brokerage picks a plan and a seat count — invite teammates and
            each covered seat gets full access at that tier, no separate billing per person.
          </p>
        </div>
        {isSignedIn ? (
          <Link
            href="/account/team/subscribe"
            className="shrink-0 rounded-md gold-button gold-cta-glow text-sm font-medium px-4 py-2"
          >
            Subscribe your team
          </Link>
        ) : (
          <Link href="/signup?next=/pricing" className="shrink-0 rounded-md bg-white/5 border border-amber-500/20 text-white text-sm font-medium px-4 py-2 hover:bg-white/10">
            Sign up to get started
          </Link>
        )}
      </div>

      <div className="mt-5 grid sm:grid-cols-3 gap-3">
        {DISPLAY_BREAKPOINTS.map((b) => (
          <div key={b.range} className="rounded border border-white/10 bg-black/20 p-3 text-center">
            <p className="text-sm font-semibold text-white">{b.range}</p>
            <p className="text-xs text-slate-400 mt-0.5">{b.note}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Need 10+ seats or a multi-year prepay?{" "}
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Team%20pricing`} className="text-amber-400 underline">
          Contact us
        </a>{" "}
        — larger teams and multi-year prepay are handled directly, not through self-serve checkout.
      </p>
    </Card>
  );
}
