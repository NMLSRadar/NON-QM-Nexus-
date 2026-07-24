// Integration tests for the Stripe webhook handler against the REAL
// Supabase project — same skip-without-credentials convention as the other
// tests/integration/*.test.ts files. Constructs real Stripe event payloads,
// signs them with the actual configured webhook secret (so signature
// verification is genuinely exercised, not mocked), and posts them straight
// into the route handler's POST function.
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

function fakeSubscriptionEvent(type: string, subscriptionOverrides: Record<string, unknown>) {
  return {
    id: `evt_test_${Date.now()}`,
    object: "event",
    type,
    data: {
      object: {
        object: "subscription",
        id: `sub_test_${Date.now()}`,
        status: "active",
        customer: "cus_test_fake",
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ price: { id: "price_test_fake" }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
        ...subscriptionOverrides,
      },
    },
  };
}

describe.skipIf(!hasCredentials)("Stripe webhook (live database + real signature verification)", () => {
  let admin: SupabaseClient;
  let userId: string;
  let essentialPlanId: string;
  let essentialPriceId: string;
  const testEmail = `nqn-stripe-webhook-${Date.now()}@gmail.com`;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: essential } = await admin
      .from("membership_plans")
      .select("id, stripe_price_id")
      .eq("key", "essential")
      .single();
    essentialPlanId = essential!.id;
    essentialPriceId = essential!.stripe_price_id as string;
    expect(essentialPriceId, "Essential plan must have a stripe_price_id — run scripts/stripe-setup-products.js").toBeTruthy();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: testEmail,
      password: "Stripe-Webhook-Integration-Pw-123",
      email_confirm: true,
    });
    if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
    userId = created.user.id;
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("rejects a request with an invalid signature", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const event = fakeSubscriptionEvent("customer.subscription.updated", { metadata: { supabase_user_id: userId } });
    const request = signedRequest(event, "whsec_totally_wrong_secret");
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("creates a stripe-sourced subscription on customer.subscription.updated", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const subscriptionId = `sub_test_${Date.now()}`;
    const event = fakeSubscriptionEvent("customer.subscription.updated", {
      id: subscriptionId,
      status: "active",
      metadata: { supabase_user_id: userId },
      items: { data: [{ price: { id: essentialPriceId }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
    });
    const request = signedRequest(event, STRIPE_WEBHOOK_SECRET!);
    const response = await POST(request);
    expect(response.status).toBe(200);

    const { data: row } = await admin.from("user_subscriptions").select("*").eq("user_id", userId).single();
    expect(row!.source).toBe("stripe");
    expect(row!.plan_id).toBe(essentialPlanId);
    expect(row!.stripe_subscription_id).toBe(subscriptionId);
    expect(row!.stripe_status).toBe("active");
    expect(row!.canceled_at).toBeNull();
  });

  it("marks the subscription canceled on customer.subscription.deleted", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const { data: existing } = await admin.from("user_subscriptions").select("stripe_subscription_id").eq("user_id", userId).single();
    const subscriptionId = existing!.stripe_subscription_id as string;

    const event = fakeSubscriptionEvent("customer.subscription.deleted", {
      id: subscriptionId,
      status: "canceled",
      metadata: { supabase_user_id: userId },
    });
    const request = signedRequest(event, STRIPE_WEBHOOK_SECRET!);
    const response = await POST(request);
    expect(response.status).toBe(200);

    const { data: row } = await admin.from("user_subscriptions").select("stripe_status, canceled_at").eq("user_id", userId).single();
    expect(row!.stripe_status).toBe("canceled");
    expect(row!.canceled_at).not.toBeNull();
  });
});
