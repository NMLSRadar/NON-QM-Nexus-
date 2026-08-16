// Billing & Retention event trail + dunning state writer (2026-08-16,
// docs/billing-runbook.md).
//
// The ONLY module that writes billing_payment_events and the dunning
// columns (decline_count, last_payment_failed_at, next_payment_attempt_at,
// dunning_email_count, last_dunning_email_sent_at, cancel_requested_at) on
// user_subscriptions / org_subscriptions, plus the decline counter via the
// increment_decline_count() SQL function (supabase/billing-dunning-rls.sql).
// Called by the Stripe webhook (src/app/api/webhooks/stripe/route.ts) and
// by the daily billing-dunning cron. Deliberately free of "server-only"
// and Next imports so tests/integration/*.test.ts can load it in a plain
// Node process, same convention as src/lib/billing/commitment.ts.
//
// Never throws for a tracking failure: billing tracking is auxiliary to
// the subscription state writes, and a tracking hiccup must never break a
// checkout or a webhook acknowledgement. Every function returns a boolean
// (true = persisted) and logs errors.
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export type BillingEventType =
  | "payment_failed"
  | "payment_succeeded"
  | "membership_started"
  | "membership_canceled"
  | "cancel_requested"
  | "cancel_revoked";

interface RecordEventInput {
  supabase: SupabaseClient;
  stripeEventId: string;
  eventType: BillingEventType;
  subscriptionId?: string | null;
  customerId?: string | null;
  amountCents?: number | null;
  attemptNumber?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  nextRetryAt?: string | null;
}

async function recordEvent(input: RecordEventInput): Promise<boolean> {
  const { supabase, stripeEventId, eventType, subscriptionId, customerId, amountCents, attemptNumber, failureCode, failureMessage, nextRetryAt } = input;
  if (!stripeEventId) {
    console.error(`billing-events: ${eventType} requires a stripe_event_id.`);
    return false;
  }

  // Resolve which subscription row this event belongs to so the event
  // trail can be joined to a member (user_subscriptions) or a team
  // (org_subscriptions) — one and only one is set.
  let userId: string | null = null;
  let organizationId: string | null = null;
  if (subscriptionId) {
    const { data: personal, error: personalError } = await supabase
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (!personalError && personal) {
      userId = (personal.user_id as string) ?? null;
    } else {
      const { data: org, error: orgError } = await supabase
        .from("org_subscriptions")
        .select("organization_id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (!orgError && org) {
        organizationId = (org.organization_id as string) ?? null;
      }
    }
  }

  const { error } = await supabase.from("billing_payment_events").upsert(
    {
      stripe_event_id: stripeEventId,
      event_type: eventType,
      user_id: userId,
      organization_id: organizationId,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: subscriptionId ?? null,
      amount_cents: amountCents ?? null,
      attempt_number: attemptNumber ?? null,
      failure_code: failureCode ?? null,
      failure_message: failureMessage ?? null,
      next_retry_at: nextRetryAt ?? null,
    },
    { onConflict: "stripe_event_id", ignoreDuplicates: true }
  );
  if (error) {
    console.error(`[billing-events] ${eventType} (${stripeEventId}) insert failed:`, error.message);
    return false;
  }
  return true;
}

function customerIdOf(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
}

/** invoice.payment_failed — record the attempt, escalate the dunning state
 * on the matching subscription row, and bump the decline counter. */
