import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import {
  ANNUAL_PRICE_CENTS,
  ANNUAL_STRIPE_LOOKUP_KEY,
  PLANS,
  type Plan,
} from "../src/config/pricing";

const apply = process.argv.includes("--apply");
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is required.");
const stripe = new Stripe(stripeKey);

async function resolveProduct(): Promise<Stripe.Product> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find((product) =>
    ["NON-QM Nexus — Membership", "NON-QM Nexus Membership"].includes(product.name)
  );
  if (existing) return existing;
  if (!apply) return { id: "prod_dry_run" } as Stripe.Product;
  return stripe.products.create({ name: "NON-QM Nexus — Membership" });
}

async function syncRecurringPrice({
  product,
  id,
  amountCents,
  interval,
  lookupKey,
}: {
  product: Stripe.Product;
  id: string;
  amountCents: number;
  interval: "month" | "year";
  lookupKey: string;
}): Promise<string | null> {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 10 });
  const current = found.data[0] ?? null;
  if (current?.unit_amount === amountCents && current.recurring?.interval === interval) {
    console.log(`${id}: current price already matches.`);
    return current.id;
  }
  console.log(`${id}: ${current ? "replace mismatched catalog price" : "create catalog price"}.`);
  if (!apply) return null;
  const created = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: amountCents,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { plan_id: id, pricing_version: "v2" },
  });
  if (current && current.id !== created.id) await stripe.prices.update(current.id, { active: false });
  return created.id;
}

function syncPlan(product: Stripe.Product, plan: Plan): Promise<string | null> {
  return syncRecurringPrice({
    product,
    id: plan.id,
    amountCents: plan.amountCents,
    interval: "month",
    lookupKey: plan.stripeLookupKey,
  });
}

async function persist(monthlyPriceId: string, commitmentPriceId: string, annualPriceId: string) {
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
    annual_price_cents: ANNUAL_PRICE_CENTS,
    stripe_annual_price_id: annualPriceId,
    stripe_commitment_price_id: commitmentPriceId,
  }).eq("id", catalog.id);
  if (updateError) throw new Error("Failed to persist Stripe catalog ids.");
}

async function main() {
  console.log(apply ? "APPLY mode" : "DRY RUN: no Stripe or database writes");
  const product = await resolveProduct();
  const monthly = await syncPlan(product, PLANS.monthly);
  const commitment = await syncPlan(product, PLANS.commit_4mo);
  const annual = await syncRecurringPrice({
    product,
    id: "annual",
    amountCents: ANNUAL_PRICE_CENTS,
    interval: "year",
    lookupKey: ANNUAL_STRIPE_LOOKUP_KEY,
  });
  if (apply) {
    if (!monthly || !commitment || !annual) throw new Error("Price synchronization did not return all three ids.");
    await persist(monthly, commitment, annual);
    console.log("Pricing v2 catalog synchronized.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stripe sync failed.");
  process.exit(1);
});
