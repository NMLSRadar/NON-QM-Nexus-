"use server";

import { redirect } from "next/navigation";
import { requireOrgAdmin } from "@/lib/orgAdmin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";

/**
 * Starts a Stripe Checkout session for an org team subscription
 * (org_admin only) — Stripe licensed quantity billing, quantity =
 * seat_count. Writes nothing to org_subscriptions itself; that only
 * happens once Stripe confirms via the checkout.session.completed webhook
 * (src/app/api/webhooks/stripe/route.ts's upsertOrgSubscription), which is
 * the single writer of Stripe-sourced org_subscriptions state — mirrors
 * src/app/pricing/checkout-actions.ts's personal-plan startCheckout()
 * exactly, one level up (org, not user).
 */
export async function startTeamCheckout(formData: FormData): Promise<void> {
  const { userId, organizationId } = await requireOrgAdmin();

  const planId = formData.get("planId");
  if (typeof planId !== "string" || !planId) throw new Error("Missing plan.");
  const seatCount = Number(formData.get("seatCount"));
  if (!Number.isInteger(seatCount) || seatCount < 1) throw new Error("Seat count must be a positive whole number.");
  const interval = formData.get("interval") === "annual" ? "annual" : "monthly";

  const service = createServiceRoleClient();

  const { data: existingActive } = await service
    .from("org_subscriptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (existingActive) throw new Error("This organization already has an active team subscription.");

  const { data: plan, error: planError } = await service
    .from("membership_plans")
    .select("id, name, stripe_team_price_id, stripe_team_annual_price_id, is_active")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw new Error(`Failed to load plan: ${planError.message}`);
  if (!plan || !plan.is_active) throw new Error("That plan is not available.");
  const priceId = interval === "annual" ? plan.stripe_team_annual_price_id : plan.stripe_team_price_id;
  if (!priceId) {
    throw new Error(
      interval === "annual"
        ? `${plan.name} has no annual team price configured yet.`
        : `${plan.name} has no team price configured yet — run scripts/stripe-team-billing.js.`
    );
  }

  const { data: userRow, error: userError } = await service.from("users").select("email, stripe_customer_id").eq("id", userId).maybeSingle();
  if (userError) throw new Error(`Failed to load user: ${userError.message}`);

  const stripe = getStripe();
  let stripeCustomerId = userRow?.stripe_customer_id as string | null | undefined;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: (userRow?.email as string | undefined) ?? undefined,
      metadata: { supabase_user_id: userId },
    });
    stripeCustomerId = customer.id;
    const { error: updateError } = await service.from("users").update({ stripe_customer_id: stripeCustomerId }).eq("id", userId);
    if (updateError) throw new Error(`Failed to save Stripe customer: ${updateError.message}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: seatCount }],
    managed_payments: { enabled: false },
    success_url: `${appUrl}/account/team?checkout=success`,
    cancel_url: `${appUrl}/account/team/subscribe?checkout=canceled`,
    metadata: { team: "true", organization_id: organizationId, membership_plan_id: plan.id },
    subscription_data: {
      metadata: { team: "true", organization_id: organizationId, membership_plan_id: plan.id },
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  redirect(session.url);
}