export async function onPaymentFailed(params: {
  supabase: SupabaseClient;
  event: Stripe.Event;
  invoice: Stripe.Invoice;
}): Promise<boolean> {
  const { supabase, event, invoice } = params;
  const subscriptionId = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  const subscriptionIdString = typeof subscriptionId === "string" ? subscriptionId : (subscriptionId?.id ?? null);

  // The failure reason lives on invoice.payment_intent.last_payment_error
  // for card attempts (available without extra API calls on webhook
  // deliveries where the intent was expanded; otherwise null and the
  // attempt number still lands in the trail).
  const paymentIntent = (invoice as unknown as { payment_intent?: { last_payment_error?: { code?: string; message?: string } } | null }).payment_intent;
  const failureCode = paymentIntent?.last_payment_error?.code ?? null;
  const failureMessage = paymentIntent?.last_payment_error?.message ?? null;

  const nowIso = new Date().toISOString();
  const nextRetryIso = invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString() : null;

  const stored = await recordEvent({
    supabase,
    stripeEventId: event.id,
    eventType: "payment_failed",
    subscriptionId: subscriptionIdString,
    customerId: typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null),
    amountCents: invoice.amount_due,
    attemptNumber: invoice.attempt_count,
    failureCode,
    failureMessage,
    nextRetryAt: nextRetryIso,
  });

  if (!subscriptionIdString) return stored;

  // Personal row: escalate status + counters. Team row exists on org_subscriptions.
  const { data: sub } = await supabase.from("user_subscriptions").select("user_id").eq("stripe_subscription_id", subscriptionIdString).maybeSingle();
  if (sub) {
    const { error } = await supabase
      .from("user_subscriptions")
      .update({
        stripe_status: "past_due",
        last_payment_failed_at: nowIso,
        next_payment_attempt_at: nextRetryIso,
      })
      .eq("stripe_subscription_id", subscriptionIdString);
    if (error) {
      console.error(`[billing-events] payment_failed update user_subscriptions ${subscriptionIdString}:`, error.message);
    } else {
      await incrementDeclineCount(supabase, "user_subscriptions", subscriptionIdString);
    }
  } else {
    const { error: orgError } = await supabase
      .from("org_subscriptions")
      .update({
        last_payment_failed_at: nowIso,
        next_payment_attempt_at: nextRetryIso,
      })
      .eq("stripe_subscription_id", subscriptionIdString);
    if (orgError) {
      console.error(`[billing-events] payment_failed update org_subscriptions ${subscriptionIdString}:`, orgError.message);
    } else {
      await incrementDeclineCount(supabase, "org_subscriptions", subscriptionIdString);
    }
  }

  return stored;
}

/** invoice.payment_succeeded — record the recovery and clear the dunning
 * state (decline_count -> 0, next attempt + failure markers -> null). */
export async function onPaymentSucceeded(params: {
  supabase: SupabaseClient;
  event: Stripe.Event;
  invoice: Stripe.Invoice;
}): Promise<boolean> {
  const { supabase, event, invoice } = params;
  const subscriptionId = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  const subscriptionIdString = typeof subscriptionId === "string" ? subscriptionId : (subscriptionId?.id ?? null);

  const stored = await recordEvent({
    supabase,
    stripeEventId: event.id,
    eventType: "payment_succeeded",
    subscriptionId: subscriptionIdString,
    customerId: typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null),
    amountCents: invoice.amount_paid,
  });

  if (!subscriptionIdString) return stored;

  const nowIso = new Date().toISOString();
  const { error: personalError } = await supabase
    .from("user_subscriptions")
    .update({
      stripe_status: "active",
      last_payment_succeeded_at: nowIso,
      last_payment_failed_at: null,
      next_payment_attempt_at: null,
      decline_count: 0,
    })
    .eq("stripe_subscription_id", subscriptionIdString);
  if (personalError) {
    // Not a personal row — try the team table (doesn't change status; the
    // org status column is active/canceled only, so just clear dunning).
    const { error: orgError } = await supabase
      .from("org_subscriptions")
      .update({
        last_payment_succeeded_at: nowIso,
        last_payment_failed_at: null,
        next_payment_attempt_at: null,
        decline_count: 0,
      })
      .eq("stripe_subscription_id", subscriptionIdString);
    if (orgError) {
      // Both updates failed — row may not exist yet (event raced a
      // checkout). Harmless: state converges on the next event.
      console.error(`[billing-events] payment_succeeded update ${subscriptionIdString}:`, orgError.message);
    }
  }

  return stored;
}

/** customer.subscription.created / checkout.session.completed — anchor the
 * membership's start (retention cohort). Deduped by Stripe event id. */
