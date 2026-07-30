"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

export async function assignSubscription(
  userId: string,
  planId: string | null,
  discountId: string | null
): Promise<void> {
  const { supabase, userId: adminId } = await requirePlatformAdmin();
  const { error } = await supabase.from("user_subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      discount_id: discountId,
      assigned_by: adminId,
      // Assigning/changing a plan implicitly reactivates a canceled
      // subscription — an admin picking a plan for someone is a clear
      // enough signal they want it active.
      canceled_at: null,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function reactivateSubscription(userId: string): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.from("user_subscriptions").update({ canceled_at: null }).eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

/**
 * Immediately cancels a user's LIVE Stripe subscription directly from the
 * admin side (platform admin only) — via stripe.subscriptions.cancel(),
 * an immediate/hard cancellation, distinct from the self-serve
 * cancel_at_period_end flow at src/app/account/subscription-actions.ts
 * (which lets a customer's own paid period run out). This is for admin
 * cases that warrant ending access right away (fraud, chargeback, ToS
 * violation, support request) rather than the customer's own graceful
 * cancellation.
 *
 * Follows the same audited-admin-action pattern as
 * src/app/admin/teams/actions.ts's cancelCompedOrgSubscription and
 * src/app/admin/ae-profiles/comp-actions.ts: requirePlatformAdmin() gates
 * authorization, then the actual DB write and the audit_logs entry go
 * through the SERVICE ROLE client — audit_logs has no request-scoped
 * insert policy at all ("inserts only via service role (no user policy)",
 * see supabase/rls-policies.sql), so a request-scoped insert there would
 * be silently denied by RLS.
 *
 * The webhook (src/app/api/webhooks/stripe/route.ts) is normally the
 * single writer of Stripe-sourced user_subscriptions state, but it can
 * only react to Stripe's own event delivery — this action updates
 * canceled_at locally too as an immediate, best-effort UI reflection
 * (same pattern subscription-actions.ts's cancelSubscription already
 * uses), so the admin sees the change without waiting on webhook
 * round-trip / retry timing.
 */
export async function cancelStripeSubscriptionAdmin(userId: string, reason: string): Promise<{ error?: string }> {
  const { supabase, userId: adminId } = await requirePlatformAdmin();

  const { data: sub, error: fetchError } = await supabase
    .from("user_subscriptions")
    .select("source, stripe_subscription_id, canceled_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!sub || sub.source !== "stripe" || !sub.stripe_subscription_id) {
    return { error: "This user has no live Stripe subscription to cancel — use the plan/discount controls above for a comped one." };
  }
  if (sub.canceled_at) {
    return { error: "This subscription is already canceled." };
  }

  const stripeSubscriptionId = sub.stripe_subscription_id as string;
  const stripe = getStripe();
  let canceledStatus: string;
  try {
    const canceled = await stripe.subscriptions.cancel(stripeSubscriptionId);
    canceledStatus = canceled.status;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to cancel with Stripe." };
  }

  const service = createServiceRoleClient();
  const now = new Date().toISOString();
  const { error: updateError } = await service
    .from("user_subscriptions")
    .update({ canceled_at: now, cancel_at_period_end: false })
    .eq("user_id", userId);
  if (updateError) return { error: updateError.message };

  const { error: auditError } = await service.from("audit_logs").insert({
    organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
    actor_user_id: adminId,
    action: "user_subscription.stripe_canceled_by_admin",
    entity_type: "user_subscriptions",
    entity_id: userId,
    metadata: {
      reason: reason || "Admin-initiated immediate cancellation",
      stripe_subscription_id: stripeSubscriptionId,
      stripe_status_after_cancel: canceledStatus,
    },
  });
  if (auditError) console.error("Failed to write audit log for user_subscription.stripe_canceled_by_admin:", auditError.message);

  revalidatePath("/admin/users");
  return {};
}

/**
 * Reactivates a canceled Stripe-sourced subscription (platform admin
 * only) — the counterpart to cancelStripeSubscriptionAdmin above, same
 * gating + audited-write pattern. Two real cases exist depending on how
 * Stripe actually left the subscription:
 *
 * 1. Still "active"/"trialing" with cancel_at_period_end=true (the
 *    customer's own graceful self-serve cancel, see
 *    src/app/account/subscription-actions.ts, hasn't reached its period
 *    end yet) — Stripe allows simply clearing the flag via
 *    stripe.subscriptions.update(), which is the requested primary path.
 * 2. Already status="canceled" — a terminal Stripe state (this is what
 *    cancelStripeSubscriptionAdmin's immediate stripe.subscriptions.cancel()
 *    always produces, and also what a grace period that has already run
 *    out produces) — Stripe subscriptions can never be un-canceled once
 *    terminal, so the only way back is creating a brand-new subscription
 *    for the same customer + plan/price, mirroring
 *    src/app/pricing/checkout-actions.ts's startCheckout() metadata shape
 *    exactly (supabase_user_id + membership_plan_id) so the webhook's
 *    upsertFromSubscription() picks it up correctly. Uses
 *    payment_behavior: "default_incomplete" so a missing/expired card on
 *    file degrades to a clear "needs payment" state instead of throwing.
 *
 * Which case applies is only knowable by asking Stripe for the
 * subscription's REAL current status — never assumed from local state.
 */
export async function reactivateStripeSubscriptionAdmin(userId: string, reason: string): Promise<{ error?: string; message?: string }> {
  const { supabase, userId: adminId } = await requirePlatformAdmin();

  const { data: sub, error: fetchError } = await supabase
    .from("user_subscriptions")
    .select("source, stripe_subscription_id, stripe_customer_id, canceled_at, plan_id, billing_interval")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!sub || sub.source !== "stripe" || !sub.stripe_subscription_id) {
    return { error: "This user has no Stripe subscription to reactivate — use the plan/discount controls above for a comped one." };
  }
  if (!sub.canceled_at) {
    return { error: "This subscription is not canceled." };
  }

  const stripe = getStripe();
  const service = createServiceRoleClient();
  let resultMessage: string;

  try {
    const existing = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string);

    if (existing.status !== "canceled") {
      const updated = await stripe.subscriptions.update(existing.id, { cancel_at_period_end: false });
      const { error: updateError } = await service
        .from("user_subscriptions")
        .update({ canceled_at: null, cancel_at_period_end: false, stripe_status: updated.status })
        .eq("user_id", userId);
      if (updateError) return { error: updateError.message };
      resultMessage = `Resumed the existing subscription (cleared cancel-at-period-end) — status "${updated.status}".`;
    } else {
      if (!sub.plan_id) return { error: "This subscription has no plan on file to recreate — assign a plan above instead." };

      const { data: plan, error: planError } = await service
        .from("membership_plans")
        .select("id, name, stripe_price_id, stripe_annual_price_id, is_active")
        .eq("id", sub.plan_id as string)
        .maybeSingle();
      if (planError) return { error: planError.message };
      if (!plan || !plan.is_active) return { error: "This user's prior plan is no longer active — assign a different plan above instead." };

      const isAnnual = sub.billing_interval === "annual";
      const priceId = isAnnual ? plan.stripe_annual_price_id : plan.stripe_price_id;
      if (!priceId) return { error: `${plan.name} has no Stripe price configured for ${isAnnual ? "annual" : "monthly"} billing.` };

      let stripeCustomerId = sub.stripe_customer_id as string | null;
      if (!stripeCustomerId) {
        const { data: userRow } = await service.from("users").select("stripe_customer_id").eq("id", userId).maybeSingle();
        stripeCustomerId = (userRow?.stripe_customer_id as string | null) ?? null;
      }
      if (!stripeCustomerId) return { error: "No Stripe customer on file for this user — they'll need to check out fresh from /pricing instead." };

      const recreated = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        metadata: { supabase_user_id: userId, membership_plan_id: plan.id as string },
      });

      const { error: updateError } = await service
        .from("user_subscriptions")
        .update({
          stripe_subscription_id: recreated.id,
          stripe_customer_id: stripeCustomerId,
          stripe_status: recreated.status,
          canceled_at: null,
          cancel_at_period_end: false,
        })
        .eq("user_id", userId);
      if (updateError) return { error: updateError.message };

      resultMessage =
        recreated.status === "active" || recreated.status === "trialing"
          ? `Recreated a new subscription (${recreated.id}) — active immediately.`
          : `Recreated a new subscription (${recreated.id}) with status "${recreated.status}" — the customer may need to confirm payment before it activates.`;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reactivate with Stripe." };
  }

  const { error: auditError } = await service.from("audit_logs").insert({
    organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
    actor_user_id: adminId,
    action: "user_subscription.stripe_reactivated_by_admin",
    entity_type: "user_subscriptions",
    entity_id: userId,
    metadata: { reason: reason || "Admin-initiated reactivation", result: resultMessage },
  });
  if (auditError) console.error("Failed to write audit log for user_subscription.stripe_reactivated_by_admin:", auditError.message);

  revalidatePath("/admin/users");
  return { message: resultMessage };
}
