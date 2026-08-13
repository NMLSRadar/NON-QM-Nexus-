import Link from "next/link";
import { Star, User, Users, UsersRound, ArrowRight } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * Presentational only — the volume breakpoints below must stay in sync with
 * scripts/stripe-team-billing.js's TEAM_VOLUME_BREAKPOINTS, which is the
 * actual billing source of truth (Stripe's own tiered pricing). Both are
 * PLACEHOLDERS awaiting real discount percentages from the owner — see
 * HANDOFF.md / the final report's "volume-breakpoint constants" note.
 */
const DISPLAY_BREAKPOINTS = [
  { range: "1-4 seats", note: "full per-seat price", Icon: User },
  { range: "5-9 seats", note: "volume discount", Icon: Users },
  { range: "10+ seats", note: "contact us for a custom rate", Icon: UsersRound },
];

export function TeamsPanel({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <div className="nexus-teams-panel relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-amber-500/25 bg-[#0d0d0f]/80 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]">
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-48 w-[30rem] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[80px]" />
      <div className="relative p-6 sm:p-9">
        <div className="flex items-center justify-center gap-2">
          <Star className="h-5 w-5 text-amber-400" strokeWidth={2.2} />
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-400">Teams</h2>
        </div>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-300">
          One subscription, any number of seats, one bill. Your brokerage picks a membership and a seat count — invite
          teammates and each covered seat gets full access at that tier, no separate billing per person.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {DISPLAY_BREAKPOINTS.map(({ range, note, Icon }) => (
            <div key={range} className="nexus-team-tier rounded-xl border border-amber-500/20 bg-black/30 p-4 text-center sm:p-5">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 text-black shadow-lg">
                <Icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <p className="mt-2.5 text-sm font-semibold text-white">{range}</p>
              <p className="mt-0.5 text-xs text-slate-400">{note}</p>
            </div>
          ))}
        </div>

        {isSignedIn ? (
          <Link
            href="/account/team/subscribe"
            className="gold-to-black-button group mx-auto mt-7 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            Subscribe Your Team
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
          </Link>
        ) : (
          <Link
            href="/signup?next=/pricing"
            className="gold-to-black-button group mx-auto mt-7 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            Subscribe Your Team
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
          </Link>
        )}

        <p className="mt-5 text-center text-xs text-slate-500">
          Need 10+ seats or a multi-year prepay?{" "}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Team%20pricing`} className="text-amber-400 underline">
            Contact us
          </a>{" "}
          — larger teams and multi-year prepay are handled directly, not through self-serve checkout.
        </p>
      </div>
    </div>
  );
}