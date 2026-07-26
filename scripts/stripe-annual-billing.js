#!/usr/bin/env node
/**
 * Creates a Stripe annual (yearly) Price for each membership plan that has
 * a monthly Stripe price but no annual one yet, at 20% off the monthly*12
 * equivalent, and writes annual_price_cents + stripe_annual_price_id back
 * onto the plan row.
 *
 * Stripe Prices are immutable — this always CREATES a new Price object
 * rather than editing an existing one. Safe to re-run: plans that already
 * have stripe_annual_price_id set are skipped.
 *
 * Usage: node scripts/stripe-annual-billing.js
 * Requires STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * in .env.local (or the environment).
 */
require("dotenv").config({ path: ".env.local" });
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ANNUAL_DISCOUNT_PERCENT = 20;

async function main() {
  const { data: plans, error } = await admin
    .from("membership_plans")
    .select("id, key, name, monthly_price_cents, stripe_price_id, stripe_annual_price_id")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  for (const plan of plans) {
    if (plan.stripe_annual_price_id) {
      console.log(`${plan.name}: already has an annual price (${plan.stripe_annual_price_id}) — skipping`);
      continue;
    }
    if (!plan.stripe_price_id) {
      console.log(`${plan.name}: no monthly Stripe price yet — skipping (run stripe-setup-products.js first)`);
      continue;
    }

    const monthlyPrice = await stripe.prices.retrieve(plan.stripe_price_id);
    const product = typeof monthlyPrice.product === "string" ? monthlyPrice.product : monthlyPrice.product.id;
    const annualCents = Math.round(plan.monthly_price_cents * 12 * (1 - ANNUAL_DISCOUNT_PERCENT / 100));

    const annualPrice = await stripe.prices.create({
      product,
      unit_amount: annualCents,
      currency: monthlyPrice.currency,
      recurring: { interval: "year" },
    });

    const { error: updateError } = await admin
      .from("membership_plans")
      .update({ annual_price_cents: annualCents, stripe_annual_price_id: annualPrice.id })
      .eq("id", plan.id);
    if (updateError) {
      console.error(`${plan.name}: DB update failed — ${updateError.message}`);
      continue;
    }
    console.log(`${plan.name}: created annual price ${annualPrice.id} ($${(annualCents / 100).toFixed(2)}/yr)`);
  }
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
