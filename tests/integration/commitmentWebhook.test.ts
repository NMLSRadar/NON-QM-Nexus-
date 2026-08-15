// Integration test for the 3-Month Commitment webhook path against the
// REAL Supabase project and REAL test-mode Stripe — same convention as
// stripeWebhook.test.ts: construct real event payloads, sign them with the
// configured webhook secret, and post them straight into the route
// handler's POST function.
//
// Covers the production-critical flow end-to-end:
//   1. customer.subscription.created  → user_subscriptions row is created
//      with membership_kind=commitment at $120 (same upsert as Checkout).
//   2. customer.subscription.updated  (commitment, schedule-less) →
//      handler SELF-HEALS by creating the real Subscription Schedule via
//      createCommitmentScheduleFromSubscription (from_subscription).
//   3. subscription_schedule.created  → commitment dates mirror into the
//      DB (start/end/standard rate dates, schedule id, price cache).
//
// Cleanup removes the Stripe customer, subscription/schedule and the
// Supabase test user afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET);

function signedRequest(payload: unknown, secret: string): Request {
  const stripe = new Stripe(STRIPE_SECRET_KEY!);
  const body = JSON.stringify(payload);
  const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("https://nonqmnexus.com/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body,
  });
}

/** Wraps a real Stripe object (e.g. a retrieved subscription) into an event. */
function eventEnvelope(type: string, object: Record<string, unknown>): Record<string, unknown> {
  return { id: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, object: "event", type, data: { object } };
}

describe.skipIf(!hasCredentials)("Commitment webhook (live database + real test-mode Stripe)", () => {
  let admin: SupabaseClient;
  let stripe: Stripe;
  let userId: string;
  let stripeCustomerId: string;
  let subscriptionId: string;
  let scheduleId: string | null = null;
  let planRowId: string | null = null;
  const testEmail = `nqn-commitment-webhook-${Date.now()}@gmail.com`;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    stripe = new Stripe(STRIPE_SECRET_KEY!);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: testEmail,
      password: "Commitment-Webhook-Integration-Pw-123",
      email_confirm: true,
    });
    if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
    userId = created.user.id;

    // Real test-mode Stripe objects: a $120 subscription exactly like a
    // commitment Checkout would create (same metadata the checkout sets).
    const prices = await stripe.prices.list({ limit: 100, active: true });
    const p120 = prices.data.find((p) => p.unit_amount === 12000 && p.recurring?.interval === "month");
    expect(p120, "Run scripts/stripe-commitment-setup.js first (creates the $120 price)").toBeTruthy();

    // Production state while the commitment is configured: the active plan
    // points at the $120 price (set by the setup script). Save the plan
    // row id so we can restore it afterwards.
    const { data: planRow } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
    planRowId = planRow!.id as string;
    const { error: priceLinkError } = await admin
      .from("membership_plans")
      .update({ stripe_commitment_price_id: p120!.id })
      .eq("id", planRowId);
    if (priceLinkError) throw new Error(`Failed to link commitment price: ${priceLinkError.message}`);

    const customer = await stripe.customers.create({ email: testEmail, metadata: { supabase_user_id: userId } });
    stripeCustomerId = customer.id;
    const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: p120!.id, quantity: 1 }],
      metadata: { supabase_user_id: userId, membership_kind: "commitment" },
    });
    subscriptionId = sub.id;

    // Link the Stripe customer to the user row (checkout does this via
    // users.stripe_customer_id) so schedule-sync can resolve the user.
    const { error: linkError } = await admin.from("users").update({ stripe_customer_id: customer.id }).eq("id", userId);
    if (linkError) throw new Error(`Failed to link test customer: ${linkError.message}`);
  }, 60_000);

  afterAll(async () => {
    try {
      if (scheduleId) {
        await stripe.subscriptionSchedules.cancel(scheduleId).catch(() => {});
      }
      if (subscriptionId) {
        await stripe.subscriptions.cancel(subscriptionId).catch(() => {});
      }
      if (stripeCustomerId) {
        await stripe.customers.del(stripeCustomerId).catch(() => {});
      }
    } catch {
      // best effort
    }
    if (planRowId) {
      await admin.from("membership_plans").update({ stripe_commitment_price_id: null }).eq("id", planRowId);
    }
    if (userId) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("creates the commitment row on customer.subscription.created", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const event = eventEnvelope("customer.subscription.created", sub as unknown as Record<string, unknown>);
    const response = await POST(signedRequest(event, STRIPE_WEBHOOK_SECRET!));
    expect(response.status).toBe(200);

    const { data: row } = await admin.from("user_subscriptions").select("*").eq("user_id", userId).single();
    expect(row!.source).toBe("stripe");
    expect(row!.stripe_subscription_id).toBe(subscriptionId);
    expect(row!.membership_kind).toBe("commitment");
    expect(row!.current_monthly_price_cents).toBe(12000);
  }, 60_000);

  it("self-heals by creating the Subscription Schedule on subscription.updated (no schedule yet)", async () => {
    // A subscription event carrying a real schedule field would bypass the
    // healer; we simulate the pre-schedule state (webhook retries / lost
    // checkout.session.completed) by posting the event as Stripe delivers
    // it in that window.
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const raw = sub as unknown as Record<string, unknown>;
    delete raw.schedule; // pretend the schedule isn't attached yet
    const response = await POST(signedRequest(eventEnvelope("customer.subscription.updated", raw), STRIPE_WEBHOOK_SECRET!));
    expect(response.status).toBe(200);

    const refreshed = await stripe.subscriptions.retrieve(subscriptionId);
    scheduleId = typeof refreshed.schedule === "string" ? refreshed.schedule : refreshed.schedule?.id ?? null;
    expect(scheduleId, "webhook must have attached a real schedule to the subscription").toBeTruthy();

    const { data: row } = await admin.from("user_subscriptions").select("stripe_subscription_schedule_id").eq("user_id", userId).single();
    expect(row!.stripe_subscription_schedule_id).toBe(scheduleId);
  }, 60_000);

  it("mirrors commitment dates from subscription_schedule.created", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId!);
    const response = await POST(
      signedRequest(eventEnvelope("subscription_schedule.created", schedule as unknown as Record<string, unknown>), STRIPE_WEBHOOK_SECRET!)
    );
    expect(response.status).toBe(200);

    const phase1 = schedule.phases[0];
    const phase2 = schedule.phases[1];
    const { data: row } = await admin.from("user_subscriptions").select("*").eq("user_id", userId).single();
    // epoch-compare — the DB columns are timestamp-without-tz; ISO strings
    // round-trip through Postgres with formatting differences.
    expect(Math.floor(new Date(row!.commitment_start_date as string).getTime() / 1000)).toBe(phase1.start_date);
    expect(Math.floor(new Date(row!.commitment_end_date as string).getTime() / 1000)).toBe(phase1.end_date!);
    expect(Math.floor(new Date(row!.standard_rate_start_date as string).getTime() / 1000)).toBe(phase2.start_date!);
    expect(row!.membership_kind).toBe("commitment");
  }, 60_000);
});