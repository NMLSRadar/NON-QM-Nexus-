#!/usr/bin/env node
/**
 * One-off: raise all three membership plan prices (Essential $79->$99,
 * Professional $99->$125, Enterprise $119->$150), per explicit owner
 * request (2026-07-28). Stripe Prices are immutable, so this always
 * CREATES new monthly + annual Price objects on the SAME existing
 * product (never edits an existing Price), then points the plan's
 * stripe_price_id / stripe_annual_price_id at the new ones and updates
 * monthly_price_cents / annual_price_cents to match. The OLD prices are
 * archived (active:false) so they can never be selected for a NEW
 * checkout again, but are left intact (never deleted) since Stripe
 * requires a subscription's referenced price to keep existing — any
 * already-subscribed customer stays on their original price until
 * their subscription is separately migrated.
 *
 * Safe to re-run: a plan whose monthly_price_cents already matches the
 * target is skipped.
 */
require("dotenv").config({ path: ".env.local" });
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ANNUAL_DISCOUNT_PERCENT = 20;
const NEW_MONTHLY_CENTS = {
  essential: 9900,
  professional: 12500,
  enterprise: 15000,
};

async function main() {
  const { data: plans, error } = await admin
    .from("membership_plans")
    .select("id, key, name, monthly_price_cents, stripe_price_id, stripe_annual_price_id")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  for (const plan of plans) {
    const targetCents = NEW_MONTHLY_CENTS[plan.key];
    if (!targetCents) {
      console.log(`${plan.name}: no target price configured for key "${plan.key}" — skipping`);
      continue;
    }
    if (plan.monthly_price_cents === targetCents) {
      console.log(`${plan.name}: already at $${(targetCents / 100).toFixed(2)}/mo — skipping`);
      continue;
    }
    if (!plan.stripe_price_id) {
      console.log(`${plan.name}: no existing Stripe price to derive the product from — skipping`);
      continue;
    }

    const oldMonthly = await stripe.prices.retrieve(plan.stripe_price_id);
    const productId = typeof oldMonthly.product === "string" ? oldMonthly.product : oldMonthly.product.id;

    const newMonthly = await stripe.prices.create({
      product: productId,
      currency: oldMonthly.currency,
      unit_amount: targetCents,
      recurring: { interval: "month" },
      metadata: { membership_plan_key: plan.key, membership_plan_id: plan.id },
    });

    const annualCents = Math.round((targetCents * 12 * (100 - ANNUAL_DISCOUNT_PERCENT)) / 100);
    const newAnnual = await stripe.prices.create({
      product: productId,
      currency: oldMonthly.currency,
      unit_amount: annualCents,
      recurring: { interval: "year" },
      metadata: { membership_plan_key: plan.key, membership_plan_id: plan.id },
    });

    // Archive the old prices so they can't be picked for a brand-new
    // checkout, without deleting them (existing subscriptions may still
    // reference them).
    await stripe.prices.update(plan.stripe_price_id, { active: false });
    if (plan.stripe_annual_price_id) {
      await stripe.prices.update(plan.stripe_annual_price_id, { active: false });
    }

    const { error: updateError } = await admin
      .from("membership_plans")
      .update({
        monthly_price_cents: targetCents,
        annual_price_cents: annualCents,
        stripe_price_id: newMonthly.id,
        stripe_annual_price_id: newAnnual.id,
      })
      .eq("id", plan.id);
    if (updateError) {
      console.error(`${plan.name}: DB update failed — ${updateError.message}`);
      continue;
    }

    console.log(
      `${plan.name}: $${(plan.monthly_price_cents / 100).toFixed(2)} -> $${(targetCents / 100).toFixed(2)}/mo ` +
        `(new price ${newMonthly.id}); annual $${(annualCents / 100).toFixed(2)}/yr (new price ${newAnnual.id}). ` +
        `Old prices ${plan.stripe_price_id} / ${plan.stripe_annual_price_id ?? "n/a"} archived.`
    );
  }
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
