// One-off: create Stripe Products + recurring monthly Prices matching the
// existing membership_plans rows, then write the price id back onto each
// plan. Safe to re-run — skips a plan that already has a stripe_price_id.
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

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await c.connect();
  const { rows: plans } = await c.query(
    "select id, key, name, monthly_price_cents, description, stripe_price_id from membership_plans where is_active = true order by sort_order"
  );

  for (const plan of plans) {
    if (plan.stripe_price_id) {
      console.log(`[skip] ${plan.name} already has price ${plan.stripe_price_id}`);
      continue;
    }
    const product = await stripe.products.create({
      name: `NON-QM Nexus — ${plan.name}`,
      description: plan.description || undefined,
      metadata: { membership_plan_key: plan.key, membership_plan_id: plan.id },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.monthly_price_cents,
      recurring: { interval: "month" },
      metadata: { membership_plan_key: plan.key, membership_plan_id: plan.id },
    });
    await c.query("update membership_plans set stripe_price_id = $1 where id = $2", [price.id, plan.id]);
    console.log(`[ok] ${plan.name} -> product ${product.id}, price ${price.id} ($${(plan.monthly_price_cents / 100).toFixed(2)}/mo)`);
  }

  // AE Featured Placement — a single flat-fee monthly advertising-placement
  // product (RESPA Section 8 conservative design: flat subscription only,
  // never per-lead/per-click/per-referral). Price id is written to
  // .env.local as AE_PLACEMENT_STRIPE_PRICE_ID for the app to read — there
  // is no membership_plans-style table for this one product, so an env
  // var is the simplest single source of truth, consistent with how
  // STRIPE_WEBHOOK_SECRET etc. are already handled.
  const AE_PLACEMENT_MONTHLY_PRICE_CENTS = 4900; // $49/mo flat — adjust before enabling AE_MONETIZATION_ENABLED
  if (!env.AE_PLACEMENT_STRIPE_PRICE_ID) {
    const aeProduct = await stripe.products.create({
      name: "AE Featured Placement",
      description: "Flat monthly subscription for featured advertising placement in the NON-QM Nexus AE contact directory. Advertising placement only — never tied to leads, clicks, referrals, or closed loans.",
      metadata: { kind: "ae_placement" },
    });
    const aePrice = await stripe.prices.create({
      product: aeProduct.id,
      currency: "usd",
      unit_amount: AE_PLACEMENT_MONTHLY_PRICE_CENTS,
      recurring: { interval: "month" },
      metadata: { kind: "ae_placement" },
    });
    console.log(`[ok] AE Featured Placement -> product ${aeProduct.id}, price ${aePrice.id} ($${(AE_PLACEMENT_MONTHLY_PRICE_CENTS / 100).toFixed(2)}/mo)`);
    console.log(`\nAdd this to .env.local and Vercel:\n  AE_PLACEMENT_STRIPE_PRICE_ID=${aePrice.id}\n`);
  } else {
    console.log(`[skip] AE Featured Placement already configured (AE_PLACEMENT_STRIPE_PRICE_ID=${env.AE_PLACEMENT_STRIPE_PRICE_ID})`);
  }

  await c.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

