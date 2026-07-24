"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";

/**
 * Starts a Stripe Checkout session for the given plan and redirects the
 * user to Stripe's hosted checkout page. Card data never touches this app.
 *
 * Writes nothing to user_subscriptions itself — that only happens once
 * Stripe confirms the subscription via the checkout.session.completed
 * webhook (src/app/api/webhooks/stripe/route.ts), which is the single
 * writer of Stripe-sourced subscription state.
 */
export async function startCheckout(formData: FormData): Promise<void> {
  const planId = formData.get("planId");
  if (typeof planId !== "string" || !planId) {
    throw new Error("Missing plan.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    redirect(`/login?next=/pricing`);
  }

  const { data: plan, error: planError } = await supabase
    .from("membership_plans")
    .select("id, name, stripe_price_id, is_active")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw new Error(`Failed to load plan: ${planError.message}`);
  if (!plan || !plan.is_active) throw new Error("That plan is not available.");
  if (!plan.stripe_price_id) {
    throw new Error(`${plan.name} has no Stripe price configured yet — run scripts/stripe-setup-products.js.`);
  }

  const stripe = getStripe();
  const service = createServiceRoleClient();

  // Reuse this user's existing Stripe customer if we already created one
  // (e.g. from a prior checkout attempt), otherwise create it now and
  // persist it — service-role write, scoped to exactly this user's own row.
  const { data: existingUser, error: userError } = await service
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (userError) throw new Error(`Failed to load user: ${userError.message}`);

  let stripeCustomerId = existingUser?.stripe_customer_id as string | null | undefined;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    stripeCustomerId = customer.id;
    const { error: updateError } = await service
      .from("users")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", user.id);
    if (updateError) throw new Error(`Failed to save Stripe customer: ${updateError.message}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${appUrl}/account?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
    metadata: { supabase_user_id: user.id, membership_plan_id: plan.id },
    subscription_data: {
      metadata: { supabase_user_id: user.id, membership_plan_id: plan.id },
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  redirect(session.url);
}
