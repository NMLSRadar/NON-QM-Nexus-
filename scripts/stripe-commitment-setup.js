#!/usr/bin/env node
/**
 * 3-Month Commitment membership — Stripe configuration step
 * (2026-08-15). Creates/looks up the $120/month commitment Price on the
 * single Membership product and wires the required webhook events.
 *
 * What it configures:
 *   1. A recurring monthly $120 Price (unit_amount 12000) on the SAME
 *      Stripe Product as the standard $150 monthly price — never a new
 *      product, never a touched existing price.
 *   2. membership_plans.stripe_commitment_price_id on the active plan.
 *   3. The /api/webhooks/stripe endpoint's enabled_events so commitment
 *      schedule events reach the app.
 *
 * SAFE TO RE-RUN — fully idempotent. Existing subscriptions are never
 * touched (existing $150/month members stay exactly as they are); only
 * NEW checkouts can pick the commitment option after the app code ships.
 *
 * Run with the PRODUCTION key for the real account:
 *   node scripts/stripe-commitment-setup.js
 * The script uses STRIPE_SECRET_KEY from .env.local (currently the test
 * key) or the environment — for production provide the live key (e.g.
 * `vercel env pull` into .env.local, or export STRIPE_SECRET_KEY=sk_live_…).
 */
require("dotenv").config({ path: ".env.local" });
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COMMITMENT_CENTS = 12000; // $120/mo intro rate
const COMMITMENT_MONTHS = 3;
const WEBHOOK_PATH = "/api/webhooks/stripe";

const REQUIRED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
  "subscription_schedule.created",
  "subscription_schedule.updated",
  "subscription_schedule.canceled",
  "subscription_schedule.aborted",
  "subscription_schedule.released",
];

/** Resolve the Stripe Product id for a plan (own column, else its standard price's product). */
async function resolveProductId(plan) {
  if (plan.stripe_product_id) return plan.stripe_product_id;
  if (plan.stripe_price_id) {
    const price = await stripe.prices.retrieve(plan.stripe_price_id);
    return typeof price.product === "string" ? price.product : price.product.id;
  }
  throw new Error(`Plan "${plan.name}" has neither stripe_product_id nor stripe_price_id — run scripts/stripe-single-plan-2026-08.js first.`);
}

/** Find an active monthly price of the given amount on the product, if any. */
async function findActiveMonthlyPrice(productId, cents) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100, type: "recurring" });
  return prices.data.find((p) => p.unit_amount === cents && p.recurring?.interval === "month") ?? null;
}

async function main() {
  const { data: plans, error } = await admin
    .from("membership_plans")
    .select("id, key, name, tier_level, is_active, stripe_product_id, stripe_price_id, stripe_commitment_price_id")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const active = (plans ?? []).filter((p) => p.is_active);
  if (active.length === 0) throw new Error("No active membership plans found — aborting.");
  const plan = active.reduce((a, b) => (b.tier_level ?? 0) > (a.tier_level ?? 0) ? b : a);

  console.log(`\n=== Ensuring commitment price for plan "${plan.name}" (${plan.key}) ===`);
  const productId = await resolveProductId(plan);
  console.log(`Product: ${productId}`);

  let commitmentPriceId = plan.stripe_commitment_price_id ?? null;
  if (commitmentPriceId) {
    try {
      const existing = await stripe.prices.retrieve(commitmentPriceId);
      if (existing.active && existing.unit_amount === COMMITMENT_CENTS && existing.recurring?.interval === "month") {
        console.log(`Reusing existing commitment price ${commitmentPriceId} ($${(COMMITMENT_CENTS / 100).toFixed(0)}/mo).`);
      } else {
        commitmentPriceId = null;
        console.log(`Stored commitment price ${existing.id} is stale — creating a fresh one.`);
      }
    } catch {
      commitmentPriceId = null;
    }
  }

  if (!commitmentPriceId) {
    const orphan = await findActiveMonthlyPrice(productId, COMMITMENT_CENTS);
    commitmentPriceId = orphan
      ? (console.log(`Reusing orphaned $${(COMMITMENT_CENTS / 100).toFixed(0)}/mo price ${orphan.id}.`), orphan.id)
      : (await stripe.prices.create({
          product: productId,
          currency: "usd",
          unit_amount: COMMITMENT_CENTS,
          recurring: { interval: "month" },
          metadata: { membership_plan_key: plan.key, membership_plan_id: plan.id, membership_kind: "commitment" },
        })).id;
  }

  if (plan.stripe_commitment_price_id !== commitmentPriceId) {
    const { error: upErr } = await admin
      .from("membership_plans")
      .update({ stripe_commitment_price_id: commitmentPriceId })
      .eq("id", plan.id);
    if (upErr) throw new Error(`Failed to save commitment price on plan: ${upErr.message}`);
    console.log(`Plan updated: stripe_commitment_price_id = ${commitmentPriceId}`);
  }

  console.log(`\n=== Webhook endpoint events ===`);
  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  const target = endpoints.data.find((e) => e.url.includes(WEBHOOK_PATH)) ?? null;
  if (!target) {
    console.warn(`No webhook endpoint with URL containing "${WEBHOOK_PATH}" was found on this Stripe account.`);
    console.warn("After creating the endpoint (or linking the existing one), re-run this step. Required events:");
    console.warn(`  ${REQUIRED_EVENTS.join(", ")}`);
  } else {
    const missing = REQUIRED_EVENTS.filter((ev) => !target.enabled_events.includes(ev));
    if (missing.length === 0) {
      console.log(`Endpoint ${target.id} (${target.url}) already has all required events.`);
    } else {
      const merged = [...new Set([...target.enabled_events, ...REQUIRED_EVENTS])];
      const updated = await stripe.webhookEndpoints.update(target.id, { enabled_events: merged });
      console.log(`Endpoint ${target.id} updated — added:\n  ${missing.join("\n  ")}`);
      console.log(`(its URL: ${updated.url}; the endpoint secret must equal STRIPE_WEBHOOK_SECRET)`);
    }
  }

  console.log("\n=== DONE ===\n");
  console.log(`Commitment price: ${commitmentPriceId} ($${(COMMITMENT_CENTS / 100).toFixed(0)}/mo × ${COMMITMENT_MONTHS} cycles → $150/mo)`);
  console.log("Next: deploy the web app code (pricing UI, checkout, webhook, dashboard). New enrollments can then choose the 3-Month Commitment.");
  console.log("Existing $150/month memberships are untouched — no migration runs.");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});