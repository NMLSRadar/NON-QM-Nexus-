"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

/**
 * Opens the Stripe-hosted Customer Portal for the signed-in user — lets
 * them update payment method, view invoices, and cancel/resume their
 * subscription without any custom billing UI in this app. Only meaningful
 * for a "stripe"-sourced subscription; comped users have no Stripe customer.
 *
 * Returns the portal URL rather than calling next/navigation's redirect()
 * internally: this action is invoked as a plain awaited function call from
 * a client component (not bound to a <form action={...}> prop), and in
 * that calling shape the special NEXT_REDIRECT exception reaches the
 * caller as a normal thrown error instead of being auto-handled into a
 * navigation — the same gap found and fixed in
 * src/app/scenarios/new/actions.ts. The portal URL is also external
 * (checkout.stripe.com), so the client navigates via
 * `window.location.href`, not the Next.js router.
 */
export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please sign in again." };

  const { data: row, error } = await supabase.from("users").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (error) return { error: `Failed to load billing info: ${error.message}` };
  const stripeCustomerId = row?.stripe_customer_id as string | null | undefined;
  if (!stripeCustomerId) {
    return { error: "No billing account found yet — subscribe to a plan first." };
  }

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/account`,
  });

  return { url: session.url };
}
