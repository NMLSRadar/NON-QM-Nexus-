import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { PLANS, type Plan } from "../src/config/pricing";

const apply = process.argv.includes("--apply");
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is required.");
const stripe = new Stripe(stripeKey);

async function resolveProduct(): Promise<Stripe.Product> {
  const products = await stripe.products.search({ query: "name:'NON-QM Nexus Membership'" });
  const existing = products.data.find((product) => product.active);
  if (existing) return existing;
  if (!apply) return { id: "prod_dry_run" } as Stripe.Product;
  return stripe.products.create({ name: "NON-QM Nexus Membership" });
}

async function syncPlan(product: Stripe.Product, plan: Plan): Promise<string | null> {
  const found = await stripe.prices.list({ lookup_keys: [plan.stripeLookupKey], active: true, limit: 10 });
  const current = found.data[0] ?? null;
  if (current?.unit_amount === plan.amountCents && current.recurring?.interval === "month") {
    console.log(`${plan.id}: current price already matches.`);
    return current.id;
  }
  console.log(`${plan.id}: ${current ? "replace mismatched catalog price" : "create catalog price"}.`);
  if (!apply) return null;
  const created = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: plan.amountCents,
    recurring: { interval: "month" },
    lookup_key: plan.stripeLookupKey,
    transfer_lookup_key: true,
    metadata: { plan_id: plan.id, pricing_version: "v2" },
  });
  if (current && current.id !== created.id) await stripe.prices.update(current.id, { active: false });
  return created.id;
}

async function persist(monthlyPriceId: string, commitmentPriceId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service environment is required for --apply.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: catalog, error } = await db
    .from("membership_plans")
    .select("id")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1)
    .single();
  if (error || !catalog) throw new Error("Active membership catalog row was not found.");
  const { error: updateError } = await db.from("membership_plans").update({
    monthly_price_cents: PLANS.monthly.amountCents,
    amount_cents: PLANS.monthly.amountCents,
    billing_mode: PLANS.monthly.billingMode,
    term_months: PLANS.monthly.termMonths,
    rolls_to_plan_key: null,
    cancellable_mid_term: true,
    stripe_lookup_key: PLANS.monthly.stripeLookupKey,
    stripe_price_id: monthlyPriceId,
    stripe_commitment_price_id: commitmentPriceId,
  }).eq("id", catalog.id);
  if (updateError) throw new Error("Failed to persist Stripe catalog ids.");
}

async function main() {
  console.log(apply ? "APPLY mode" : "DRY RUN: no Stripe or database writes");
  const product = await resolveProduct();
  const monthly = await syncPlan(product, PLANS.monthly);
  const commitment = await syncPlan(product, PLANS.commit_4mo);
  if (apply) {
    if (!monthly || !commitment) throw new Error("Price synchronization did not return both ids.");
    await persist(monthly, commitment);
    console.log("Pricing v2 catalog synchronized.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stripe sync failed.");
  process.exit(1);
});
