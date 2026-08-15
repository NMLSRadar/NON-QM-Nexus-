"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/repository/membership";
import { sendTransactionalEmail } from "@/lib/email";
import { subscriptionCanceledEmail, subscriptionReactivatedEmail } from "@/lib/emailTemplates";
import { getStripe } from "@/lib/stripe";
import {
  gracefullyCancelSchedule,
  isCommitmentKind,
  resumeCommitmentSchedule,
} from "@/lib/billing/commitment";

export interface CancelSubscriptionState {
  error?: string;
  success?: boolean;
}

/**
 * Self-serve cancellation. Standard subscriptions: Stripe
 * cancel_at_period_end (unchanged). 3-Month Commitment subscriptions are
 * managed by a Subscription Schedule, and Stripe rejects
 * cancel_at_period_end on them directly ("update the schedule instead" —
 * verified in test mode 2026-08-15); the schedule is trimmed so the
 * membership ends at the CURRENT billing period's close — the customer
 * keeps access through the period they've already paid for, exactly like
 * a standard subscription — and Stripe sets subscription.cancel_at to
 * that date. The webhook then mirrors the state back.
 *
 * The commitment remains a 3-Month Commitment contract: canceling ends
 * the schedule, which ends the future $120/$150 charges; nothing lets
 * front-end logic keep the $120 rate beyond its schedule.
 */
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
    const stripe = getStripe();
    try {
      const subscription = await stripe.subscriptions.retrieve(plan.stripeSubscriptionId);

      if (plan.stripeSubscriptionScheduleId || isCommitmentKind(plan.membershipKind)) {
        // Schedule-managed (commitment) subscription.
        const scheduleId = plan.stripeSubscriptionScheduleId;
        if (!scheduleId) {
          return { error: "This subscription is managed by a billing schedule we can't resolve — please contact support." };
        }
        await gracefullyCancelSchedule(stripe, scheduleId, subscription);
      } else {
        await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
      }
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
    // cancel at the period's close — resuming clears the cancellation.
    // A subscription Stripe has already fully ended cannot be "resumed";
    // the user would need to check out again for a new subscription.
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(plan.stripeSubscriptionId);

      if (plan.stripeSubscriptionScheduleId || isCommitmentKind(plan.membershipKind)) {
        // Schedule-managed (commitment) subscription: rebuild the
        // two-phase schedule (restores the $120 remainder if the
        // commitment hasn't fully ended yet, or goes straight to $150).
        // Stripe is asked for the plan prices because getEffectivePlan
        // intentionally doesn't expose plan_id.
        const scheduleId = plan.stripeSubscriptionScheduleId;
        if (!scheduleId) {
          return { error: "This commitment is managed by a Stripe schedule we couldn't resolve — please contact support." };
        }
        const { data: subRow } = await supabase
          .from("user_subscriptions")
          .select("plan_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const currentPlanId = (subRow?.plan_id as string | null) ?? null;
        if (!currentPlanId) {
          return { error: "This commitment has no plan on file — please contact support." };
        }
        const { data: planDef } = await supabase
          .from("membership_plans")
          .select("stripe_price_id, stripe_commitment_price_id")
          .eq("id", currentPlanId)
          .maybeSingle();
        const commitmentPriceId = (planDef?.stripe_commitment_price_id as string | null) ?? null;
        const standardPriceId = (planDef?.stripe_price_id as string | null) ?? null;
        if (!commitmentPriceId || !standardPriceId) {
          return { error: "The commitment price configuration is missing — please contact support." };
        }
        await resumeCommitmentSchedule({
          stripe,
          scheduleId,
          subscription,
          commitmentPriceId,
          standardPriceId,
          commitmentEnd: plan.commitmentEndDate,
        });
      } else {
        await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: false });
      }
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