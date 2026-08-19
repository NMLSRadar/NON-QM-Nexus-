import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { createCommitmentScheduleFromSubscription, MEMBERSHIP_KIND_METADATA_KEY } from "@/lib/billing/commitment";
import { LEGACY_PLAN, PRICING_VERSION } from "@/config/pricing";
import {
  onCancelRequested,
  onCancelRevoked,
  onMembershipCanceled,
  onMembershipStarted,
  onPaymentFailed,
  onPaymentSucceeded,
} from "@/lib/billing/billingEvents";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the SINGLE writer of Stripe-sourced user_subscriptions
 * state. Nothing else in the app ever sets stripe_status /
 * current_period_end / cancel_at_period_end directly. Uses the service-role
 * client because user_subscriptions writes are platform-admin-only under
 * RLS (supabase/membership-rls.sql) — this webhook is the one legitimate
 * system-level writer, verified by Stripe's signature rather than a user
 * session.
 *
 * commitment billing (2026-08-15): this webhook is also the single place
 * that hands a fresh commitment Checkout subscription to its Subscription
 * Schedule — the Stripe-native mechanism that bills the configured commitment phase, then the configured monthly phase
 * from cycle 5 (see src/lib/billing/commitment.ts) — and the single place
 * that mirrors schedule state (commitment dates, current price,
 * membership kind) into user_subscriptions. Every write is an idempotent,
 * whole-image sync from the authoritative Stripe object, so webhook
 * retries and out-of-order deliveries converge on the same state.
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
    return Response.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  /** Metadata kinds that mark a subscription as NOT a personal membership. */
  function isNonPersonal(subscription: Stripe.Subscription): boolean {
    return subscription.metadata?.kind === "ae_placement" || subscription.metadata?.team === "true";
  }

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

  interface PlanMeta {
    planId: string | null;
    commitmentPriceId: string | null;
    standardPriceId: string | null;
  }

  /** Resolves the membership plan + its price ids for a personal subscription. */
  async function resolvePlanMeta(subscription: Stripe.Subscription): Promise<PlanMeta> {
    const priceId = subscription.items.data[0]?.price?.id;
    let plan:
      | { id?: string | null; stripe_price_id?: string | null; stripe_annual_price_id?: string | null; stripe_commitment_price_id?: string | null }
      | null = null;
    if (priceId) {
      const { data } = await supabase
        .from("membership_plans")
        .select("id, stripe_price_id, stripe_annual_price_id, stripe_commitment_price_id")
        .or(`stripe_price_id.eq.${priceId},stripe_annual_price_id.eq.${priceId},stripe_commitment_price_id.eq.${priceId}`)
        .maybeSingle();
      plan = data ?? null;
    }
    return {
      planId: (plan?.id as string | undefined) ?? null,
      commitmentPriceId: (plan?.stripe_commitment_price_id as string | null | undefined) ?? null,
      standardPriceId: (plan?.stripe_price_id as string | null | undefined) ?? null,
    };
  }

  async function resolvePlanMetaForSchedule(schedule: Stripe.SubscriptionSchedule): Promise<PlanMeta> {
    const subscriptionId = typeof schedule.subscription === "string" ? schedule.subscription : schedule.subscription?.id ?? null;
    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        return await resolvePlanMeta(sub);
      } catch {
        // fall through to the empty meta — schedule sync is best-effort.
      }
    }
    return { planId: null, commitmentPriceId: null, standardPriceId: null };
  }

  /**
   * Whole-image mirror of a schedule + its subscription into
   * user_subscriptions: commitment dates, current price, kind, status.
   * Finds the user by Stripe customer id (schedule.customer), so it works
   * for every schedule event without trusting metadata.
   */
  async function syncScheduleFromDb(
    schedule: Stripe.SubscriptionSchedule,
    planMeta: PlanMeta,
    subscriptionOverride: Stripe.Subscription | null = null
  ) {
    const customerId = typeof schedule.customer === "string" ? schedule.customer : schedule.customer.id;
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (userError) {
      console.error(`Schedule ${schedule.id}: user lookup failed: ${userError.message}`);
      return;
    }
    const supabaseUserId = (userRow?.id as string | null) ?? null;
    if (!supabaseUserId) {
      console.error(`Schedule ${schedule.id}: no NON-QM Nexus user for customer ${customerId} — cannot sync.`);
      return;
    }

    // Phases are trimmed as they pass; the first present phase is the
    // current (or next) one. Phase 1 end == phase 2 start == the date the
    // the monthly rate begins.
    const phase1 = schedule.phases[0];
    const phase2 = schedule.phases[1];
    const commitmentStart = phase1?.start_date ? new Date(phase1.start_date * 1000).toISOString() : null;
    const commitmentEnd = phase1?.end_date ? new Date(phase1.end_date * 1000).toISOString() : null;
    const standardRateStart = phase2?.start_date ? new Date(phase2.start_date * 1000).toISOString() : commitmentEnd;
    const billingPriceId =
      phase1?.items[0]?.price ?? (typeof phase1?.items[0]?.plan === "string" ? phase1.items[0].plan : null);

    let subscriptionId: string | null = typeof schedule.subscription === "string" ? schedule.subscription : schedule.subscription?.id ?? null;
    let status: Stripe.Subscription.Status | null = subscriptionOverride?.status ?? null;
    let currentPeriodEnd: string | null = null;
    let resolvedSubscription: Stripe.Subscription | null = subscriptionOverride ?? null;

    if (subscriptionOverride) {
      subscriptionId = subscriptionOverride.id;
      status = subscriptionOverride.status;
      currentPeriodEnd = subscriptionOverride.items.data[0]?.current_period_end
        ? new Date(subscriptionOverride.items.data[0].current_period_end * 1000).toISOString()
        : null;
    } else if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        resolvedSubscription = sub;
        status = sub.status;
        currentPeriodEnd = sub.items.data[0]?.current_period_end
          ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
          : null;
      } catch {
        // subscription is gone (e.g. hard-canceled) — the schedule event
        // still carried the id for the row update.
      }
    }

    // Kind: commitment while the the commitment price bills; commitment_completed
    // once the the monthly phase is current. Standard memberships never get
    // schedules, so any schedule here belongs to a commitment member.
    const resolvedUnitAmount = resolvedSubscription?.items.data[0]?.price?.unit_amount ?? null;
    const legacySchedule =
      resolvedSubscription?.metadata?.[MEMBERSHIP_KIND_METADATA_KEY] === "commitment" &&
      resolvedSubscription.metadata?.pricing_version !== PRICING_VERSION;
    const kind = legacySchedule
      ? resolvedUnitAmount === LEGACY_PLAN.amountCents ? "commitment" : "commitment_completed"
      : planMeta.commitmentPriceId != null && billingPriceId === planMeta.commitmentPriceId
        ? "commitment"
        : billingPriceId === planMeta.standardPriceId
          ? "commitment_completed"
          : "standard";

    const { error } = await supabase
      .from("user_subscriptions")
      .update({
        membership_kind: kind,
        stripe_subscription_schedule_id: schedule.id,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        commitment_start_date: commitmentStart,
        commitment_end_date: commitmentEnd,
        standard_rate_start_date: standardRateStart,
        pricing_version: legacySchedule ? null : resolvedSubscription?.metadata?.pricing_version ?? null,
        legacy_plan_key: legacySchedule ? LEGACY_PLAN.key : null,
        current_monthly_price_cents: resolvedUnitAmount,
        stripe_status: status,
        current_period_end: currentPeriodEnd,
      })
      .eq("user_id", supabaseUserId);
    if (error) {
      console.error(`Failed to sync commitment schedule ${schedule.id}:`, error.message);
    }
  }

  /**
   * Creates the Subscription Schedule for a fresh commitment Checkout —
   * exactly once. Idempotent: skips when the subscription already has a
   * schedule (Stripe) or the DB row already stores one (us). Also called
   * from customer.subscription.updated as a self-heal when a
   * checkout.session.completed delivery was retried/lost, so a commitment
   * can never silently stay on the commitment price without transitioning.
   */
  async function ensureCommitmentSchedule(subscription: Stripe.Subscription, planMeta: PlanMeta) {
    if (subscription.metadata?.[MEMBERSHIP_KIND_METADATA_KEY] !== "commitment") return;
    // Legacy commitment subscriptions have no pricing_version marker. Never
    // rebuild them using the v2 catalog if their old schedule is absent.
    if (subscription.metadata?.pricing_version !== PRICING_VERSION) return;
    const attached = typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id ?? null;
    if (attached) {
      // Subscription already on a schedule — make sure we mirror it.
      try {
        const schedule = await stripe.subscriptionSchedules.retrieve(attached);
        await syncScheduleFromDb(schedule, planMeta, subscription);
      } catch (err) {
        console.error(`Failed to refresh schedule ${attached}:`, err);
      }
      return;
    }

    const { data: row } = await supabase
      .from("user_subscriptions")
      .select("stripe_subscription_schedule_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    if (row?.stripe_subscription_schedule_id) return; // already created by us

    if (!planMeta.commitmentPriceId || !planMeta.standardPriceId) {
      console.error(
        `Commitment subscription ${subscription.id}: plan has no commitment/standard price configured (commitment=${planMeta.commitmentPriceId}, standard=${planMeta.standardPriceId}) — cannot build schedule.`
      );
      return;
    }

    try {
      const schedule = await createCommitmentScheduleFromSubscription(
        stripe,
        subscription.id,
        planMeta.commitmentPriceId,
        planMeta.standardPriceId
      );
      await syncScheduleFromDb(schedule, planMeta, subscription);
      console.log(`[Commitment] Subscription ${subscription.id} handed to schedule ${schedule.id} (${schedule.phases.length} phases).`);
    } catch (err) {
      // Stripe contention/API error — the commitment self-heals on the next
      // customer.subscription.updated event, or via
      // scripts/stripe-reconcile-commitments.js. Log loudly, never block the
      // checkout success experience (the user already has active access).
      console.error(`Failed to create commitment schedule for ${subscription.id}:`, err);
    }
  }

  async function upsertPersonalSubscription(subscription: Stripe.Subscription) {
    const supabaseUserId = subscription.metadata?.supabase_user_id;
    if (!supabaseUserId) {
      console.error(`Stripe subscription ${subscription.id} has no supabase_user_id metadata — skipping.`);
      return;
    }

    const planMeta = await resolvePlanMeta(subscription);
    const priceId = subscription.items.data[0]?.price?.id;
    const recurringInterval = subscription.items.data[0]?.price?.recurring?.interval;
    const billingInterval = recurringInterval === "year" ? "annual" : "monthly";
    const currentPeriodEndUnix = subscription.items.data[0]?.current_period_end;
    const isCanceled = subscription.status === "canceled";

    const unitAmount = subscription.items.data[0]?.price?.unit_amount ?? null;
    const isLegacyCommitment =
      subscription.metadata?.[MEMBERSHIP_KIND_METADATA_KEY] === "commitment" &&
      subscription.metadata?.pricing_version !== PRICING_VERSION;
    const membershipKind =
      subscription.metadata?.[MEMBERSHIP_KIND_METADATA_KEY] === "commitment"
        ? isLegacyCommitment
          ? unitAmount === LEGACY_PLAN.amountCents ? "commitment" : "commitment_completed"
          : planMeta.commitmentPriceId != null && priceId === planMeta.commitmentPriceId
            ? "commitment"
            : "commitment_completed"
        : "standard";

    const { error } = await supabase.from("user_subscriptions").upsert(
      {
        user_id: supabaseUserId,
        plan_id: planMeta.planId,
        source: "stripe",
        stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        stripe_subscription_id: subscription.id,
        stripe_subscription_schedule_id:
          typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id ?? null,
        stripe_status: subscription.status,
        current_period_end: currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
        canceled_at: isCanceled ? new Date().toISOString() : null,
        billing_interval: billingInterval,
        membership_kind: membershipKind,
        pricing_version: isLegacyCommitment ? null : subscription.metadata?.pricing_version ?? null,
        legacy_plan_key: isLegacyCommitment ? LEGACY_PLAN.key : null,
        current_monthly_price_cents: unitAmount,
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
            await upsertPersonalSubscription(subscription);
            await ensureCommitmentSchedule(subscription, await resolvePlanMeta(subscription));
          }
          await onMembershipStarted({ supabase, event, subscription });
        }
        break;
      }
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.metadata?.kind === "ae_placement") {
          await upsertAePlacementFromSubscription(subscription);
        } else if (subscription.metadata?.team === "true") {
          await upsertOrgSubscription(subscription);
        } else {
          await upsertPersonalSubscription(subscription);
          const planMeta = await resolvePlanMeta(subscription);
          if (subscription.metadata?.[MEMBERSHIP_KIND_METADATA_KEY] === "commitment") {
            await ensureCommitmentSchedule(subscription, planMeta);
          }
        }
        await onMembershipStarted({ supabase, event, subscription });
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.metadata?.kind === "ae_placement") {
          await upsertAePlacementFromSubscription(subscription);
        } else if (subscription.metadata?.team === "true") {
          await upsertOrgSubscription(subscription);
        } else {
          await upsertPersonalSubscription(subscription);
          const planMeta = await resolvePlanMeta(subscription);
          if (subscription.metadata?.[MEMBERSHIP_KIND_METADATA_KEY] === "commitment") {
            // Self-heal (see ensureCommitmentSchedule docstring).
            await ensureCommitmentSchedule(subscription, planMeta);
          }
        }
        // Retention: a cancel-at-period-end request is the voluntary-churn
        // signal (distinct from the actual cancel in subscription.deleted).
        // Idempotent via cancel_requested_at on the row: once recorded for
        // a subscription it isn't re-stamped, and a flip back to false
        // clears it + logs the revocation.
        if (subscription.cancel_at_period_end) {
          await onCancelRequested({ supabase, event, subscription });
        } else {
          const { data: existing } = await supabase
            .from("user_subscriptions")
            .select("cancel_requested_at")
            .eq("stripe_subscription_id", subscription.id)
            .maybeSingle();
          if (existing && (existing.cancel_requested_at as string | null) != null) {
            await onCancelRevoked({ supabase, event, subscription });
          }
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
          await onMembershipCanceled({ supabase, event, subscription });
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
        await onMembershipCanceled({ supabase, event, subscription });
        break;
      }
      case "subscription_schedule.created":
      case "subscription_schedule.updated":
      case "subscription_schedule.canceled":
      case "subscription_schedule.aborted":
      case "subscription_schedule.released": {
        const schedule = event.data.object as Stripe.SubscriptionSchedule;
        await syncScheduleFromDb(schedule, await resolvePlanMetaForSchedule(schedule));
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await onPaymentFailed({ supabase, event, invoice });
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await onPaymentSucceeded({ supabase, event, invoice });
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