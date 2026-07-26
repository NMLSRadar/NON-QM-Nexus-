import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the SINGLE writer of Stripe-sourced user_subscriptions
 * state (see docs/billing.md, FINALIZE.md Phase 7). Nothing else in the app
 * ever sets stripe_status / current_period_end / cancel_at_period_end
 * directly. Uses the service-role client because user_subscriptions writes
 * are platform-admin-only under RLS (supabase/membership-rls.sql) — this
 * webhook is the one legitimate system-level writer, verified by Stripe's
 * signature rather than a user session.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return Response.json({ error: `Signature verification failed: ${err instanceof Error ? err.message : "unknown"}` }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  async function upsertFromSubscription(subscription: Stripe.Subscription) {
    const supabaseUserId = subscription.metadata?.supabase_user_id;
    if (!supabaseUserId) {
      console.error(`Stripe subscription ${subscription.id} has no supabase_user_id metadata — skipping.`);
      return;
    }

    const priceId = subscription.items.data[0]?.price?.id;
    const recurringInterval = subscription.items.data[0]?.price?.recurring?.interval;
    const billingInterval = recurringInterval === "year" ? "annual" : "monthly";
    let planId: string | null = null;
    if (priceId) {
      // A plan's monthly and annual Stripe prices are two different Price
      // ids on the same membership_plans row — match either column so an
      // annual subscriber resolves to their real plan/tier instead of
      // silently landing on plan_id: null (no lender access at all).
      const { data: plan } = await supabase
        .from("membership_plans")
        .select("id")
        .or(`stripe_price_id.eq.${priceId},stripe_annual_price_id.eq.${priceId}`)
        .maybeSingle();
      planId = (plan?.id as string | undefined) ?? null;
    }

    const currentPeriodEndUnix = subscription.items.data[0]?.current_period_end;
    const isCanceled = subscription.status === "canceled";

    const { error } = await supabase.from("user_subscriptions").upsert(
      {
        user_id: supabaseUserId,
        plan_id: planId,
        source: "stripe",
        stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        stripe_subscription_id: subscription.id,
        stripe_status: subscription.status,
        current_period_end: currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: isCanceled ? new Date().toISOString() : null,
        billing_interval: billingInterval,
      },
      { onConflict: "user_id" }
    );
    if (error) {
      console.error(`Failed to upsert subscription for user ${supabaseUserId}:`, error.message);
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertFromSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertFromSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const supabaseUserId = subscription.metadata?.supabase_user_id;
        if (supabaseUserId) {
          const { error } = await supabase
            .from("user_subscriptions")
            .update({ stripe_status: "canceled", canceled_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subscription.id);
          if (error) console.error(`Failed to mark subscription deleted for user ${supabaseUserId}:`, error.message);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof (invoice as { subscription?: string | Stripe.Subscription | null }).subscription === "string"
            ? (invoice as { subscription?: string }).subscription
            : (invoice as { subscription?: Stripe.Subscription | null }).subscription?.id;
        if (subscriptionId) {
          const { error } = await supabase
            .from("user_subscriptions")
            .update({ stripe_status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);
          if (error) console.error(`Failed to mark past_due for subscription ${subscriptionId}:`, error.message);
        }
        break;
      }
      default:
        // Unhandled event types are fine to ignore — we only track what we act on.
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook handler error for event ${event.type}:`, err);
    return Response.json({ error: "Handler error" }, { status: 500 });
  }

  return Response.json({ received: true });
}
