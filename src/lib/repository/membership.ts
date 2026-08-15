import type { SupabaseClient } from "@supabase/supabase-js";
import { commitmentMonthOf, type MembershipKind } from "@/lib/billing/commitment";

export interface OrgCoverage {
  organizationId: string;
  organizationName: string;
  planName: string;
  /** The lender tier level this org subscription grants the covered member. */
  tierLevel: number;
}

export interface EffectivePlan {
  /** The lender tier level (1, 2, or 3) this user's subscription unlocks. 0 = no active plan (including a canceled one). This is already MAX(personal tier, org-coverage tier) — see resolveOrgCoverage() below — so every existing caller (getLenderAccessInfo, etc.) gets team coverage for free with no changes on their end. */
  tierLevel: number;
  planName: string | null;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  /** "monthly" | "annual" — which recurring price this subscription is actually on ("monthly" for a comped/no-plan account too). */
  billingInterval: "monthly" | "annual";
  discountPercentOff: number | null;
  /** The price for the active billingInterval, with the discount applied, or null if no plan. For a member inside the 3-Month Commitment this is the CURRENT billable rate ($120) rather than the plan's standard $150. */
  effectivePriceCents: number | null;
  /** Set if the user canceled (self-serve or admin) — the plan/price above still reflect what they had, for display. */
  canceledAt: string | null;
  /** "stripe" for a real paid subscription, "comped" for an admin-granted
   * free/discounted subscription with no Stripe object behind it, or null
   * if there's no PERSONAL subscription row at all (may still be covered
   * by an org plan — see orgCoverage). */
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
  /** 3-Month Commitment fields (2026-08-15) — server-side mirrors of the
   * Stripe Subscription Schedule state maintained by the webhook
   * (src/app/api/webhooks/stripe/route.ts). Stripe is the source of
   * truth; these exist so account/admin UIs render the commitment without
   * per-request Stripe round-trips. Always "standard" / nulls for every
   * pre-existing membership — the new option changes nothing for existing
   * $150/month members. */
  membershipKind: MembershipKind;
  stripeSubscriptionScheduleId: string | null;
  commitmentStartDate: string | null;
  commitmentEndDate: string | null;
  standardRateStartDate: string | null;
  /** The CURRENT Stripe-billed monthly rate in cents ($120 inside the
   * commitment, $150 once it completes) — null when unknown/comped. */
  currentMonthlyPriceCents: number | null;
  /** "Month X of 3" (1..3) while inside the commitment period, else null. */
  commitmentMonth: number | null;
  /** Stripe subscription.cancel_at (graceful schedule cancel), if set. */
  cancelAt: string | null;
  /** Set when this user's effective tier is (at least partly) granted by an
   * org team subscription they're a covered member of — see
   * resolveOrgCoverage(). Null if the user has no qualifying org coverage
   * (no covered membership, org sub inactive/expired, or bumped out by
   * seat-count determinism). Distinct from — and can coexist with — a
   * personal subscription; the higher tier wins for tierLevel above, but
   * this field always reports org coverage when it exists so the account
   * page can show "covered by <Org>'s <Plan>" regardless of which one
   * currently wins. */
  orgCoverage: OrgCoverage | null;
}

const NO_PLAN_BASE: Omit<EffectivePlan, "orgCoverage"> = {
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
  membershipKind: "standard",
  stripeSubscriptionScheduleId: null,
  commitmentStartDate: null,
  commitmentEndDate: null,
  standardRateStartDate: null,
  currentMonthlyPriceCents: null,
  commitmentMonth: null,
  cancelAt: null,
};

/**
 * Resolves whether — and at what tier — the given user is currently
 * COVERED by an organization's team subscription (org_subscriptions).
 *
 * Coverage requires all of:
 *   1. An active (deleted_at is null) membership with covered_by_org_plan = true.
 *   2. That org has an org_subscriptions row with status = 'active'.
 *   3. That row's current_period_end is null (comped, no period) or still
 *      in the future (a Stripe sub whose period hasn't lapsed yet).
 *   4. Seat-count determinism: coverage never exceeds seats. A member's own
 *      covered flag can be true in the DB (e.g. a stale toggle from before a
 *      seat_count reduction) yet still resolve as UNCOVERED / lower here
 *      when they don't fall within the org's oldest seat_count covered
 *      members (ordered by membership created_at ascending — oldest wins
 *      ties deterministically).
 *
 * A user can hold covered memberships in more than one org (e.g. accepted
 * two invites) — this returns the HIGHEST qualifying tier across all of
 * them, matching getEffectivePlan()'s own MAX(personal, org) semantics.
 */
