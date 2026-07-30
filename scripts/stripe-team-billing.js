#!/usr/bin/env node
/**
 * Creates per-seat (licensed quantity billing) Stripe Prices for team
 * subscriptions — one monthly + one annual tiered Price per active
 * membership_plans row that has a personal Stripe price already set up
 * (run scripts/stripe-setup-products.js / stripe-annual-billing.js first).
 * Writes stripe_team_price_id / stripe_team_annual_price_id back onto the
 * plan. Idempotent — skips a plan that already has both.
 *
 * Volume discounts use Stripe's own native tiered pricing (tiers_mode:
 * "volume" — the whole quantity is billed at the ONE tier its size falls
 * into, not graduated per-unit) so no custom discount code is needed
 * anywhere else in the app; org_subscriptions checkout
 * (src/app/account/team/subscribe/actions.ts) just sets quantity =
 * seat_count on one of these Prices and Stripe does the rest.
 *
 * TEAM_VOLUME_BREAKPOINTS below are PLACEHOLDER seat/discount pairs —
 * clearly marked, awaiting real numbers from the owner (see HANDOFF.md /
 * the final report). Every tier's unit price is the plan's own monthly (or
 * annual) per-seat price at 0% off until the owner supplies real
 * breakpoints; edit the `discountPercent` values below once they do, then
 * re-run — this script always CREATES a new Stripe Price (Prices are
 * immutable) and overwrites the plan's stripe_team_price_id, so re-running
 * after an edit is exactly how you roll out new breakpoints.
 *
 * Usage: node scripts/stripe-team-billing.js
 * Requires STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * in .env.local (or the environment).
 */
require("dotenv").config({ path: ".env.local" });
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// PLACEHOLDER — awaiting real owner-supplied volume breakpoints (spec
// section 4/8: "leave clearly-marked constants"). `upTo: null` means "and
// above" (Stripe's convention for the last tier). Discounts apply to the
// PER-SEAT unit price for that tier, matching this plan's own monthly (or
// annual) price at 0% off until edited.
const TEAM_VOLUME_BREAKPOINTS = [
  { upTo: 4, discountPercent: 0 }, // 1-4 seats: full per-seat price
  { upTo: 9, discountPercent: 0 }, // 5-9 seats: TODO owner discount %
  { upTo: null, discountPercent: 0 }, // 10+ seats: TODO owner discount % (pricing page also offers "contact us" at this size)
];

function buildTiers(perSeatCents) {
  return TEAM_VOLUME_BREAKPOINTS.map((b) => ({
    up_to: b.upTo === null ? "inf" : b.upTo,
    unit_amount: Math.round(perSeatCents * (1 - b.discountPercent / 100)),
  }));
}

async function createTeamPrice(product, perSeatCents, interval) {
  return stripe.prices.create({
    product,
    currency: "usd",
    recurring: { interval, usage_type: "licensed" },
    billing_scheme: "tiered",
    tiers_mode: "volume",
    tiers: buildTiers(perSeatCents),
  });
}

async function main() {
  const { data: plans, error } = await admin
    .from("membership_plans")
    .select(
      "id, key, name, monthly_price_cents, annual_price_cents, stripe_price_id, stripe_annual_price_id, stripe_team_price_id, stripe_team_annual_price_id"
    )
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  for (const plan of plans) {
    if (plan.stripe_team_price_id && plan.stripe_team_annual_price_id) {
      console.log(`${plan.name}: already has team prices — skipping`);
      continue;
    }
    if (!plan.stripe_price_id) {
      console.log(`${plan.name}: no personal Stripe price yet — skipping (run stripe-setup-products.js first)`);
      continue;
    }

    const monthlyPrice = await stripe.prices.retrieve(plan.stripe_price_id);
    const product = typeof monthlyPrice.product === "string" ? monthlyPrice.product : monthlyPrice.product.id;

    const update = {};
    if (!plan.stripe_team_price_id) {
      const teamMonthly = await createTeamPrice(product, plan.monthly_price_cents, "month");
      update.stripe_team_price_id = teamMonthly.id;
      console.log(`${plan.name}: created team MONTHLY price ${teamMonthly.id}`);
    }
    if (!plan.stripe_team_annual_price_id && plan.annual_price_cents) {
      const teamAnnual = await createTeamPrice(product, plan.annual_price_cents, "year");
      update.stripe_team_annual_price_id = teamAnnual.id;
      console.log(`${plan.name}: created team ANNUAL price ${teamAnnual.id}`);
    }

    if (Object.keys(update).length > 0) {
      const { error: updateError } = await admin.from("membership_plans").update(update).eq("id", plan.id);
      if (updateError) console.error(`${plan.name}: DB update failed — ${updateError.message}`);
    }
  }
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
