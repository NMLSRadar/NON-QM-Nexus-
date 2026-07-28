import Link from "next/link";

/** Renders the trial state somewhere in the account interface — spec
 * Phase 6 ("Display the user's remaining trial time somewhere in the
 * account interface... 'N days remaining in your All Access trial'") and
 * Phase 3's exact required expired-trial copy. Rendered globally in
 * layout.tsx so it's visible site-wide while relevant, not buried on one
 * page — but stays completely silent (renders null) for an account that
 * never had a trial or has a real paid/comped subscription. */
export function TrialStatusBanner({
  isTrial,
  trialExpiresAt,
  currentTierLevel,
}: {
  isTrial: boolean;
  trialExpiresAt: string | null;
  /** The account's CURRENT effective tier — 0 if the trial (or any plan)
   * has expired/lapsed. Used to distinguish "trial active" from "trial
   * expired" without a second lookup, since EffectivePlan.trialExpiresAt
   * is deliberately still populated after expiration (see membership.ts). */
  currentTierLevel: number;
}) {
  if (!trialExpiresAt) return null; // never had a trial — nothing to show

  const now = Date.now();
  const expiresAtMs = new Date(trialExpiresAt).getTime();

  if (isTrial) {
    const msRemaining = expiresAtMs - now;
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    const urgent = msRemaining <= 72 * 60 * 60 * 1000; // Phase 6: "fewer than 72 hours remain"

    return (
      <div
        className={`relative z-30 text-center text-xs sm:text-sm py-2 px-4 ${
          urgent ? "bg-rose-500/15 text-rose-200 border-b border-rose-500/30" : "bg-amber-500/10 text-amber-200 border-b border-amber-500/20"
        }`}
      >
        {urgent ? (
          <span className="font-semibold">
            {daysRemaining <= 0 ? "Your trial ends today" : `Only ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`} in
            your All Access trial —{" "}
          </span>
        ) : (
          <span>
            {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining in your All Access trial —{" "}
          </span>
        )}
        <Link href="/pricing" className="underline font-medium hover:no-underline">
          choose a plan to keep access
        </Link>
        .
      </div>
    );
  }

  // Trial exists but is no longer active (currentTierLevel resolved to 0
  // by getEffectivePlan's own expiration check) — this is the expired
  // state, distinct from "never had a trial" (handled by the early
  // return above) and from "still active" (handled above).
  if (currentTierLevel === 0) {
    return (
      <div className="relative z-30 bg-black/60 border-b border-amber-500/20 text-center text-xs sm:text-sm py-2 px-4 text-slate-200">
        Your 14-day Non-QM Nexus All Access trial has ended. Select a membership tier to continue accessing lender
        guidelines, Voice Scenario analysis, lender rankings, and AI-powered recommendations. <Link href="/pricing" className="underline font-medium text-amber-300 hover:no-underline">View plans</Link>.
      </div>
    );
  }

  return null;
}
