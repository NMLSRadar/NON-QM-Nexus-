const Stripe = require("stripe");
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
const url = "https://nonqmnexus.com/api/webhooks/stripe";

(async () => {
  // Skip if one already exists for this exact URL (idempotent re-run).
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const already = existing.data.find((e) => e.url === url);
  if (already) {
    console.log(`Webhook endpoint already exists: ${already.id} (secret not re-shown by Stripe — reuse the one already saved).`);
    return;
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: [
      "checkout.session.completed",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_failed",
    ],
  });
  console.log("Webhook endpoint created:", endpoint.id);
  console.log("STRIPE_WEBHOOK_SECRET=" + endpoint.secret);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
