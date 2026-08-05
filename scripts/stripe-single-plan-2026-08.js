#!/usr/bin/env node
/**
 * Single-membership migration (2026-08-05): collapse the 3 self-serve tiers
 * (Essential $99 / Professional $125 / Enterprise $150) into ONE $150/mo
 * membership with the same annual option ($1440/yr — 20% off, matching the
 * existing ANNUAL_DISCOUNT_PERCENT convention).
 *
 * The Enterprise plan is already $150/mo and unlocks tier 3 (every lender),
 * so it BECOMES the single plan — renamed to "Membership". Essential and
 * Professional are deactivated, and every existing personal + team
 * subscription is migrated onto the single plan so all members get full
 * catalog access. This is the "across the board" step.
 *
 * Stripe Prices are immutable, so any new price is CREATED and the old ones
 * archived (active:false) but never deleted (existing subscriptions may still
 * reference them until migrated).
 *
 * OWNER DECISION — existing paid subscribers:
 *   By default (MIGRATE_EXISTING_STRIPE=true) this script also moves every
 *   existing Stripe subscription onto the single $150 price, so all members
 *   are billed the same from their next cycle (Stripe prorates the difference
 *   automatically). If you instead want to GRANDFATHER current subscribers at
 *   their existing price, set MIGRATE_EXISTING_STRIPE=false and tell us — the
 *   plan/deactivation changes still apply, but existing billing is left alone
 *   (their access still moves to full catalog via the plan_id migration).
 *
 * SAFE TO RE-RUN — idempotent.
 *
 * Usage: node scripts/stripe-single-plan-2026-08.js
 * Requires STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * in .env.local (or the environment).
 */
require("dotenv").config({ path: ".env.local" });
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SINGLE_PLAN_NAME = "Membership";
const SINGLE_MONTHLY_CENTS = 15000; // $150/mo
const ANNUAL_DISCOUNT_PERCENT = 20; // matches scripts/stripe-reprice-2026-07.js
const SINGLE_ANNUAL_CENTS = Math.round((SINGLE_MONTHLY_CENTS * 12 * (100 - ANNUAL_DISCOUNT_PERCENT)) / 100); // $1440/yr

// OWNER DECISION — see header comment.
const MIGRATE_EXISTING_STRIPE = (process.env.MIGRATE_EXISTING_STRIPE ?? "true") === "true";

async function ensurePrice(productId, cents, interval, planId, planKey) {
  // Create a new Stripe recurring Price on the given product. Prices are
  // immutable, so we always create fresh (callers decide whether to reuse).
  return stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: cents,
    recurring: { interval },
    metadata: { membership_plan_key: planKey, membership_plan_id: planId },
  });
}

async function archivePrice(priceId) {
  if (!priceId) return;
  try {
    await stripe.prices.update(priceId, { active: false });
    console.log(`  [archive] ${priceId}`);
  } catch (err) {
    console.warn(`  [warn] could not archive ${priceId}: ${err.message}`);
  }
}

