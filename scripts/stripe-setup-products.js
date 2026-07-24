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

  await c.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
