import { createClient } from "@/lib/supabase/server";
import { PricingPlans, type PricingPlanRow } from "./pricing-plans";

export const dynamic = "force-dynamic";

interface PlanRow {
  id: string;
  key: string;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  tier_level: number;
  description: string | null;
  stripe_price_id: string | null;
  stripe_annual_price_id: string | null;
}

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("membership_plans")
    .select(
      "id, key, name, monthly_price_cents, annual_price_cents, tier_level, description, stripe_price_id, stripe_annual_price_id"
    )
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  const rows = (data ?? []) as PlanRow[];
  const highlightedKey = rows[1]?.key; // the middle-priced active plan, if any

  const plans: PricingPlanRow[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    monthlyPriceCents: r.monthly_price_cents,
    annualPriceCents: r.annual_price_cents,
    tierLevel: r.tier_level,
    description: r.description,
    stripePriceId: r.stripe_price_id,
    stripeAnnualPriceId: r.stripe_annual_price_id,
  }));

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h1 className="text-3xl font-semibold text-white">Simple, transparent pricing</h1>
        <p className="text-slate-400">
          Every plan includes the deterministic calculation and matching engine — no black-box AI eligibility
          decisions, ever.
        </p>
      </div>

      <PricingPlans plans={plans} isSignedIn={Boolean(user)} highlightedKey={highlightedKey} />

      <p className="text-center text-xs text-slate-500 max-w-2xl mx-auto">
        Billing is processed securely by Stripe — your card details never touch our servers. Cancel anytime from your
        account page; you keep access through the end of the period you&apos;ve already paid for.
      </p>
    </div>
  );
}