export async function resolveOrgCoverage(supabase: SupabaseClient, userId: string): Promise<OrgCoverage | null> {
  const { data: coveredMemberships, error } = await supabase
    .from("memberships")
    .select("id, organization_id, organization:organizations(name)")
    .eq("user_id", userId)
    .eq("covered_by_org_plan", true)
    .is("deleted_at", null);
  if (error) {
    // Graceful degradation for the window between this code shipping and
    // the live database actually being migrated (see HANDOFF.md) —
    // memberships.covered_by_org_plan / org_subscriptions not existing yet
    // must NOT break every other caller of getEffectivePlan() (every
    // tier-gated read in the app). Any other error still throws normally.
    if (/column .*covered_by_org_plan.* does not exist|relation .*org_subscriptions.* does not exist/i.test(error.message)) {
      return null;
    }
    throw new Error(`Failed to resolve org coverage: ${error.message}`);
  }
  if (!coveredMemberships || coveredMemberships.length === 0) return null;

  let best: OrgCoverage | null = null;

  for (const membership of coveredMemberships) {
    const organizationId = membership.organization_id as string;

    const { data: orgSub, error: subError } = await supabase
      .from("org_subscriptions")
      .select("seat_count, current_period_end, plan:membership_plans(name, tier_level)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .maybeSingle();
    if (subError) throw new Error(`Failed to resolve org subscription: ${subError.message}`);
    if (!orgSub) continue;

    const currentPeriodEnd = orgSub.current_period_end as string | null;
    const periodCurrent = !currentPeriodEnd || new Date(currentPeriodEnd).getTime() > Date.now();
    if (!periodCurrent) continue;

    const seatCount = orgSub.seat_count as number;
    const { data: seatWindow, error: seatError } = await supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("covered_by_org_plan", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(seatCount);
    if (seatError) throw new Error(`Failed to resolve seat window: ${seatError.message}`);
    const withinSeats = (seatWindow ?? []).some((row) => row.id === membership.id);
    if (!withinSeats) continue;

    const plan = Array.isArray(orgSub.plan) ? orgSub.plan[0] : orgSub.plan;
    if (!plan) continue;

    const tierLevel = plan.tier_level as number;
    if (!best || tierLevel > best.tierLevel) {
      const org = Array.isArray(membership.organization) ? membership.organization[0] : membership.organization;
      best = {
        organizationId,
        organizationName: (org?.name as string | undefined) ?? "Your organization",
        planName: plan.name as string,
        tierLevel,
      };
    }
  }

  return best;
}

/**
 * Platform admins must never be silently locked out of the catalog they
 * administer. A platform-admin account that somehow has no
 * user_subscriptions row at all (never assigned a plan, or one manually
 * deleted) would otherwise resolve to tierLevel 0 — every real lender is
 * tier >= 1, so it would look, from the admin's own account, as if every
 * scenario simply has no applicable lenders. This self-heals that: the
 * FIRST time such an account's plan is resolved, it's auto-assigned a
 * comped Enterprise subscription (the top tier), so the gap can never
 * recur silently. Returns null (falling through to no personal plan) if
 * this account isn't a platform admin, or if the Enterprise plan / the
 * write itself isn't available for any reason — this must never throw and
 * block an ordinary read.
 */
async function autoProvisionAdminSubscription(supabase: SupabaseClient, userId: string): Promise<Omit<EffectivePlan, "orgCoverage"> | null> {
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
    membershipKind: "standard",
    stripeSubscriptionScheduleId: null,
    commitmentStartDate: null,
    commitmentEndDate: null,
    standardRateStartDate: null,
    currentMonthlyPriceCents: null,
    commitmentMonth: null,
    cancelAt: null,
  };
}

/**
 * Resolves the signed-in user's current EFFECTIVE subscription tier, price,
 * and any active discount — as MAX(personal subscription tier, org-coverage
 * tier), per the Team Membership spec (2026-07-30): personal and org
 * subscriptions coexist, the higher tier wins. See resolveOrgCoverage()
 * above for exactly how org coverage is determined (including the seat-
 * count-determinism rule) and OrgCoverage's doc comment for what's exposed
 * to the UI regardless of which one currently wins.
 */
export async function getEffectivePlan(supabase: SupabaseClient, userId: string): Promise<EffectivePlan> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select(
      "canceled_at, source, stripe_subscription_id, stripe_subscription_schedule_id, cancel_at_period_end, cancel_at, current_period_end, billing_interval, is_trial, trial_expires_at, membership_kind, commitment_start_date, commitment_end_date, standard_rate_start_date, current_monthly_price_cents, plan:membership_plans(name, monthly_price_cents, annual_price_cents, tier_level), discount:discounts(percent_off)"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve subscription: ${error.message}`);

  const orgCoverage = await resolveOrgCoverage(supabase, userId);

  let personal: Omit<EffectivePlan, "orgCoverage">;

  if (!data) {
    personal = (await autoProvisionAdminSubscription(supabase, userId)) ?? NO_PLAN_BASE;
  } else {
    const plan = Array.isArray(data.plan) ? data.plan[0] : data.plan;
    const discount = Array.isArray(data.discount) ? data.discount[0] : data.discount;

    if (!plan) {
      personal = NO_PLAN_BASE;
    } else {
      const canceledAt = (data.canceled_at as string | null) ?? null;
      const isTrial = (data.is_trial as boolean | null) ?? false;
      const trialExpiresAt = (data.trial_expires_at as string | null) ?? null;
      // Trial expiration (Phase 3 — automatic, server-clock-only): a trial row
      // resolves to tier 0 the instant `now()` (this server's own clock, via
      // `new Date()` — never a client-supplied timestamp, never the client's
      // device clock) passes trial_expires_at. No admin action, cron job, or
      // background sweep is required.
      const trialExpired = isTrial && trialExpiresAt !== null && new Date(trialExpiresAt).getTime() <= Date.now();
      const percentOff = (discount?.percent_off as number | undefined) ?? 0;

      // 3-Month Commitment mirrors (webhook-maintained; Stripe is truth).
      const membershipKind = ((data.membership_kind as string | null) ?? "standard") as MembershipKind;
      const commitmentStartDate = (data.commitment_start_date as string | null) ?? null;
      const commitmentEndDate = (data.commitment_end_date as string | null) ?? null;
      const standardRateStartDate = (data.standard_rate_start_date as string | null) ?? null;
      const currentMonthlyPriceCents = (data.current_monthly_price_cents as number | null) ?? null;
      const stripeSubscriptionScheduleId = (data.stripe_subscription_schedule_id as string | null) ?? null;
      const cancelAt = (data.cancel_at as string | null) ?? null;

      const billingInterval: "monthly" | "annual" = (data.billing_interval as string) === "annual" ? "annual" : "monthly";
      const annualPriceCents = (plan.annual_price_cents as number | null) ?? null;

      // A 3-Month Commitment member is actually billed at the CURRENT
      // monthly rate ($120 inside the commitment, $150 after it completes),
      // not the plan's standard monthly price — display what Stripe bills.
      const basePriceCents =
        membershipKind === "commitment" && currentMonthlyPriceCents != null
          ? currentMonthlyPriceCents
          : billingInterval === "annual" && annualPriceCents != null
            ? annualPriceCents
            : (plan.monthly_price_cents as number);
      const effectivePriceCents = Math.round(basePriceCents * (1 - percentOff / 100));

      personal = {
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
        membershipKind,
        stripeSubscriptionScheduleId,
        commitmentStartDate,
        commitmentEndDate,
        standardRateStartDate,
        currentMonthlyPriceCents,
        commitmentMonth: commitmentMonthOf(commitmentStartDate, commitmentEndDate),
        cancelAt,
      };
    }
  }

  const effectiveTierLevel = Math.max(personal.tierLevel, orgCoverage?.tierLevel ?? 0);

  return { ...personal, tierLevel: effectiveTierLevel, orgCoverage };
}