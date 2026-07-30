import { requireOrgAdmin } from "@/lib/orgAdmin";
import { Card } from "@/components/ui";
import { startTeamCheckout } from "./actions";

export const dynamic = "force-dynamic";

interface PlanRow {
  id: string;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  description: string | null;
  stripe_team_price_id: string | null;
  stripe_team_annual_price_id: string | null;
}

export default async function TeamSubscribePage() {
  const { supabase } = await requireOrgAdmin();

  const { data, error } = await supabase
    .from("membership_plans")
    .select("id, name, monthly_price_cents, annual_price_cents, description, stripe_team_price_id, stripe_team_annual_price_id")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  const plans = (data ?? []) as PlanRow[];

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Subscribe your team</h1>
        <p className="text-sm text-slate-400">
          One subscription, any number of seats, one bill — pick a plan and how many teammates you want covered. Add or invite
          people to it afterward from{" "}
          <a href="/account/team" className="text-amber-400 underline">
            Team management
          </a>
          .
        </p>
      </div>

      <Card title="Plan &amp; seats" dark>
        <form action={startTeamCheckout} className="space-y-4">
          <div>
            <label htmlFor="planId" className="block text-sm font-medium text-slate-300 mb-1">
              Plan
            </label>
            <select
              id="planId"
              name="planId"
              required
              className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.stripe_team_price_id}>
                  {p.name} — ${(p.monthly_price_cents / 100).toFixed(0)}/seat/mo{!p.stripe_team_price_id ? " (not yet configured)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="seatCount" className="block text-sm font-medium text-slate-300 mb-1">
              Number of seats
            </label>
            <input
              id="seatCount"
              name="seatCount"
              type="number"
              min={1}
              defaultValue={5}
              required
              className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className="mt-1 text-xs text-slate-500">Volume discounts apply automatically at checkout for larger teams.</p>
          </div>

          <div>
            <label htmlFor="interval" className="block text-sm font-medium text-slate-300 mb-1">
              Billing
            </label>
            <select
              id="interval"
              name="interval"
              className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual (save vs. monthly)</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-md gold-button gold-cta-glow text-sm font-medium px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            Continue to Stripe Checkout
          </button>
        </form>
      </Card>

      <p className="text-center text-xs text-slate-500">
        Billing is processed securely by Stripe (test mode) — your card details never touch our servers.
      </p>
    </div>
  );
}
