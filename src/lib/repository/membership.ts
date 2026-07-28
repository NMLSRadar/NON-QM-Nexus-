import type { SupabaseClient } from "@supabase/supabase-js";

export interface EffectivePlan {
  /** The lender tier level (1, 2, or 3) this user's subscription unlocks. 0 = no active plan (including a canceled one). */
  tierLevel: number;
  planName: string | null;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  /** "monthly" | "annual" — which recurring price this subscription is actually on ("monthly" for a comped/no-plan account too). */
  billingInterval: "monthly" | "annual";
  discountPercentOff: number | null;
  /** The price for the active billingInterval, with the discount applied, or null if no plan. */
  effectivePriceCents: number | null;
  /** Set if the user canceled (self-serve or admin) — the plan/price above still reflect what they had, for display. */
  canceledAt: string | null;
  /** "stripe" for a real paid subscription, "comped" for an admin-granted
   * free/discounted subscription with no Stripe object behind it, or null
   * if there's no subscription row at all. */
  source: "stripe" | "comped" | null;
  /** Set only for source === "stripe" — used to route cancel/reactivate
   * through the Stripe API instead of the local-only RPCs. */
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** True only while an ACTIVE (non-expired) trial is granting this
   * tierLevel — see Phase 1/3 of the 14-day trial spec (2026-07-28).
   * tierLevel above already reflects expiration (resolves to 0 once
   * trial_expires_at has passed — see getEffectivePlan below), so this
   * flag exists purely so the UI can show trial-specific copy ("N days
   * remaining in your trial") rather than treating trial access
   * identically to a real paid Enterprise subscription. */
  isTrial: boolean;
  /** Set whenever a trial_expires_at value exists on the row, whether or
   * not the trial is still active — lets the UI show "your trial ended
   * on <date>" even after expiration recomputes tierLevel to 0. */
  trialExpiresAt: string | null;
}

const NO_PLAN: EffectivePlan = {
  tierLevel: 0,
  planName: null,
  monthlyPriceCents: null,
  annualPriceCents: null,
  billingInterval: "monthly",
  discountPercentOff: null,
  effectivePriceCents: null,
  canceledAt: null,
  source: null,
  stripeSubscriptionId: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  isTrial: false,
  trialExpiresAt: null,
};

/**
 * Platform admins must never be silently locked out of the catalog they
 * administer. A platform-admin account that somehow has no
 * user_subscriptions row at all (never assigned a plan, or one manually
 * deleted) would otherwise resolve to tierLevel 0 — every real lender is
 * tier >= 1, so it would look, from the admin's own account, as if every
 * scenario simply has no applicable lenders. This self-heals that: the
 * FIRST time such an account's plan is resolved, it's auto-assigned a
 * comped Enterprise subscription (the top tier), so the gap can never
 * recur silently. Returns null (falling through to NO_PLAN) if this
 * account isn't a platform admin, or if the Enterprise plan / the write
 * itself isn't available for any reason — this must never throw and block
 * an ordinary read.
 */
async function autoProvisionAdminSubscription(supabase: SupabaseClient, userId: string): Promise<EffectivePlan | null> {
  const { data: userRow } = await supabase.from("users").select("platform_admin").eq("id", userId).maybeSingle();
  if (!userRow?.platform_admin) return null;

  const { data: enterprisePlan } = await supabase
    .from("membership_plans")
    .select("id, name, monthly_price_cents, tier_level")
    .eq("key", "enterprise")
    .maybeSingle();
  if (!enterprisePlan) return null;

  const { error: upsertError } = await supabase.from("user_subscriptions").upsert(
    { user_id: userId, plan_id: enterprisePlan.id, discount_id: null, assigned_by: userId, canceled_at: null, source: "comped" },
    { onConflict: "user_id" }
  );
  if (upsertError) return null;

  return {
    tierLevel: enterprisePlan.tier_level as number,
    planName: enterprisePlan.name as string,
    monthlyPriceCents: enterprisePlan.monthly_price_cents as number,
    annualPriceCents: null,
    billingInterval: "monthly",
    discountPercentOff: null,
    effectivePriceCents: enterprisePlan.monthly_price_cents as number,
    canceledAt: null,
    source: "comped",
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    isTrial: false,
    trialExpiresAt: null,
  };
}

/**
 * Resolves the signed-in user's current subscription tier, price, and any
 * active discount. Admin-assigned only (see supabase/membership-rls.sql) —
 * a user with no row in user_subscriptions, or a null plan_id, has no
 * active plan and therefore tier level 0 (no lenders visible), matching
 * the "admin-controlled only for now" membership model — UNLESS this
 * account is itself a platform admin with no subscription row at all, in
 * which case see autoProvisionAdminSubscription() above.
 *
 * A canceled subscription (canceled_at set — see
 * supabase/subscription-cancellation.sql) also resolves to tier level 0
 * (no lender access), but still reports the plan/price/canceledAt so the
 * account page can show what was canceled and when.
 */
export async function getEffectivePlan(supabase: SupabaseClient, userId: string): Promise<EffectivePlan> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select(
      "canceled_at, source, stripe_subscription_id, cancel_at_period_end, current_period_end, billing_interval, is_trial, trial_expires_at, plan:membership_plans(name, monthly_price_cents, annual_price_cents, tier_level), discount:discounts(percent_off)"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve subscription: ${error.message}`);
  if (!data) {
    const autoProvisioned = await autoProvisionAdminSubscription(supabase, userId);
    return autoProvisioned ?? NO_PLAN;
  }

  const plan = Array.isArray(data.plan) ? data.plan[0] : data.plan;
  const discount = Array.isArray(data.discount) ? data.discount[0] : data.discount;
  if (!plan) return NO_PLAN;

  const canceledAt = (data.canceled_at as string | null) ?? null;
  const isTrial = (data.is_trial as boolean | null) ?? false;
  const trialExpiresAt = (data.trial_expires_at as string | null) ?? null;
  // Trial expiration (Phase 3 — automatic, server-clock-only): a trial row
  // resolves to tier 0 the instant `now()` (this server's own clock, via
  // `new Date()` — never a client-supplied timestamp, never the client's
  // device clock) passes trial_expires_at. No admin action, cron job, or
  // background sweep is required for this to take effect — every single
  // tier-gated read (listLenders, listPrograms, the AI assistant, etc.)
  // calls getEffectivePlan on every request, so expiration is enforced at
  // the moment of read, exactly like the existing canceled_at check below.
  const trialExpired = isTrial && trialExpiresAt !== null && new Date(trialExpiresAt).getTime() <= Date.now();
  const percentOff = discount?.percent_off ?? 0;
  const billingInterval: "monthly" | "annual" = (data.billing_interval as string) === "annual" ? "annual" : "monthly";
  const annualPriceCents = (plan.annual_price_cents as number | null) ?? null;
  const basePriceCents = billingInterval === "annual" && annualPriceCents != null ? annualPriceCents : (plan.monthly_price_cents as number);
  const effectivePriceCents = Math.round(basePriceCents * (1 - percentOff / 100));

  return {
    tierLevel: canceledAt || trialExpired ? 0 : (plan.tier_level as number),
    planName: plan.name as string,
    monthlyPriceCents: plan.monthly_price_cents as number,
    annualPriceCents,
    billingInterval,
    discountPercentOff: discount ? percentOff : null,
    effectivePriceCents,
    canceledAt,
    source: (data.source as "stripe" | "comped" | null) ?? "comped",
    stripeSubscriptionId: (data.stripe_subscription_id as string | null) ?? null,
    cancelAtPeriodEnd: (data.cancel_at_period_end as boolean | null) ?? false,
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
    isTrial: isTrial && !trialExpired,
    trialExpiresAt,
  };
}
