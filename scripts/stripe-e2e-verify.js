// Real end-to-end verification: creates an actual Stripe subscription
// (using Stripe's official test payment method token, not a fake event),
// which fires REAL webhooks to the LIVE production endpoint
// (https://nonqmnexus.com/api/webhooks/stripe), then polls our own DB to
// confirm the webhook correctly created the user_subscriptions row.
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
const pg = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TEST_USER_ID = process.argv[2];
if (!TEST_USER_ID) {
  console.error("Usage: node scripts/stripe-e2e-verify.js <supabase_user_id>");
  process.exit(1);
}

(async () => {
  await pg.connect();
  const { rows } = await pg.query("select id, stripe_price_id from membership_plans where key = 'essential'");
  const priceId = rows[0].stripe_price_id;

  const customer = await stripe.customers.create({
    email: "nqn-stripe-e2e-test@gmail.com",
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
    metadata: { supabase_user_id: TEST_USER_ID },
  });
  console.log("Created customer:", customer.id);

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    metadata: { supabase_user_id: TEST_USER_ID },
    expand: ["latest_invoice.payments"],
  });
  console.log("Created subscription:", subscription.id, "status:", subscription.status);

  console.log("\nWaiting 8s for the live webhook to process...");
  await new Promise((r) => setTimeout(r, 8000));

  const { rows: subRows } = await pg.query("select * from user_subscriptions where user_id = $1", [TEST_USER_ID]);
  console.log("\nuser_subscriptions row after webhook:", JSON.stringify(subRows[0], null, 2));

  await pg.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
