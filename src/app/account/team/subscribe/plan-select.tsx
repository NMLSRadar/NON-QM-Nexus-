export interface PlanOption {
  id: string;
  name: string;
  monthlyPriceCents: number;
  /** Real Stripe per-seat price id for this plan's monthly team billing —
   * null means the setup script (scripts/stripe-team-billing.js) has not
   * been run for this plan yet. Extracted into its own presentational
   * component (2026-07-30, after a real regression) so this exact
   * disabled-option logic can be unit-tested directly: when EVERY option
   * lacks a price id, every <option> renders disabled and the browser has
   * no valid default to display — the whole dropdown then renders
   * completely blank, which is exactly what happened in production. */
  hasTeamPrice: boolean;
}

/** The Plan <select>'s option list — a pure, presentational piece
 * extracted so tests can render it directly without needing the full
 * async Server Component page (which fetches live data and requires a
 * real request/session context). */
export function PlanSelect({ plans }: { plans: PlanOption[] }) {
  return (
    <select
      id="planId"
      name="planId"
      required
      className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      {plans.map((p) => (
        <option key={p.id} value={p.id} disabled={!p.hasTeamPrice}>
          {p.name} — ${(p.monthlyPriceCents / 100).toFixed(0)}/seat/mo{!p.hasTeamPrice ? " (not yet configured)" : ""}
        </option>
      ))}
    </select>
  );
}