async function main() {
  const { data: plans, error } = await admin
    .from("membership_plans")
    .select(
      "id, key, name, monthly_price_cents, annual_price_cents, tier_level, is_active, stripe_price_id, stripe_annual_price_id, stripe_team_price_id, stripe_team_annual_price_id"
    );
  if (error) throw new Error(error.message);

  const active = (plans ?? []).filter((p) => p.is_active);
  if (active.length === 0) throw new Error("No active membership plans found — aborting.");
  if (active.length > 1) {
    console.log(`Collapsing ${active.length} active plans into the single Membership.`);
  }

  // The single plan = the active plan with the highest tier_level (Enterprise,
  // tier 3 / full catalog). If some other plan is somehow higher, we still pick
  // the max-tier one so everyone gets full access.
  const single = active.reduce((a, b) => (b.tier_level > a.tier_level ? b : a));
  const deactivating = active.filter((p) => p.id !== single.id);

  console.log(`\n=== Single membership plan: ${single.name} (key "${single.key}", tier ${single.tier_level}) ===`);
  console.log(`Deactivating: ${deactivating.map((p) => `${p.name} (${p.key})`).join(", ") || "none"}`);

  // --- 1. Ensure the single plan has $150/mo + $1440/yr Stripe prices ---
  let monthlyPriceId = single.stripe_price_id;
  let annualPriceId = single.stripe_annual_price_id;

  if (monthlyPriceId && single.monthly_price_cents === SINGLE_MONTHLY_CENTS) {
    console.log(`Monthly price OK (already $150/mo): ${monthlyPriceId}`);
  } else {
    if (!monthlyPriceId) throw new Error(`${single.name} has no monthly Stripe price — run scripts/stripe-setup-products.js first, or create one manually.`);
    // Price exists but isn't $150 — create a new one and update the row below.
    console.log(`${single.name} monthly price is not $150/mo — creating a new $150 price.`);
    const old = await stripe.prices.retrieve(monthlyPriceId);
    const productId = typeof old.product === "string" ? old.product : old.product.id;
    monthlyPriceId = (await ensurePrice(productId, SINGLE_MONTHLY_CENTS, "month", single.id, single.key)).id;
    await archivePrice(single.stripe_price_id);
  }

  if (annualPriceId && single.annual_price_cents === SINGLE_ANNUAL_CENTS) {
    console.log(`Annual price OK (already $${(SINGLE_ANNUAL_CENTS / 100).toFixed(0)}/yr): ${annualPriceId}`);
  } else {
    // Reuse the existing annual price if it's already the right amount, else create one.
    if (annualPriceId) {
      const existing = await stripe.prices.retrieve(annualPriceId);
      if (existing.unit_amount === SINGLE_ANNUAL_CENTS && existing.recurring?.interval === "year") {
        console.log(`Annual price is already $${(SINGLE_ANNUAL_CENTS / 100).toFixed(0)}/yr — reusing: ${annualPriceId}`);
      } else {
        const old = await stripe.prices.retrieve(monthlyPriceId ?? single.stripe_price_id);
        const productId = typeof old.product === "string" ? old.product : old.product.id;
        annualPriceId = (await ensurePrice(productId, SINGLE_ANNUAL_CENTS, "year", single.id, single.key)).id;
        await archivePrice(single.stripe_annual_price_id);
      }
    } else {
      const old = await stripe.prices.retrieve(monthlyPriceId);
      const productId = typeof old.product === "string" ? old.product : old.product.id;
      annualPriceId = (await ensurePrice(productId, SINGLE_ANNUAL_CENTS, "year", single.id, single.key)).id;
    }
  }

  // --- 2. Update the single plan row: name + prices ---
  const { error: singleUpdateError } = await admin
    .from("membership_plans")
    .update({
      name: SINGLE_PLAN_NAME,
      monthly_price_cents: SINGLE_MONTHLY_CENTS,
      annual_price_cents: SINGLE_ANNUAL_CENTS,
      stripe_price_id: monthlyPriceId,
      stripe_annual_price_id: annualPriceId,
    })
    .eq("id", single.id);
  if (singleUpdateError) throw new Error(`Failed to update ${single.name}: ${singleUpdateError.message}`);
  console.log(`\nSingle plan updated: "${SINGLE_PLAN_NAME}" @ $150/mo, $${(SINGLE_ANNUAL_CENTS / 100).toFixed(0)}/yr (price ${monthlyPriceId} / ${annualPriceId}).`);

  // --- 3. Deactivate the old tiers + archive their prices ---
  for (const plan of deactivating) {
    const { error: deactError } = await admin.from("membership_plans").update({ is_active: false }).eq("id", plan.id);
    if (deactError) throw new Error(`Failed to deactivate ${plan.name}: ${deactError.message}`);
    console.log(`\nDeactivated ${plan.name} (${plan.key}). Archiving its prices:`);
    for (const pid of [plan.stripe_price_id, plan.stripe_annual_price_id, plan.stripe_team_price_id, plan.stripe_team_annual_price_id]) {
      await archivePrice(pid);
    }
  }

  // --- 4. Point every existing subscription at the single plan (full access) ---
  const { data: userSubs, error: usErr } = await admin
    .from("user_subscriptions")
    .update({ plan_id: single.id })
    .neq("plan_id", single.id)
    .select("id, plan_id, source, stripe_subscription_id");
  if (usErr) throw new Error(`user_subscriptions migration failed: ${usErr.message}`);
  const migratedUsers = (userSubs ?? []).length;
  console.log(`\nMigrated ${migratedUsers} personal subscription row(s) to the single plan.`);

  const { data: orgSubs, error: osErr } = await admin
    .from("org_subscriptions")
    .update({ plan_id: single.id })
    .neq("plan_id", single.id)
    .select("id, plan_id, source, stripe_subscription_id");
  if (osErr) throw new Error(`org_subscriptions migration failed: ${osErr.message}`);
  const migratedOrgs = (orgSubs ?? []).length;
  console.log(`Migrated ${migratedOrgs} team subscription row(s) to the single plan.`);

  // --- 5. Move existing Stripe subscriptions onto the single $150 price ---
  if (MIGRATE_EXISTING_STRIPE) {
    const oldPriceIds = new Set();
    for (const plan of deactivating) {
      for (const pid of [plan.stripe_price_id, plan.stripe_annual_price_id, plan.stripe_team_price_id, plan.stripe_team_annual_price_id]) {
        if (pid) oldPriceIds.add(pid);
      }
    }

    const subsToMigrate = [
      ...(userSubs ?? []).filter((s) => s.source === "stripe" && s.stripe_subscription_id),
      ...(orgSubs ?? []).filter((s) => s.source === "stripe" && s.stripe_subscription_id),
    ];
    // Deduplicate by Stripe subscription id (a subscription only appears in one table, but be safe).
    const seen = new Set();
    const unique = subsToMigrate.filter((s) => (seen.has(s.stripe_subscription_id) ? false : (seen.add(s.stripe_subscription_id), true)));

    let migratedStripe = 0;
    for (const row of unique) {
      try {
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["items.data.price"] });
        const item = sub.items?.data?.[0];
        if (!item) continue;
        const currentPriceId = item.price?.id;
        if (!currentPriceId || !oldPriceIds.has(currentPriceId)) continue; // already on the single plan's price

        const interval = item.price?.recurring?.interval === "year" ? "year" : "month";
        const isTeam = Boolean(sub.metadata?.team === "true");
        const newPriceId = interval === "year"
          ? (isTeam ? single.stripe_team_annual_price_id : annualPriceId)
          : (isTeam ? single.stripe_team_price_id : monthlyPriceId);
        if (!newPriceId) {
          console.warn(`  [skip] ${row.stripe_subscription_id}: no single-plan ${interval} price for ${isTeam ? "team" : "personal"} — leaving as-is.`);
          continue;
        }

        await stripe.subscriptions.update(sub.id, {
          proration_behavior: "create_prorations",
          items: [{ id: item.id, price: newPriceId }],
        });
        migratedStripe++;
        console.log(`  [stripe] ${sub.id}: ${currentPriceId} -> ${newPriceId} (${interval}, ${isTeam ? "team" : "personal"})`);
      } catch (err) {
        console.warn(`  [skip] ${row.stripe_subscription_id}: ${err.message}`);
      }
    }
    console.log(`Migrated ${migratedStripe} Stripe subscription(s) to the single $150 price.`);
  } else {
    console.log("\nMIGRATE_EXISTING_STRIPE=false — existing Stripe subscriptions left at their current price (grandfathered).");
  }

  console.log("\n=== Done. Single $150/mo membership ($1440/yr annual option) is live for new checkouts, and all members have full catalog access. ===");
  console.log("Reminder: deploy the code changes (pricing UI, lender directory, copy) with the same ship so the UI matches.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});