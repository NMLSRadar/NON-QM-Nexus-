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
