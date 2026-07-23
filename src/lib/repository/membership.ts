import type { SupabaseClient } from "@supabase/supabase-js";

export interface EffectivePlan {
  /** The lender tier level (1, 2, or 3) this user's subscription unlocks. 0 = no active plan. */
  tierLevel: number;
  planName: string | null;
  monthlyPriceCents: number | null;
  discountPercentOff: number | null;
  /** monthlyPriceCents with the discount applied, or null if no active plan. */
  effectivePriceCents: number | null;
}

const NO_PLAN: EffectivePlan = {
  tierLevel: 0,
  planName: null,
  monthlyPriceCents: null,
  discountPercentOff: null,
  effectivePriceCents: null,
};

/**
 * Resolves the signed-in user's current subscription tier, price, and any
 * active discount. Admin-assigned only (see supabase/membership-rls.sql) —
 * a user with no row in user_subscriptions, or a null plan_id, has no
 * active plan and therefore tier level 0 (no lenders visible), matching
 * the "admin-controlled only for now" membership model.
 */
export async function getEffectivePlan(supabase: SupabaseClient, userId: string): Promise<EffectivePlan> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("plan:membership_plans(name, monthly_price_cents, tier_level), discount:discounts(percent_off)")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve subscription: ${error.message}`);
  if (!data) return NO_PLAN;

  const plan = Array.isArray(data.plan) ? data.plan[0] : data.plan;
  const discount = Array.isArray(data.discount) ? data.discount[0] : data.discount;
  if (!plan) return NO_PLAN;

  const percentOff = discount?.percent_off ?? 0;
  const effectivePriceCents = Math.round((plan.monthly_price_cents as number) * (1 - percentOff / 100));

  return {
    tierLevel: plan.tier_level as number,
    planName: plan.name as string,
    monthlyPriceCents: plan.monthly_price_cents as number,
    discountPercentOff: discount ? percentOff : null,
    effectivePriceCents,
  };
}
