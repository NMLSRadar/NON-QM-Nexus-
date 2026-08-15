// Live-mode Stripe cutover (2026-08-15): the FIRST step of the owner-run
// "go live and accept payments" checklist.
//
// membership_plans rows currently carry TEST-mode price IDs (created and
// verified in test mode). Test price IDs do not exist inside the LIVE
// Stripe account — any checkout using them fails with "No such price".
//
// This script creates, inside LIVE mode only:
//   1. A Live Product per active plan (reuses the plan's stored
//      stripe_product_id when that ID still resolves in Live mode).
//   2. Fresh Live recurring Prices for the plan's monthly + annual (and
//      team monthly + team annual if the row stores team ids) amounts.
//   3. Re-points the row's stripe_*price_id columns at the new Live IDs.
//
// Idempotent: if a stored price ID still resolves under the Live key it is
// kept; otherwise a fresh price is created. Safe to re-run.
//
// SAFETY: refuses to run unless STRIPE_SECRET_KEY is a LIVE key (sk_live_).
// Test-mode keys abort loudly — running this with test keys would keep the
// DB pointed at test prices and silently break live checkouts.
//
// Usage (with a .env.local that has the LIVE sk_live / DATABASE_URL):
//   node scripts/stripe-live-bootstrap.js
// then, in order (or via `npm run stripe:live`):
//   node scripts/stripe-single-plan-2026-08.js
//   node scripts/stripe-commitment-setup.js
//   node scripts/stripe-register-webhook.js
const Stripe = require("stripe");
const { Client } = require("pg");
const fs = require("fs");

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const key = env.STRIPE_SECRET_KEY || "";
if (!key.startsWith("sk_live_")) {
  console.error(
    "REFUSING TO RUN: STRIPE_SECRET_KEY is not a live key (sk_live_...). " +
      "Put the LIVE secret key in .env.local first. This script must NEVER run against test mode."
  );
  process.exit(2);
}

const stripe = new Stripe(key);
const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function priceResolves(priceId) {
  try {
    await stripe.prices.retrieve(priceId);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await c.connect();
  const { rows: plans } = await c.query(
    "select id, key, name, description, monthly_price_cents, annual_price_cents, " +
      "stripe_product_id, stripe_price_id, stripe_annual_price_id, " +
      "stripe_team_price_id, stripe_team_annual_price_id " +
      "from membership_plans where is_active = true order by sort_order"
  );
  if (plans.length === 0) {
    console.log("No active membership plans — nothing to do.");
    await c.end();
    return;
  }

  for (const plan of plans) {
    console.log(`\n=== ${plan.name} (${plan.id}) ===`);

    // --- Product ---
    let productId = plan.stripe_product_id || null;
    if (productId) {
      try {
        const prod = await stripe.products.retrieve(productId);
        if (prod.deleted) productId = null;
      } catch {
        productId = null;
      }
    }
    if (!productId) {
      const product = await stripe.products.create({
        name: `NON-QM Nexus — ${plan.name}`,
        description: plan.description || undefined,
        metadata: { membership_plan_key: plan.key, membership_plan_id: plan.id },
      });
      productId = product.id;
      console.log(`  [product] created ${productId}`);
    } else {
      console.log(`  [product] reuse ${productId}`);
    }

    // --- Prices: keep if the stored id still resolves live, else create ---
    const shapes = [
      { column: "stripe_price_id", cents: plan.monthly_price_cents, interval: "month" },
      { column: "stripe_annual_price_id", cents: plan.annual_price_cents, interval: "year" },
    ];
    if (plan.stripe_team_price_id || plan.stripe_team_annual_price_id) {
      shapes.push({ column: "stripe_team_price_id", cents: plan.monthly_price_cents, interval: "month" });
      shapes.push({ column: "stripe_team_annual_price_id", cents: plan.annual_price_cents, interval: "year" });
    }

    const updates = {};
    for (const shape of shapes) {
      const stored = plan[shape.column];
      let finalId = null;
      if (stored) {
        if (await priceResolves(stored)) {
          console.log(`  [keep] ${shape.column}: ${stored} ($${(shape.cents / 100).toFixed(0)}/${shape.interval})`);
          finalId = stored;
        } else {
          console.log(`  [replace] ${shape.column}: stored ${stored} does not resolve in Live — creating fresh.`);
        }
      }
      if (!finalId) {
        const price = await stripe.prices.create({
          product: productId,
          currency: "usd",
          unit_amount: shape.cents,
          recurring: { interval: shape.interval },
          metadata: { membership_plan_key: plan.key, membership_plan_id: plan.id },
        });
        finalId = price.id;
        console.log(`  [create] ${shape.column}: ${finalId} ($${(shape.cents / 100).toFixed(0)}/${shape.interval})`);
      }
      updates[shape.column] = finalId;
    }
    updates.stripe_product_id = productId;

    const setClause = Object.keys(updates)
      .map((col, i) => `${col} = $${i + 1}`)
      .join(", ");
    await c.query(`update membership_plans set ${setClause} where id = $${Object.keys(updates).length + 1}`, [
      ...Object.values(updates),
      plan.id,
    ]);
    console.log(`[ok] ${plan.name} re-pointed to Live product/price ids.`);
  }

  await c.end();
  console.log("\n=== Live prices are in place. Next, run in order: ===");
  console.log("  node scripts/stripe-single-plan-2026-08.js");
  console.log("  node scripts/stripe-commitment-setup.js");
  console.log("  node scripts/stripe-register-webhook.js");
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});