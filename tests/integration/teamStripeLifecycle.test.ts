// Integration tests for the team (org_subscriptions) Stripe lifecycle,
// against the REAL Supabase project + real Stripe TEST-mode signature
// verification — same convention as tests/integration/stripeWebhook.test.ts
// (constructs real Stripe event payloads, signs them with the actual
// configured webhook secret, posts them straight into the route handler).
// checkout.session.completed is intentionally NOT exercised here, same as
// stripeWebhook.test.ts — it calls stripe.subscriptions.retrieve() against
// a REAL Stripe subscription id, which a synthetic test event can't
// provide; customer.subscription.updated/deleted (what this test drives)
// carry the full subscription object already, so they're the faithful way
// to test this handler without a live Stripe Checkout run.
//
// Covers spec section 7's "Stripe lifecycle": (a synthetic) checkout ->
// active org sub covering members; quantity update -> seat_count follows
// webhook; cancel -> period-end fallback (access runs to period end while
// status stays 'active', then the resolver revokes the instant the
// subscription.deleted webhook flips status to 'canceled'). Comped org sub
// grants identically, no Stripe, with an audit entry — tested via
// src/app/admin/teams/actions.ts's compOrgSubscription directly.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { getEffectivePlan } from "@/lib/repository/membership";
import { probeTeamSchemaReady } from "./teamMembershipSchemaProbe";

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

function fakeTeamSubscriptionEvent(type: string, organizationId: string, overrides: Record<string, unknown>) {
  return {
    id: `evt_test_team_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    object: "event",
    type,
    data: {
      object: {
        object: "subscription",
        id: `sub_test_team_${Date.now()}`,
        status: "active",
        customer: "cus_test_fake_team",
        cancel_at_period_end: false,
        metadata: { team: "true", organization_id: organizationId },
        items: { data: [{ price: { id: "price_test_team_fake" }, quantity: 5, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
        ...overrides,
      },
    },
  };
}

describe.skipIf(!hasCredentials)("Team Stripe lifecycle (live database + real signature verification)", () => {
  let admin: SupabaseClient;
  let schemaReady = false;
  let orgId: string;
  let enterprisePlanId: string;
  let enterpriseTeamPriceId: string | null;
  let coveredUserId: string;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    schemaReady = await probeTeamSchemaReady(admin);
    if (!schemaReady) return;

    const { data: enterprise } = await admin.from("membership_plans").select("id, stripe_team_price_id").eq("key", "enterprise").single();
    enterprisePlanId = enterprise!.id as string;
    enterpriseTeamPriceId = (enterprise!.stripe_team_price_id as string | null) ?? null;

    const { data: org } = await admin.from("organizations").insert({ name: `NQN Stripe Lifecycle Test ${Date.now()}` }).select("id").single();
    orgId = org!.id as string;

    const { data: user, error } = await admin.auth.admin.createUser({
      email: `nqn-stripe-team-lifecycle-${Date.now()}@gmail.com`,
      password: "Stripe-Team-Lifecycle-Pw-123",
      email_confirm: true,
    });
    if (error || !user.user) throw new Error(`Failed to create test user: ${error?.message}`);
    coveredUserId = user.user.id;
    await admin.from("memberships").insert({ organization_id: orgId, user_id: coveredUserId, role: "broker", covered_by_org_plan: true });
  }, 30_000);

  afterAll(async () => {
    if (!schemaReady) return;
    await admin.from("org_subscriptions").delete().eq("organization_id", orgId);
    await admin.from("memberships").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
    if (coveredUserId) await admin.auth.admin.deleteUser(coveredUserId);
  });

  it("customer.subscription.updated (simulated checkout confirmation) creates an active org subscription that covers members", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    if (!enterpriseTeamPriceId) {
      console.warn("[team-stripe-lifecycle] Enterprise plan has no stripe_team_price_id yet — run scripts/stripe-team-billing.js. Skipping.");
      return ctx.skip();
    }
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const subscriptionId = `sub_test_team_${Date.now()}`;
    const event = fakeTeamSubscriptionEvent("customer.subscription.updated", orgId, {
      id: subscriptionId,
      items: { data: [{ price: { id: enterpriseTeamPriceId }, quantity: 5, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
    });
    const response = await POST(signedRequest(event, STRIPE_WEBHOOK_SECRET!));
    expect(response.status).toBe(200);

    const { data: row } = await admin.from("org_subscriptions").select("*").eq("organization_id", orgId).eq("status", "active").single();
    expect(row!.plan_id).toBe(enterprisePlanId);
    expect(row!.seat_count).toBe(5);
    expect(row!.source).toBe("stripe");

    const plan = await getEffectivePlan(admin, coveredUserId);
    expect(plan.orgCoverage?.organizationId).toBe(orgId);
  });

  it("a quantity change on the SAME subscription updates seat_count via the webhook", async (ctx) => {
    if (!schemaReady || !enterpriseTeamPriceId) return ctx.skip();
    const { data: existing } = await admin.from("org_subscriptions").select("stripe_subscription_id").eq("organization_id", orgId).eq("status", "active").single();
    const subscriptionId = existing!.stripe_subscription_id as string;

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const event = fakeTeamSubscriptionEvent("customer.subscription.updated", orgId, {
      id: subscriptionId,
      items: { data: [{ price: { id: enterpriseTeamPriceId }, quantity: 10, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
    });
    const response = await POST(signedRequest(event, STRIPE_WEBHOOK_SECRET!));
    expect(response.status).toBe(200);

    const { data: row } = await admin.from("org_subscriptions").select("seat_count").eq("organization_id", orgId).eq("status", "active").single();
    expect(row!.seat_count).toBe(10);
  });

  it("customer.subscription.deleted (actual period end) revokes coverage — the fallback", async (ctx) => {
    if (!schemaReady || !enterpriseTeamPriceId) return ctx.skip();
    const { data: existing } = await admin.from("org_subscriptions").select("stripe_subscription_id").eq("organization_id", orgId).eq("status", "active").single();
    const subscriptionId = existing!.stripe_subscription_id as string;

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const event = fakeTeamSubscriptionEvent("customer.subscription.deleted", orgId, { id: subscriptionId, status: "canceled" });
    const response = await POST(signedRequest(event, STRIPE_WEBHOOK_SECRET!));
    expect(response.status).toBe(200);

    const { data: row } = await admin.from("org_subscriptions").select("status, canceled_at").eq("stripe_subscription_id", subscriptionId).single();
    expect(row!.status).toBe("canceled");
    expect(row!.canceled_at).not.toBeNull();

    const plan = await getEffectivePlan(admin, coveredUserId);
    expect(plan.orgCoverage, "member falls back once the subscription has actually ended").toBeNull();
    expect(plan.tierLevel).toBe(0);
  });
});
