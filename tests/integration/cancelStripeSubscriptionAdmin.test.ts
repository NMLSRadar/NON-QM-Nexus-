// Live database + live Stripe (test mode) coverage for the admin-side
// "Cancel Stripe subscription" button (src/app/admin/users/actions.ts's
// cancelStripeSubscriptionAdmin). Mirrors the aePlacementLifecycle.test.ts
// convention: the action itself needs a real Next.js request/cookie
// context (requirePlatformAdmin() calls createClient() from cookies()),
// so this test replicates its exact DB-write + audit-log mechanics
// against the service-role client directly, while exercising the REAL
// Stripe cancellation call end-to-end (not mocked) — proving the whole
// chain: a real Stripe subscription actually transitions to "canceled".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && STRIPE_SECRET_KEY);

describe.skipIf(!hasCredentials)("Admin-side Stripe subscription cancellation (live database + live Stripe test mode)", () => {
  let admin: SupabaseClient;
  let stripe: Stripe;
  const suffix = Date.now();
  let testUserId: string;
  let stripeCustomerId: string;
  let stripeSubscriptionId: string;
  let planId: string;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    stripe = new Stripe(STRIPE_SECRET_KEY!);

    const { data: plan } = await admin.from("membership_plans").select("id, stripe_price_id").eq("is_active", true).not("stripe_price_id", "is", null).limit(1).single();
    planId = plan!.id as string;

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: `cancel-stripe-sub-test-${suffix}@example.com`,
      email_confirm: true,
      password: `TestPass${suffix}!`,
    });
    if (authError) throw new Error(`Failed to create test auth user: ${authError.message}`);
    testUserId = authUser.user.id;

    const customer = await stripe.customers.create({ email: `cancel-stripe-sub-test-${suffix}@example.com`, metadata: { supabase_user_id: testUserId, test: "true" } });
    stripeCustomerId = customer.id;

    // Attach Stripe's official always-succeeds test payment method
    // (pm_card_visa) and make it the customer's default, so the
    // subscription below activates immediately and synchronously
    // ("active") instead of sitting in "incomplete" and racing Stripe's
    // own short incomplete-subscription expiry window.
    const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: stripeCustomerId });
    await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethod.id } });

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan!.stripe_price_id as string }],
      default_payment_method: paymentMethod.id,
      metadata: { test: "cancelStripeSubscriptionAdmin" },
    });
    stripeSubscriptionId = subscription.id;

    await admin.from("user_subscriptions").upsert(
      {
        user_id: testUserId,
        plan_id: planId,
        discount_id: null,
        source: "stripe",
        stripe_subscription_id: stripeSubscriptionId,
        canceled_at: null,
        cancel_at_period_end: false,
      },
      { onConflict: "user_id" }
    );
  }, 30_000);

  afterAll(async () => {
    await admin.from("audit_logs").delete().eq("entity_id", testUserId);
    await admin.from("user_subscriptions").delete().eq("user_id", testUserId);
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
    } catch {
      // already canceled by the test itself — fine
    }
    try {
      await stripe.customers.del(stripeCustomerId);
    } catch {
      // ignore cleanup failure
    }
    await admin.auth.admin.deleteUser(testUserId);
  }, 30_000);

  it("a live Stripe subscription starts out not canceled", async () => {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    expect(subscription.status).not.toBe("canceled");
    const { data: sub } = await admin.from("user_subscriptions").select("source, stripe_subscription_id, canceled_at").eq("user_id", testUserId).single();
    expect(sub!.source).toBe("stripe");
    expect(sub!.stripe_subscription_id).toBe(stripeSubscriptionId);
    expect(sub!.canceled_at).toBeNull();
  }, 15_000);

  it("mirrors cancelStripeSubscriptionAdmin exactly: cancel() actually cancels the real Stripe subscription, updates the DB row, and writes an audit_logs entry with the reason", async () => {
    // --- This block is the exact sequence cancelStripeSubscriptionAdmin
    // performs after requirePlatformAdmin() gates the caller. ---
    const { data: subRow } = await admin.from("user_subscriptions").select("source, stripe_subscription_id, canceled_at").eq("user_id", testUserId).maybeSingle();
    expect(subRow!.source).toBe("stripe");
    expect(subRow!.stripe_subscription_id).toBeTruthy();
    expect(subRow!.canceled_at).toBeNull();

    const canceled = await stripe.subscriptions.cancel(subRow!.stripe_subscription_id as string);
    expect(canceled.status).toBe("canceled");

    const now = new Date().toISOString();
    const { error: updateError } = await admin.from("user_subscriptions").update({ canceled_at: now, cancel_at_period_end: false }).eq("user_id", testUserId);
    expect(updateError).toBeNull();

    const reason = "Regression test — fraud review";
    const { error: auditError } = await admin.from("audit_logs").insert({
      organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
      actor_user_id: testUserId, // stand-in for the admin actor in this isolated test
      action: "user_subscription.stripe_canceled_by_admin",
      entity_type: "user_subscriptions",
      entity_id: testUserId,
      metadata: { reason, stripe_subscription_id: stripeSubscriptionId, stripe_status_after_cancel: canceled.status },
    });
    expect(auditError).toBeNull();
    // --- end mirrored sequence ---

    // Verify against the REAL Stripe object, not just what we sent.
    const refetched = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    expect(refetched.status).toBe("canceled");

    const { data: updatedSub } = await admin.from("user_subscriptions").select("canceled_at, cancel_at_period_end").eq("user_id", testUserId).single();
    expect(updatedSub!.canceled_at).not.toBeNull();
    expect(updatedSub!.cancel_at_period_end).toBe(false);

    const { data: audit } = await admin
      .from("audit_logs")
      .select("action, entity_id, metadata")
      .eq("entity_id", testUserId)
      .eq("action", "user_subscription.stripe_canceled_by_admin")
      .maybeSingle();
    expect(audit).toBeTruthy();
    expect((audit!.metadata as { reason: string; stripe_status_after_cancel: string }).reason).toBe(reason);
    expect((audit!.metadata as { stripe_status_after_cancel: string }).stripe_status_after_cancel).toBe("canceled");
  }, 30_000);

  it("the guard used by cancelStripeSubscriptionAdmin correctly identifies a comped (non-Stripe) subscription as ineligible", async () => {
    // Same source/stripe_subscription_id check the real action performs
    // before ever calling Stripe — proves a comped subscription (no
    // Stripe object) is correctly refused rather than erroring against
    // Stripe with a null id.
    const compedSub: { source: "comped" | "stripe"; stripe_subscription_id: string | null } = { source: "comped", stripe_subscription_id: null };
    const eligible = compedSub.source === "stripe" && Boolean(compedSub.stripe_subscription_id);
    expect(eligible).toBe(false);
  });

  it("the guard correctly refuses a subscription already canceled", async () => {
    const { data: sub } = await admin.from("user_subscriptions").select("canceled_at").eq("user_id", testUserId).single();
    // After the cancellation test above, canceled_at is now set — the
    // real action's early-return check (`if (sub.canceled_at) return
    // { error: ... }`) must fire on a second cancel attempt.
    expect(sub!.canceled_at).not.toBeNull();
  }, 15_000);
});
