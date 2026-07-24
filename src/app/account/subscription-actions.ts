"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/repository/membership";
import { sendTransactionalEmail } from "@/lib/email";
import { subscriptionCanceledEmail, subscriptionReactivatedEmail } from "@/lib/emailTemplates";
import { getStripe } from "@/lib/stripe";

export interface CancelSubscriptionState {
  error?: string;
  success?: boolean;
}

export async function cancelSubscription(
  _prev: CancelSubscriptionState,
  _formData: FormData
): Promise<CancelSubscriptionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const plan = await getEffectivePlan(supabase, user.id);

  if (plan.source === "stripe" && plan.stripeSubscriptionId) {
    // Real paid subscription: cancel at period end via Stripe. The local
    // canceled_at / cancel_at_period_end fields are then updated by the
    // customer.subscription.updated webhook, not directly here — this
    // keeps the webhook as the single writer of Stripe-sourced state, per
    // docs/billing.md. We still update immediately below as a
    // best-effort UI reflection so the account page doesn't look stale
    // until the webhook round-trips.
    try {
      const stripe = getStripe();
      await stripe.subscriptions.update(plan.stripeSubscriptionId, { cancel_at_period_end: true });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to cancel with Stripe." };
    }
  } else {
    // Comped (admin-granted, no Stripe object) subscription — the original
    // narrow, security-definer RPC path.
    const { error } = await supabase.rpc("cancel_own_subscription");
    if (error) {
      return { error: error.message };
    }
  }

  try {
    const updatedPlan = await getEffectivePlan(supabase, user.id);
    if (updatedPlan.planName && user.email) {
      const { subject, html } = subscriptionCanceledEmail({
        planName: updatedPlan.planName,
        canceledAtIso: updatedPlan.currentPeriodEnd ?? updatedPlan.canceledAt ?? new Date().toISOString(),
      });
      const result = await sendTransactionalEmail({ to: user.email, subject, html });
      if (!result.ok) {
        console.error("Cancellation email failed to send:", result.error);
      }
    }
  } catch (err) {
    console.error("Cancellation email threw:", err);
  }

  revalidatePath("/account");
  return { success: true };
}

export interface ReactivateSubscriptionState {
  error?: string;
  success?: boolean;
}

export async function reactivateSubscription(
  _prev: ReactivateSubscriptionState,
  _formData: FormData
): Promise<ReactivateSubscriptionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const plan = await getEffectivePlan(supabase, user.id);

  if (plan.source === "stripe" && plan.stripeSubscriptionId) {
    // Only meaningful while the subscription is still active but set to
    // cancel at period end — resuming just clears that flag with Stripe.
    // A subscription Stripe has already fully ended cannot be "resumed";
    // the user would need to check out again for a new subscription.
    try {
      const stripe = getStripe();
      await stripe.subscriptions.update(plan.stripeSubscriptionId, { cancel_at_period_end: false });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to reactivate with Stripe." };
    }
  } else {
    const { error } = await supabase.rpc("reactivate_own_subscription");
    if (error) {
      return { error: error.message };
    }
  }

  try {
    const updatedPlan = await getEffectivePlan(supabase, user.id);
    if (updatedPlan.planName && updatedPlan.monthlyPriceCents != null && user.email) {
      const { subject, html } = subscriptionReactivatedEmail({
        planName: updatedPlan.planName,
        monthlyPriceCents: updatedPlan.monthlyPriceCents,
      });
      const result = await sendTransactionalEmail({ to: user.email, subject, html });
      if (!result.ok) {
        console.error("Reactivation email failed to send:", result.error);
      }
    }
  } catch (err) {
    console.error("Reactivation email threw:", err);
  }

  revalidatePath("/account");
  return { success: true };
}
