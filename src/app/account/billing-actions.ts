"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

/**
 * Opens the Stripe-hosted Customer Portal for the signed-in user — lets
 * them update payment method, view invoices, and cancel/resume their
 * subscription without any custom billing UI in this app. Only meaningful
 * for a "stripe"-sourced subscription; comped users have no Stripe customer.
 */
export async function openBillingPortal(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const { data: row, error } = await supabase.from("users").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (error) throw new Error(`Failed to load billing info: ${error.message}`);
  const stripeCustomerId = row?.stripe_customer_id as string | null | undefined;
  if (!stripeCustomerId) {
    throw new Error("No billing account found yet — subscribe to a plan first.");
  }

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/account`,
  });

  redirect(session.url);
}
