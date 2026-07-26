import Link from "next/link";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { startCheckout } from "./checkout-actions";

export const dynamic = "force-dynamic";

interface PlanRow {
  id: string;
  key: string;
  name: string;
  monthly_price_cents: number;
  tier_level: number;
  description: string | null;
  stripe_price_id: string | null;
}

// Feature bullets keyed by tier_level — the admin portal (/admin/plans)
// controls name, price, and tier_level live from the database; these
// descriptive bullets are presentational copy, not billing logic.
const TIER_FEATURES: Record<number, string[]> = {
  1: [
    "Compare guidelines from the Top 12 Non-QM lenders",
    "Deterministic eligibility matching",
    "Saved scenarios",
    "Email support",
  ],
  2: [
    "Everything in Essential",
    "Compare guidelines from the Top 25 Non-QM lenders",
    "Voice scenario intake",
    "Restructuring & needs-list generation",
    "Priority email support",
  ],
  3: [
    "Everything in Professional",
    "Full access to every Non-QM lender in the platform",
    "Automatically includes any future lenders added",
    "No restrictions on guideline comparisons",
    "Dedicated support",
  ],
};

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("membership_plans")
    .select("id, key, name, monthly_price_cents, tier_level, description, stripe_price_id")
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  const plans = (data ?? []) as PlanRow[];
  const highlightedKey = plans[1]?.key; // the middle-priced active plan, if any

  return (
    <div className="gold-theme -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h1 className="text-3xl font-semibold text-white">Simple, transparent pricing</h1>
        <p className="text-slate-400">
          Every plan includes the deterministic calculation and matching engine — no black-box AI eligibility
          decisions, ever.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 items-stretch">
        {plans.map((plan) => {
          const highlighted = plan.key === highlightedKey;
          const priceDollars = plan.monthly_price_cents / 100;
          return (
            <Card
              key={plan.id}
              dark
              className={`flex flex-col ${highlighted ? "ring-2 ring-amber-400 shadow-lg" : ""}`}
            >
              {highlighted ? (
                <span className="self-start mb-2 inline-block rounded-full bg-gradient-to-r from-amber-300 to-amber-600 text-black text-[11px] font-semibold px-2.5 py-0.5">
                  Most popular
                </span>
              ) : null}
              <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
              <p className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-white">
                  ${priceDollars % 1 === 0 ? priceDollars : priceDollars.toFixed(2)}
                </span>
                <span className="text-sm text-slate-400">/month</span>
              </p>
              <p className="mt-2 text-sm text-slate-400">{plan.description}</p>

              <ul className="mt-4 space-y-2 flex-1">
                {(TIER_FEATURES[plan.tier_level] ?? []).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <span aria-hidden className="mt-0.5 text-emerald-400">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {user ? (
                plan.stripe_price_id ? (
                  <form action={startCheckout}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <button
                      type="submit"
                      className={`mt-6 w-full rounded-md text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                        highlighted
                          ? "gold-button"
                          : "bg-white/5 border border-amber-500/20 text-white hover:bg-white/10"
                      }`}
                    >
                      Subscribe
                    </button>
                  </form>
                ) : (
                  <p className="mt-6 text-center text-xs text-slate-500">Billing not yet configured for this plan</p>
                )
              ) : (
                <Link
                  href={`/signup?next=/pricing`}
                  className={`mt-6 block text-center rounded-md text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                    highlighted
                      ? "gold-button"
                      : "bg-white/5 border border-amber-500/20 text-white hover:bg-white/10"
                  }`}
                >
                  Sign up to subscribe
                </Link>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-500 max-w-2xl mx-auto">
        Billing is processed securely by Stripe — your card details never touch our servers. Cancel anytime from your
        account page; you keep access through the end of the period you&apos;ve already paid for.
      </p>
    </div>
  );
}
