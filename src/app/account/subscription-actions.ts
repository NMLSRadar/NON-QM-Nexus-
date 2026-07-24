"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/repository/membership";
import { sendTransactionalEmail } from "@/lib/email";
import { subscriptionCanceledEmail, subscriptionReactivatedEmail } from "@/lib/emailTemplates";

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

  // Narrow, security-definer RPC — can only cancel the caller's own
  // subscription, never anyone else's or change their plan/discount.
  const { error } = await supabase.rpc("cancel_own_subscription");
  if (error) {
    return { error: error.message };
  }

  // Send the confirmation email — best-effort: a delivery failure here
  // must never block or roll back the cancellation itself, which already
  // succeeded above.
  try {
    const plan = await getEffectivePlan(supabase, user.id);
    if (plan.planName && plan.canceledAt && user.email) {
      const { subject, html } = subscriptionCanceledEmail({
        planName: plan.planName,
        canceledAtIso: plan.canceledAt,
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

  // Narrow, security-definer RPC — mirrors cancel_own_subscription(): can
  // only reactivate the caller's own subscription, and only clears
  // canceled_at (never touches plan_id/discount_id).
  const { error } = await supabase.rpc("reactivate_own_subscription");
  if (error) {
    return { error: error.message };
  }

  try {
    const plan = await getEffectivePlan(supabase, user.id);
    if (plan.planName && plan.monthlyPriceCents != null && user.email) {
      const { subject, html } = subscriptionReactivatedEmail({
        planName: plan.planName,
        monthlyPriceCents: plan.monthlyPriceCents,
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
