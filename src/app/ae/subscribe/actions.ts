"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";
import { resolveStripeCustomerId } from "@/lib/billing/stripeCustomer";
import { isAeMonetizationEnabled } from "@/lib/ae/monetization";

/**
 * Starts a Stripe Checkout session for AE Featured Placement — a single
 * flat monthly price (AE_PLACEMENT_STRIPE_PRICE_ID), advertising placement
 * only (RESPA Section 8 conservative design). Writes nothing to
 * ae_placements directly — that only happens once Stripe confirms via the
 * webhook (src/app/api/webhooks/stripe/route.ts), the single writer of
 * Stripe-sourced placement state, matching the membership checkout
 * pattern exactly.
 */
export async function startAePlacementCheckout(): Promise<void> {
  if (!isAeMonetizationEnabled()) {
    throw new Error("AE Featured Placement is not yet available.");
  }

  const priceId = process.env.AE_PLACEMENT_STRIPE_PRICE_ID;
  if (!priceId) throw new Error("AE placement price is not configured — run scripts/stripe-setup-products.js.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect(`/login?next=/ae/subscribe`);

  const { data: profile, error: profileError } = await supabase.from("ae_profiles").select("id, claimed_by_user_id, status").eq("claimed_by_user_id", user.id).maybeSingle();
  if (profileError) throw new Error(`Failed to load your AE profile: ${profileError.message}`);
  if (!profile) throw new Error("Claim your AE profile first at /ae/claim.");
  if (profile.status !== "claimed") throw new Error("Your claim is still pending admin approval.");

  const stripe = getStripe();
  const service = createServiceRoleClient();

  // Same test-mode-customer repair as pricing checkout (2026-08-17): a stored
  // TEST-mode stripe_customer_id must not be reused under the LIVE key.
  const stripeCustomerId = await resolveStripeCustomerId(stripe, service, user.id, user.email);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    managed_payments: { enabled: false },
    success_url: `${appUrl}/ae/dashboard?placement=success`,
    cancel_url: `${appUrl}/ae/subscribe?placement=canceled`,
    metadata: { kind: "ae_placement", ae_profile_id: profile.id, supabase_user_id: user.id },
    subscription_data: {
      metadata: { kind: "ae_placement", ae_profile_id: profile.id, supabase_user_id: user.id },
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  redirect(session.url);
}

export async function startAePlacementPortal(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const service = createServiceRoleClient();
  const { data: existingUser } = await service.from("users").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  const stripeCustomerId = existingUser?.stripe_customer_id as string | null | undefined;
  if (!stripeCustomerId) return { error: "No billing account found yet." };

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const session = await stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url: `${appUrl}/ae/dashboard` });
  return { url: session.url };
}
