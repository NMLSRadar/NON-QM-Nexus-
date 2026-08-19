import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedLenderCount } from "@/lib/repository/supabaseRepository";
import { PricingPlans, type PricingPlanRow } from "./pricing-plans";
import { TeamsPanel } from "./teams-panel";
import { pageMetadata } from "@/lib/seo";
import { formatCents } from "@/lib/billing/money";
import { ANNUAL_PRICE_CENTS, PLANS } from "@/config/pricing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Pricing — NON-QM Nexus Membership",
  description:
    `${formatCents(PLANS.monthly.amountCents)}/month, or four required ${formatCents(PLANS.commit_4mo.amountCents)} monthly payments before automatic month-to-month renewal.`,
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
  stripe_commitment_price_id: string | null;
}

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("membership_plans")
    .select(
      "id, key, name, monthly_price_cents, annual_price_cents, tier_level, description, stripe_price_id, stripe_annual_price_id, stripe_commitment_price_id"
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
    annualPriceCents: r.stripe_annual_price_id ? ANNUAL_PRICE_CENTS : null,
    tierLevel: r.tier_level,
    description: r.description,
    stripePriceId: r.stripe_price_id,
    stripeAnnualPriceId: r.stripe_annual_price_id,
    stripeCommitmentPriceId: r.stripe_commitment_price_id,
  }));

  // Copy-integrity fix (launch-hardening spec, Section 5): the "N currently
  // verified lenders" bullet is derived live from the exact same
  // verified-only query the quarantine logic uses (getVerifiedLenderCount),
  // never a hand-typed number that can drift from reality.
  const verifiedLenderCount = await getVerifiedLenderCount(supabase);

  return (
    <div className="nexus-workspace nexus-pricing-page gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-8">
      <div className="nexus-pricing-hero text-center max-w-2xl mx-auto space-y-4">
        <span className="inline-block whitespace-nowrap rounded-full border border-amber-400/50 bg-amber-500/5 px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white sm:text-[11px] sm:tracking-[0.22em]">
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
        Billing is processed securely by Stripe — your card details never touch our servers. Monthly memberships can
        be canceled at the period end. The four-month option keeps all four committed payments due and can be set not
        to renew after its commitment boundary.
      </p>
    </div>
  );
}