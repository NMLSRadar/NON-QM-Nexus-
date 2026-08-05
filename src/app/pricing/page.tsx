import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedLenderCount } from "@/lib/repository/supabaseRepository";
import { PricingPlans, type PricingPlanRow } from "./pricing-plans";
import { TeamsPanel } from "./teams-panel";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Pricing — NON-QM Nexus Membership",
  description:
    "One NON-QM Nexus membership: guideline-first Non-QM lender matching, voice scenario intake, and document checklists for every loan officer.",
  path: "/pricing",
});

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

  // Copy-integrity fix (launch-hardening spec, Section 5): the "N currently
  // verified lenders" bullet is derived live from the exact same
  // verified-only query the quarantine logic uses (getVerifiedLenderCount),
  // never a hand-typed number that can drift from reality.
  const verifiedLenderCount = await getVerifiedLenderCount(supabase);

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <span className="inline-block rounded-full border border-amber-400/50 bg-amber-500/5 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
          Simple. Powerful. Transparent.
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Simple, transparent <span className="text-amber-400">pricing</span>
        </h1>
        <p className="text-slate-300">
          Every plan includes the deterministic calculation and matching engine — no black-box AI eligibility
          decisions, ever.
        </p>
      </div>

      <PricingPlans plans={plans} isSignedIn={Boolean(user)} verifiedLenderCount={verifiedLenderCount} />

      <TeamsPanel isSignedIn={Boolean(user)} />

      <p className="text-center text-xs text-amber-300/80 max-w-2xl mx-auto">
        Subscriptions are currently activated by our team after signup — usually within one business day.
      </p>

      <p className="text-center text-xs text-slate-500 max-w-2xl mx-auto">
        Billing will be processed securely by Stripe — your card details never touch our servers. Cancel anytime from
        your account page; you keep access through the end of the period you&apos;ve already paid for.
      </p>
    </div>
  );
}