export async function onMembershipStarted(params: {
  supabase: SupabaseClient;
  event: Stripe.Event;
  subscription: Stripe.Subscription;
}): Promise<boolean> {
  return recordEvent({
    supabase: params.supabase,
    stripeEventId: params.event.id,
    eventType: "membership_started",
    subscriptionId: params.subscription.id,
    customerId: customerIdOf(params.subscription),
  });
}

/** customer.subscription.updated with cancel_at_period_end true — record
 * the retainable cancel request (retention: voluntary churn intent) and
 * set cancel_requested_at on the row. Idempotent: only ever sets
 * cancel_requested_at when it's currently null. */
export async function onCancelRequested(params: {
  supabase: SupabaseClient;
  event: Stripe.Event;
  subscription: Stripe.Subscription;
}): Promise<boolean> {
  const { supabase, event, subscription } = params;

  const { data: sub } = await supabase.from("user_subscriptions").select("cancel_requested_at").eq("stripe_subscription_id", subscription.id).maybeSingle();
  if (sub) {
    if ((sub.cancel_requested_at as string | null) == null) {
      const { error } = await supabase
        .from("user_subscriptions")
        .update({ cancel_requested_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subscription.id);
      if (error) {
        console.error(`[billing-events] cancel_requested update ${subscription.id}:`, error.message);
        return false;
      }
    }
    return recordEvent({
      supabase,
      stripeEventId: event.id,
      eventType: "cancel_requested",
      subscriptionId: subscription.id,
      customerId: customerIdOf(subscription),
    });
  }

  // Team subscription variant.
  const { data: org } = await supabase.from("org_subscriptions").select("cancel_requested_at").eq("stripe_subscription_id", subscription.id).maybeSingle();
  if (org) {
    if ((org.cancel_requested_at as string | null) == null) {
      const { error } = await supabase
        .from("org_subscriptions")
        .update({ cancel_requested_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subscription.id);
      if (error) {
        console.error(`[billing-events] cancel_requested (org) update ${subscription.id}:`, error.message);
        return false;
      }
    }
  }
  return recordEvent({
    supabase,
    stripeEventId: event.id,
    eventType: "cancel_requested",
    subscriptionId: subscription.id,
    customerId: customerIdOf(subscription),
  });
}

/** customer.subscription.updated with cancel_at_period_end flipping back
 * to false — the member changed their mind; clear retention intent and
 * record the revocation. */
export async function onCancelRevoked(params: {
  supabase: SupabaseClient;
  event: Stripe.Event;
  subscription: Stripe.Subscription;
}): Promise<boolean> {
  const { supabase, event, subscription } = params;

  await supabase.from("user_subscriptions").update({ cancel_requested_at: null }).eq("stripe_subscription_id", subscription.id);
  await supabase.from("org_subscriptions").update({ cancel_requested_at: null }).eq("stripe_subscription_id", subscription.id);

  return recordEvent({
    supabase,
    stripeEventId: event.id,
    eventType: "cancel_revoked",
    subscriptionId: subscription.id,
    customerId: customerIdOf(subscription),
  });
}

/** customer.subscription.deleted — the actual churn (access is gone, not
 * just requested). */
export async function onMembershipCanceled(params: {
  supabase: SupabaseClient;
  event: Stripe.Event;
  subscription: Stripe.Subscription;
}): Promise<boolean> {
  return recordEvent({
    supabase: params.supabase,
    stripeEventId: params.event.id,
    eventType: "membership_canceled",
    subscriptionId: params.subscription.id,
    customerId: customerIdOf(params.subscription),
  });
}

/** Bumps decline_count atomically via the SQL function (avoids a
 * read-modify-write race when Stripe redelivers an event). */
async function incrementDeclineCount(supabase: SupabaseClient, table: "user_subscriptions" | "org_subscriptions", subscriptionId: string): Promise<void> {
  const { error } = await supabase.rpc("increment_decline_count", { p_table: table, p_subscription_id: subscriptionId });
  if (error) {
    // Function may lag the webhook deploy — the counter is cosmetic;
    // never fail the webhook over it.
    console.error(`[billing-events] increment_decline_count ${table}/${subscriptionId}:`, error.message);
  }
}