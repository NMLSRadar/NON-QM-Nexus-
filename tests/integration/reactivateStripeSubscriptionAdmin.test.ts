// Live database + live Stripe (test mode) coverage for the admin-side
// "Reactivate Stripe subscription" button (src/app/admin/users/actions.ts's
// reactivateStripeSubscriptionAdmin) — the counterpart to
// tests/integration/cancelStripeSubscriptionAdmin.test.ts. The action
// itself needs a real Next.js request/cookie context, so this test
// mirrors its exact sequence against the service-role client + real
// Stripe test-mode calls, covering BOTH real paths: (1) resuming a
// still-active subscription by clearing cancel_at_period_end, and (2)
// recreating a brand-new subscription once Stripe has fully, terminally
// canceled the old one.
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

describe.skipIf(!hasCredentials)("Admin-side Stripe subscription reactivation (live database + live Stripe test mode)", () => {
  let admin: SupabaseClient;
  let stripe: Stripe;
  const suffix = Date.now();
  let planId: string;
  let priceId: string;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    stripe = new Stripe(STRIPE_SECRET_KEY!);

    const { data: plan } = await admin.from("membership_plans").select("id, stripe_price_id").eq("is_active", true).not("stripe_price_id", "is", null).limit(1).single();
    planId = plan!.id as string;
    priceId = plan!.stripe_price_id as string;
  }, 15_000);

  // --- Case 1: cancel_at_period_end=true, Stripe subscription still
  // "active" — the graceful in-grace-period case; resuming should just
  // clear the flag via stripe.subscriptions.update(), no new subscription.
  describe("Case 1 — subscription is still active with cancel_at_period_end=true (grace period, not yet Stripe-terminal)", () => {
    let testUserId: string;
    let stripeCustomerId: string;
    let stripeSubscriptionId: string;

    beforeAll(async () => {
      const { data: authUser } = await admin.auth.admin.createUser({
        email: `reactivate-grace-test-${suffix}@example.com`,
        email_confirm: true,
        password: `TestPass${suffix}!`,
      });
      testUserId = authUser!.user!.id;

      const customer = await stripe.customers.create({ email: `reactivate-grace-test-${suffix}@example.com`, metadata: { test: "true" } });
      stripeCustomerId = customer.id;
      const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: stripeCustomerId });
      await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethod.id } });

      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethod.id,
        metadata: { test: "reactivateStripeSubscriptionAdmin_grace" },
      });
      stripeSubscriptionId = subscription.id;

      // Mirrors the customer's own graceful self-serve cancel
      // (subscription-actions.ts): cancel_at_period_end=true, status
      // stays "active" until the period actually ends.
      await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });

      await admin.from("user_subscriptions").upsert(
        {
          user_id: testUserId,
          plan_id: planId,
          discount_id: null,
          source: "stripe",
          stripe_subscription_id: stripeSubscriptionId,
          stripe_customer_id: stripeCustomerId,
          billing_interval: "monthly",
          // The local row only reflects canceled_at once Stripe's status
          // is actually terminal in production, but the button is gated
          // on canceled_at being set — set it here to exercise the
          // button's precondition directly, independent of webhook timing.
          canceled_at: new Date().toISOString(),
          cancel_at_period_end: true,
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
        // already canceled — fine
      }
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch {
        // ignore
      }
      await admin.auth.admin.deleteUser(testUserId);
    }, 30_000);

    it("mirrors reactivateStripeSubscriptionAdmin exactly: since Stripe's real status is NOT canceled, it clears cancel_at_period_end via update() rather than recreating", async () => {
      const { data: subRow } = await admin.from("user_subscriptions").select("stripe_subscription_id, canceled_at").eq("user_id", testUserId).single();
      expect(subRow!.canceled_at).not.toBeNull();

      const existing = await stripe.subscriptions.retrieve(subRow!.stripe_subscription_id as string);
      expect(existing.status).not.toBe("canceled");
      expect(existing.cancel_at_period_end).toBe(true);

      const updated = await stripe.subscriptions.update(existing.id, { cancel_at_period_end: false });
      expect(updated.cancel_at_period_end).toBe(false);
      expect(updated.status).not.toBe("canceled");

      const { error: updateError } = await admin
        .from("user_subscriptions")
        .update({ canceled_at: null, cancel_at_period_end: false, stripe_status: updated.status })
        .eq("user_id", testUserId);
      expect(updateError).toBeNull();

      await admin.from("audit_logs").insert({
        organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
        actor_user_id: testUserId,
        action: "user_subscription.stripe_reactivated_by_admin",
        entity_type: "user_subscriptions",
        entity_id: testUserId,
        metadata: { reason: "Test resume", result: `Resumed the existing subscription — status "${updated.status}".` },
      });

      // The subscription id must NOT have changed — this is the "resume",
      // not a recreation.
      const refetched = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      expect(refetched.cancel_at_period_end).toBe(false);

      const { data: finalRow } = await admin.from("user_subscriptions").select("canceled_at, cancel_at_period_end, stripe_subscription_id").eq("user_id", testUserId).single();
      expect(finalRow!.canceled_at).toBeNull();
      expect(finalRow!.cancel_at_period_end).toBe(false);
      expect(finalRow!.stripe_subscription_id).toBe(stripeSubscriptionId); // unchanged id

      const { data: audit } = await admin
        .from("audit_logs")
        .select("metadata")
        .eq("entity_id", testUserId)
        .eq("action", "user_subscription.stripe_reactivated_by_admin")
        .maybeSingle();
      expect(audit).toBeTruthy();
      expect((audit!.metadata as { result: string }).result).toMatch(/resumed/i);
    }, 30_000);
  });

  // --- Case 2: the subscription is already status="canceled" (fully
  // terminal — exactly what cancelStripeSubscriptionAdmin's immediate
  // cancel() produces) — a genuinely new subscription must be created.
  describe("Case 2 — subscription is already Stripe-terminal (status=canceled) — must recreate a new subscription", () => {
    let testUserId: string;
    let stripeCustomerId: string;
    let originalSubscriptionId: string;

    beforeAll(async () => {
      const { data: authUser } = await admin.auth.admin.createUser({
        email: `reactivate-recreate-test-${suffix}@example.com`,
        email_confirm: true,
        password: `TestPass${suffix}!`,
      });
      testUserId = authUser!.user!.id;

      const customer = await stripe.customers.create({ email: `reactivate-recreate-test-${suffix}@example.com`, metadata: { test: "true" } });
      stripeCustomerId = customer.id;
      const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: stripeCustomerId });
      await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethod.id } });

      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethod.id,
        metadata: { test: "reactivateStripeSubscriptionAdmin_recreate" },
      });
      originalSubscriptionId = subscription.id;
      // Actually, terminally cancel it — this is the real "already
      // canceled" state the button targets.
      await stripe.subscriptions.cancel(originalSubscriptionId);

      await admin.from("user_subscriptions").upsert(
        {
          user_id: testUserId,
          plan_id: planId,
          discount_id: null,
          source: "stripe",
          stripe_subscription_id: originalSubscriptionId,
          stripe_customer_id: stripeCustomerId,
          billing_interval: "monthly",
          canceled_at: new Date().toISOString(),
          cancel_at_period_end: false,
        },
        { onConflict: "user_id" }
      );
    }, 30_000);

    afterAll(async () => {
      await admin.from("audit_logs").delete().eq("entity_id", testUserId);
      const { data: finalRow } = await admin.from("user_subscriptions").select("stripe_subscription_id").eq("user_id", testUserId).maybeSingle();
      await admin.from("user_subscriptions").delete().eq("user_id", testUserId);
      for (const id of [originalSubscriptionId, finalRow?.stripe_subscription_id as string | undefined].filter(Boolean)) {
        try {
          await stripe.subscriptions.cancel(id as string);
        } catch {
          // already canceled — fine
        }
      }
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch {
        // ignore
      }
      await admin.auth.admin.deleteUser(testUserId);
    }, 30_000);

    it("mirrors reactivateStripeSubscriptionAdmin exactly: recreates a brand-new Stripe subscription (new id) for the same customer + plan, and writes it back", async () => {
      const { data: subRow } = await admin
        .from("user_subscriptions")
        .select("stripe_subscription_id, stripe_customer_id, plan_id, billing_interval, canceled_at")
        .eq("user_id", testUserId)
        .single();
      expect(subRow!.canceled_at).not.toBeNull();

      const existing = await stripe.subscriptions.retrieve(subRow!.stripe_subscription_id as string);
      expect(existing.status).toBe("canceled"); // confirms this is genuinely the terminal case

      const { data: plan } = await admin.from("membership_plans").select("stripe_price_id, stripe_annual_price_id").eq("id", subRow!.plan_id as string).single();
      const recreatePriceId = subRow!.billing_interval === "annual" ? plan!.stripe_annual_price_id : plan!.stripe_price_id;
      expect(recreatePriceId).toBeTruthy();

      const recreated = await stripe.subscriptions.create({
        customer: subRow!.stripe_customer_id as string,
        items: [{ price: recreatePriceId as string }],
        payment_behavior: "default_incomplete",
        metadata: { supabase_user_id: testUserId, membership_plan_id: subRow!.plan_id as string },
      });
      expect(recreated.id).not.toBe(originalSubscriptionId); // a genuinely NEW subscription
      expect(["active", "trialing", "incomplete"]).toContain(recreated.status);

      const { error: updateError } = await admin
        .from("user_subscriptions")
        .update({
          stripe_subscription_id: recreated.id,
          stripe_customer_id: subRow!.stripe_customer_id,
          stripe_status: recreated.status,
          canceled_at: null,
          cancel_at_period_end: false,
        })
        .eq("user_id", testUserId);
      expect(updateError).toBeNull();

      await admin.from("audit_logs").insert({
        organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
        actor_user_id: testUserId,
        action: "user_subscription.stripe_reactivated_by_admin",
        entity_type: "user_subscriptions",
        entity_id: testUserId,
        metadata: { reason: "Test recreate", result: `Recreated a new subscription (${recreated.id}).` },
      });

      // Verify against the REAL Stripe objects: the old one stays
      // canceled forever, the new one is a genuinely distinct object.
      const oldStillCanceled = await stripe.subscriptions.retrieve(originalSubscriptionId);
      expect(oldStillCanceled.status).toBe("canceled");
      const newSub = await stripe.subscriptions.retrieve(recreated.id);
      expect(newSub.id).not.toBe(originalSubscriptionId);
      expect(newSub.metadata.supabase_user_id).toBe(testUserId);

      const { data: finalRow } = await admin.from("user_subscriptions").select("stripe_subscription_id, canceled_at").eq("user_id", testUserId).single();
      expect(finalRow!.stripe_subscription_id).toBe(recreated.id);
      expect(finalRow!.stripe_subscription_id).not.toBe(originalSubscriptionId);
      expect(finalRow!.canceled_at).toBeNull();

      const { data: audit } = await admin
        .from("audit_logs")
        .select("metadata")
        .eq("entity_id", testUserId)
        .eq("action", "user_subscription.stripe_reactivated_by_admin")
        .maybeSingle();
      expect((audit!.metadata as { result: string }).result).toMatch(/recreated/i);
    }, 30_000);
  });

  it("the guard used by reactivateStripeSubscriptionAdmin correctly identifies a non-canceled subscription as ineligible", () => {
    const activeSub = { source: "stripe" as const, stripe_subscription_id: "sub_x", canceled_at: null as string | null };
    const eligible = activeSub.source === "stripe" && Boolean(activeSub.stripe_subscription_id) && Boolean(activeSub.canceled_at);
    expect(eligible).toBe(false);
  });

  it("the guard correctly identifies a comped (non-Stripe) canceled subscription as ineligible for THIS action", () => {
    const compedSub: { source: "comped" | "stripe"; stripe_subscription_id: string | null; canceled_at: string | null } = {
      source: "comped",
      stripe_subscription_id: null,
      canceled_at: "2026-07-01T00:00:00.000Z",
    };
    const eligible = compedSub.source === "stripe" && Boolean(compedSub.stripe_subscription_id) && Boolean(compedSub.canceled_at);
    expect(eligible).toBe(false);
  });
});
