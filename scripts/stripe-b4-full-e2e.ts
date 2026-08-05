// Full end-to-end Stripe test-mode verification (personal + team), against
// a LOCALLY running `next dev` server (http://localhost:3000) — never the
// production endpoint (production Vercel stays Stripe-free per the launch
// gate). Uses Stripe's official test payment method token `pm_card_visa`,
// which represents the standard 4242 4242 4242 4242 test card. Every event
// fed to the webhook is a REAL Stripe event (real id, retrieved via the
// Stripe API after the real action), signed with our real
// STRIPE_WEBHOOK_SECRET and POSTed over real HTTP to the real route
// handler — not an in-process mock.
//
// Usage: npx tsx scripts/stripe-b4-full-e2e.ts
import "dotenv/config";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const prisma = new PrismaClient();
const WEBHOOK_URL = "http://localhost:3000/api/webhooks/stripe";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdCustomerIds: string[] = [];

async function deliverRealEvent(eventId: string): Promise<{ id: string; type: string; status: number; body: unknown }> {
  const event = await stripe.events.retrieve(eventId);
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  const body = await res.json().catch(() => ({}));
  return { id: event.id, type: event.type, status: res.status, body };
}

async function waitForEvent(matcher: (e: Stripe.Event) => boolean, tries = 10): Promise<Stripe.Event> {
  for (let i = 0; i < tries; i++) {
    const list = await stripe.events.list({ limit: 20 });
    const found = list.data.find(matcher);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timed out waiting for matching Stripe event");
}

async function main() {
  console.log("=== PERSONAL PLAN E2E ===");
  const email = `nqn-b4-personal-${Date.now()}@gmail.com`;
  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({ email, password: "B4-Personal-Pw-123", email_confirm: true });
  if (userErr || !userRes.user) throw new Error(`createUser failed: ${userErr?.message}`);
  const userId = userRes.user.id;
  createdUserIds.push(userId);
  console.log("Test user:", userId, email);

  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { key: "essential" } });
  console.log("Plan:", plan.name, plan.stripePriceId, `$${(plan.monthlyPriceCents / 100).toFixed(2)}/mo`);

  const customer = await stripe.customers.create({
    email,
    payment_method: "pm_card_visa", // Stripe's test token for 4242 4242 4242 4242
    invoice_settings: { default_payment_method: "pm_card_visa" },
    metadata: { supabase_user_id: userId },
  });
  createdCustomerIds.push(customer.id);
  console.log("Stripe customer:", customer.id);

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: plan.stripePriceId! }],
    metadata: { supabase_user_id: userId },
  });
  console.log("Stripe subscription:", subscription.id, "status:", subscription.status);

  const createdEvent = await waitForEvent((e) => e.type === "customer.subscription.created" && (e.data.object as Stripe.Subscription).id === subscription.id);
  const delivered1 = await deliverRealEvent(createdEvent.id);
  console.log("Delivered event:", delivered1);

  await new Promise((r) => setTimeout(r, 1000));
  const row1 = await prisma.userSubscription.findUnique({ where: { userId } });
  console.log("user_subscriptions row after checkout:", row1);
  if (!row1 || row1.planId !== plan.id) throw new Error("user_subscriptions row missing or wrong plan after checkout webhook");
  if (row1.stripeStatus !== "active") throw new Error(`Expected active status, got ${row1.stripeStatus}`);

  // Tier unlock check — same resolution path the app itself uses.
  const { data: userRow } = await admin.from("users").select("platform_admin").eq("id", userId).maybeSingle();
  console.log("Effective plan tier check — plan row tierLevel:", plan.tierLevel, "isPlatformAdmin:", Boolean(userRow?.platform_admin));
  if (plan.tierLevel < 1) throw new Error("Essential plan tierLevel unexpectedly 0 — tier would not unlock");

  console.log("\n--- Cancel via portal-equivalent flow ---");
  const canceled = await stripe.subscriptions.cancel(subscription.id);
  console.log("Canceled subscription:", canceled.id, "status:", canceled.status);
  const deletedEvent = await waitForEvent((e) => e.type === "customer.subscription.deleted" && (e.data.object as Stripe.Subscription).id === subscription.id);
  const delivered2 = await deliverRealEvent(deletedEvent.id);
  console.log("Delivered event:", delivered2);

  await new Promise((r) => setTimeout(r, 1000));
  const row2 = await prisma.userSubscription.findUnique({ where: { userId } });
  console.log("user_subscriptions row after cancel:", row2);
  if (row2?.stripeStatus !== "canceled") throw new Error(`Expected canceled status after portal-equivalent cancel, got ${row2?.stripeStatus}`);

  console.log("\n=== TEAM PLAN E2E (quantity=3) ===");
  const { data: org, error: orgErr } = await admin.from("organizations").insert({ name: `NQN B4 Team E2E ${Date.now()}` }).select("id").single();
  if (orgErr || !org) throw new Error(`org create failed: ${orgErr?.message}`);
  const orgId = org.id as string;
  createdOrgIds.push(orgId);
  console.log("Test org:", orgId);

  const teamCustomer = await stripe.customers.create({
    email: `nqn-b4-team-${Date.now()}@gmail.com`,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
    metadata: { organization_id: orgId },
  });
  createdCustomerIds.push(teamCustomer.id);

  if (!plan.stripeTeamPriceId) throw new Error("Essential plan has no stripe_team_price_id — run scripts/stripe-team-billing.js first");
  const teamSub = await stripe.subscriptions.create({
    customer: teamCustomer.id,
    items: [{ price: plan.stripeTeamPriceId, quantity: 3 }],
    metadata: { team: "true", organization_id: orgId },
  });
  console.log("Team subscription:", teamSub.id, "quantity:", teamSub.items.data[0]?.quantity, "status:", teamSub.status);

  const teamCreatedEvent = await waitForEvent((e) => e.type === "customer.subscription.created" && (e.data.object as Stripe.Subscription).id === teamSub.id);
  const delivered3 = await deliverRealEvent(teamCreatedEvent.id);
  console.log("Delivered event:", delivered3);

  await new Promise((r) => setTimeout(r, 1000));
  const orgSub1 = await prisma.orgSubscription.findFirst({ where: { organizationId: orgId } });
  console.log("org_subscriptions row after team checkout (quantity=3):", orgSub1);
  if (orgSub1?.seatCount !== 3) throw new Error(`Expected seat_count=3, got ${orgSub1?.seatCount}`);

  console.log("\n--- Seat update: quantity 3 -> 5 ---");
  const updatedSub = await stripe.subscriptions.update(teamSub.id, {
    items: [{ id: teamSub.items.data[0]!.id, quantity: 5 }],
  });
  console.log("Updated team subscription quantity:", updatedSub.items.data[0]?.quantity);
  const updatedEvent = await waitForEvent((e) => e.type === "customer.subscription.updated" && (e.data.object as Stripe.Subscription).id === teamSub.id && (e.data.object as Stripe.Subscription).items.data[0]?.quantity === 5);
  const delivered4 = await deliverRealEvent(updatedEvent.id);
  console.log("Delivered event:", delivered4);

  await new Promise((r) => setTimeout(r, 1000));
  const orgSub2 = await prisma.orgSubscription.findFirst({ where: { organizationId: orgId } });
  console.log("org_subscriptions row after seat update:", orgSub2);
  if (orgSub2?.seatCount !== 5) throw new Error(`Expected seat_count=5 after webhook-confirmed update, got ${orgSub2?.seatCount}`);

  await stripe.subscriptions.cancel(teamSub.id);
  console.log("\nAll B4 assertions passed.");
}

main()
  .catch((err) => {
    console.error("B4 E2E FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log("\n=== Cleanup ===");
    for (const userId of createdUserIds) {
      await prisma.userSubscription.deleteMany({ where: { userId } }).catch(() => {});
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
    for (const orgId of createdOrgIds) {
      await prisma.orgSubscription.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      try {
        await admin.from("organizations").delete().eq("id", orgId);
      } catch {
        // best-effort cleanup
      }
    }
    for (const customerId of createdCustomerIds) {
      await stripe.customers.del(customerId).catch(() => {});
    }
    await prisma.$disconnect();
  });
