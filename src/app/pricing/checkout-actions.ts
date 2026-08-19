"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";
import { resolveStripeCustomerId } from "@/lib/billing/stripeCustomer";
import { KIND_COMMITMENT, KIND_STANDARD, MEMBERSHIP_KIND_METADATA_KEY } from "@/lib/billing/commitment";
import {
  COMMITMENT_DISCLOSURE,
  COMMITMENT_DISCLOSURE_VERSION,
  PRICING_VERSION,
} from "@/config/pricing";

const checkoutInput = z.object({
  planId: z.string().uuid(),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
  membership: z.enum([KIND_STANDARD, KIND_COMMITMENT]),
  commitmentAcknowledged: z.enum(["yes"]).optional(),
  commitmentDisclosureVersion: z.string().optional(),
  salesRep: z.enum(["bobby", "mike"]),
});

/**
 * Starts a Stripe Checkout session for the given plan and redirects the
 * user to Stripe's hosted checkout page. Card data never touches this app.
 *
 * Two membership options (2026-08-15):
 *   - standard  — the legacy monthly subscription (unchanged).
 *   - commitment — the commitment option: checkout at the configured commitment price
 *     commitment price; the checkout.session.completed webhook then
 *     converts the subscription to a Subscription Schedule that bills
 *     the configured term and then the monthly price
 *     (see src/lib/billing/commitment.ts). The marker travels on
 *     subscription metadata so the webhook can distinguish the two.
 *
 * Writes nothing to user_subscriptions itself — membership access is
 * only ever granted server-side by the webhook once Stripe confirms the
 * subscription (src/app/api/webhooks/stripe/route.ts), never by reaching
 * a success URL.
 */
export async function startCheckout(formData: FormData): Promise<void> {
  const parsed = checkoutInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("Please complete all required checkout fields.");
  const { planId, salesRep } = parsed.data;
  const membership = parsed.data.membership;
  const interval = membership === KIND_COMMITMENT ? "monthly" : parsed.data.interval;
  if (
    membership === KIND_COMMITMENT &&
    (parsed.data.commitmentAcknowledged !== "yes" ||
      parsed.data.commitmentDisclosureVersion !== COMMITMENT_DISCLOSURE_VERSION)
  ) {
    throw new Error("You must accept the current four-month billing commitment before checkout.");
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
    .select("id, name, stripe_price_id, stripe_annual_price_id, stripe_commitment_price_id, is_active")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw new Error(`Failed to load plan: ${planError.message}`);
  if (!plan || !plan.is_active) throw new Error("That plan is not available.");

  const candidatePriceId = membership === KIND_COMMITMENT
    ? (plan.stripe_commitment_price_id as string | null)
    : (interval === "annual" ? plan.stripe_annual_price_id : plan.stripe_price_id);
  if (!candidatePriceId) {
    if (membership === KIND_COMMITMENT) {
      throw new Error("The 4-Month Commitment isn't configured yet — run the Pricing v2 Stripe sync first.");
    }
    throw new Error(
      interval === "annual"
        ? `${plan.name} has no annual Stripe price configured yet.`
        : `${plan.name} has no Stripe price configured yet — run scripts/stripe-setup-products.js.`
    );
  }
  const priceId: string = candidatePriceId;

  const stripe = getStripe();
  const service = createServiceRoleClient();
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = requestHeaders.get("user-agent") ?? null;

  // Derive tenant identity from the authenticated user. The browser never
  // supplies an organization id.
  const { data: membershipRow, error: membershipError } = await service
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (membershipError || !membershipRow?.organization_id) {
    throw new Error("Your organization membership could not be verified.");
  }
  const organizationId = membershipRow.organization_id as string;

  // Attribution remains in admin-only tables. This call never returns the rep
  // to a member-facing response and does not put a name or email in Stripe.
  const { error: attributionError } = await service.rpc("resolve_attribution_for_signup", {
    p_organization_id: organizationId,
    p_ref: salesRep,
    p_method: "checkout_prompt",
    p_source: "pricing_v2",
    p_invite_rep_user_id: null,
  });
  if (attributionError) throw new Error("Unable to record referral selection.");

  if (membership === KIND_COMMITMENT) {
    const acceptedAt = new Date().toISOString();
    const { error: acknowledgmentError } = await service.from("user_subscriptions").upsert(
      {
        user_id: user.id,
        pricing_version: PRICING_VERSION,
        commitment_ack_text: COMMITMENT_DISCLOSURE,
        commitment_ack_version: COMMITMENT_DISCLOSURE_VERSION,
        commitment_ack_at: acceptedAt,
        commitment_ack_ip: forwardedFor,
        commitment_ack_user_agent: userAgent,
      },
      { onConflict: "user_id" }
    );
    if (acknowledgmentError) throw new Error("Unable to store commitment acknowledgment.");
  }

  // Test-mode checkouts stored TEST-mode customers on users.stripe_customer_id;
  // with the live key those ids no longer resolve and crash checkout. Resolve
  // (create/repair) a customer that is valid under the CURRENTLY configured
  // Stripe key, persisting the new id. (2026-08-17 fix.)
  const stripeCustomerId = await resolveStripeCustomerId(stripe, service, user.id, user.email);

  // Duplicate-subscription guard: a user who already holds a LIVE Stripe
  // subscription (or is mid-period on one) must not be able to check out
  // a second one — double submit, refreshed checkout tab, or a stale
  // pricing page can't create a second subscription this way.
  const { data: existingSub, error: subError } = await service
    .from("user_subscriptions")
    .select("source, stripe_subscription_id, stripe_status, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subError) throw new Error(`Failed to verify membership: ${subError.message}`);
  if (existingSub && existingSub.source === "stripe" && existingSub.stripe_subscription_id) {
    const status = (existingSub.stripe_status as string | null) ?? "";
    const periodStillCurrent = existingSub.current_period_end && new Date(existingSub.current_period_end).getTime() > Date.now();
    if (["active", "trialing", "past_due", "incomplete"].includes(status) || periodStillCurrent) {
      redirect(`/account?membership=active`);
    }
  }

  // Reuse this user's existing Stripe customer if we already created one
  // (e.g. from a prior checkout attempt), otherwise create it now and
  // persist it — service-role write, scoped to exactly this user's own row.
  // (The reusable helper above replaces the old inline block that stored
  // TEST-mode customers; see src/lib/billing/stripeCustomer.ts.)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    // Stripe's newer "Managed Payments" (merchant-of-record) mode is
    // enabled by default on new accounts and requires a product tax_code
    // we haven't set up — this app is not using Stripe as merchant of
    // record, so explicitly opt out rather than configure tax codes.
    managed_payments: { enabled: false },
    success_url: `${appUrl}/account?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
    metadata: {
      supabase_user_id: user.id,
      membership_plan_id: plan.id,
      pricing_version: PRICING_VERSION,
      [MEMBERSHIP_KIND_METADATA_KEY]: membership,
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        membership_plan_id: plan.id,
        pricing_version: PRICING_VERSION,
        [MEMBERSHIP_KIND_METADATA_KEY]: membership,
      },
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  if (membership === KIND_COMMITMENT) {
    const { error: sessionEvidenceError } = await service
      .from("user_subscriptions")
      .update({ commitment_checkout_session_id: session.id })
      .eq("user_id", user.id);
    if (sessionEvidenceError) throw new Error("Unable to finalize commitment evidence.");
  }
  redirect(session.url);
}