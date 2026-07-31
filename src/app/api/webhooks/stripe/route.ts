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

  async function upsertAePlacementFromSubscription(subscription: Stripe.Subscription) {
    const aeProfileId = subscription.metadata?.ae_profile_id;
    if (!aeProfileId) {
      console.error(`AE placement subscription ${subscription.id} has no ae_profile_id metadata — skipping.`);
      return;
    }
    const isActive = subscription.status === "active" || subscription.status === "trialing";
    const isCanceled = subscription.status === "canceled";

    const { error } = await supabase.from("ae_placements").upsert(
      {
        ae_profile_id: aeProfileId,
        status: isCanceled ? "canceled" : isActive ? "active" : "none",
        source: "stripe",
        stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        stripe_subscription_id: subscription.id,
        started_at: isActive ? new Date(subscription.start_date * 1000).toISOString() : undefined,
        canceled_at: isCanceled ? new Date().toISOString() : null,
      },
      { onConflict: "ae_profile_id" }
    );
    if (error) console.error(`Failed to upsert AE placement for profile ${aeProfileId}:`, error.message);
  }

  /**
   * Team subscriptions (org_subscriptions) are distinguished from personal
   * ones by `metadata.team === "true"` + `metadata.organization_id`, set on
   * both the Checkout Session and the subscription itself by
   * src/app/account/team/subscribe/actions.ts's startTeamCheckout(). This
   * webhook remains the single writer of Stripe-sourced org_subscriptions
   * state, same as it is for user_subscriptions — see
   * src/app/account/team/actions.ts's updateSeatCount() for the one other
   * legitimate writer (a direct Stripe API call whose result THIS webhook
   * still confirms into the DB).
   *
   * Bulk Membership (docs/bulk-membership.md) card-billed deals also route
   * here (metadata.team === "true" too — same subscription-based billing),
   * but their Price is created dynamically per deal
   * (src/app/admin/bulk-memberships/actions.ts) rather than living on a
   * plan's stripe_team_price_id column, so the price->plan lookup below
   * falls back to metadata.bulk_plan_id when the price doesn't match any
   * plan's standard team price.
   */
  async function upsertOrgSubscription(subscription: Stripe.Subscription) {
    const organizationId = subscription.metadata?.organization_id;
    if (!organizationId) {
      console.error(`Team Stripe subscription ${subscription.id} has no organization_id metadata — skipping.`);
      return;
    }

    const item = subscription.items.data[0];
    const priceId = item?.price?.id;
    let planId: string | null = null;
    if (priceId) {
      const { data: plan } = await supabase
        .from("membership_plans")
        .select("id")
        .or(`stripe_team_price_id.eq.${priceId},stripe_team_annual_price_id.eq.${priceId}`)
        .maybeSingle();
      planId = (plan?.id as string | undefined) ?? null;
    }
    const isBulk = subscription.metadata?.bulk === "true";
    if (!planId && isBulk && subscription.metadata?.bulk_plan_id) {
      planId = subscription.metadata.bulk_plan_id;
    }
    if (!planId) {
      console.error(`Team Stripe subscription ${subscription.id}: price ${priceId} doesn't match any plan's team price — skipping.`);
      return;
    }

    const seatCount = item?.quantity ?? 1;
    const currentPeriodEndUnix = item?.current_period_end;
    const isCanceled = subscription.status === "canceled";
    const pricePerSeatCentsRaw = subscription.metadata?.price_per_seat_cents;
    const customPricePerSeatCents = isBulk && pricePerSeatCentsRaw ? Number(pricePerSeatCentsRaw) : null;

    const { error } = await supabase.from("org_subscriptions").upsert(
      {
        organization_id: organizationId,
        plan_id: planId,
        seat_count: seatCount,
        status: isCanceled ? "canceled" : "active",
        source: "stripe",
        stripe_subscription_id: subscription.id,
        current_period_end: currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000).toISOString() : null,
        canceled_at: isCanceled ? new Date().toISOString() : null,
        billing_mode: isBulk ? "custom_stripe" : "standard",
        custom_price_per_seat_cents: customPricePerSeatCents,
      },
      { onConflict: "stripe_subscription_id" }
    );
    if (error) {
      console.error(`Failed to upsert org subscription for organization ${organizationId}:`, error.message);
    }
  }

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
          if (subscription.metadata?.kind === "ae_placement") {
            await upsertAePlacementFromSubscription(subscription);
          } else if (subscription.metadata?.team === "true") {
            await upsertOrgSubscription(subscription);
          } else {
            await upsertFromSubscription(subscription);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.metadata?.kind === "ae_placement") {
          await upsertAePlacementFromSubscription(subscription);
        } else if (subscription.metadata?.team === "true") {
          await upsertOrgSubscription(subscription);
        } else {
          await upsertFromSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.metadata?.kind === "ae_placement") {
          const aeProfileId = subscription.metadata?.ae_profile_id;
          if (aeProfileId) {
            const { error } = await supabase
              .from("ae_placements")
              .update({ status: "canceled", canceled_at: new Date().toISOString() })
              .eq("stripe_subscription_id", subscription.id);
            if (error) console.error(`Failed to mark AE placement canceled for profile ${aeProfileId}:`, error.message);
          }
          break;
        }
        if (subscription.metadata?.team === "true") {
          const { error } = await supabase
            .from("org_subscriptions")
            .update({ status: "canceled", canceled_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subscription.id);
          if (error) console.error(`Failed to mark org subscription ${subscription.id} canceled:`, error.message);
          break;
        }
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
          // A team (org_subscriptions) invoice failure isn't tracked with
          // its own past_due status column (out of this spec's schema) —
          // only personal user_subscriptions rows get this update; this is
          // a harmless no-op update for a team subscription id (matches no
          // row there).
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
