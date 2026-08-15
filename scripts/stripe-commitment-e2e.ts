/**
 * End-to-end regression test for the 3-Month Commitment billing
 * (2026-08-15). Drives the REAL production helpers from
 * src/lib/billing/commitment.ts against a Stripe TEST clock:
 *
 *   1. enrollment (Checkout-style $120 subscription -> schedule)
 *   2. $120 renewals for cycles 2 & 3
 *   3. automatic $150 transition at cycle 4 (same subscription id)
 *   4. graceful cancel (schedule trim) keeps access to period end
 *   5. resume restores the remaining commitment shape
 *
 * Also asserts the pure date math (commitmentMonthOf).
 *
 * Usage: npx tsx scripts/stripe-commitment-e2e.ts   (needs .env.local with
 * a TEST Stripe key — never run this against a live key; the script also
 * refuses to run if the key is live).
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import Stripe from "stripe";
import {
  createCommitmentScheduleFromSubscription,
  gracefullyCancelSchedule,
  resumeCommitmentSchedule,
  commitmentMonthOf,
} from "../src/lib/billing/commitment";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (key.startsWith("sk_live")) {
  console.error("REFUSING to run this E2E against a LIVE Stripe key.");
  process.exit(2);
}
const stripe = new Stripe(key);
const MONTH = 32 * 86400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures: string[] = [];
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`, detail ?? "");
  }
}

async function advance(clock: Stripe.TestHelpers.TestClock, seconds: number) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: clock.frozen_time + seconds });
      clock.frozen_time += seconds;
      return;
    } catch (err) {
      if ((err as { message?: string }).message?.includes("advancement underway") || (err as { statusCode?: number }).statusCode === 429) {
        await sleep(20000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("test clock advance kept failing");
}

async function findPrices() {
  const prices = await stripe.prices.list({ limit: 100, active: true });
  const p120 = prices.data.find((p) => p.unit_amount === 12000 && p.recurring?.interval === "month");
  const p150 = prices.data.find((p) => p.unit_amount === 15000 && p.recurring?.interval === "month");
  if (!p120 || !p150) throw new Error("$120 or $150 monthly price not found — run scripts/stripe-commitment-setup.js first.");
  return { p120: p120.id, p150: p150.id };
}

async function subAmounts(custId: string) {
  const subs = await stripe.subscriptions.list({ customer: custId, limit: 5 });
  return subs.data.map((s) => ({ id: s.id, status: s.status, schedule: s.schedule ?? null, amount: s.items.data[0]?.price?.unit_amount ?? null }));
}

async function withQuiet(fn: () => Promise<unknown>, what: string) {
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const m = (err as { message?: string }).message ?? "";
      if (m.includes("advancement underway") || (err as { statusCode?: number }).statusCode === 429) {
        await sleep(15000);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${what} kept hitting clock contention`);
}

async function main() {
  const { p120, p150 } = await findPrices();
  const now = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: now });
  const suffix = Date.now().toString().slice(-6);
  console.log(`\nTest clock ${clock.id} — enrollment ${new Date(now * 1000).toISOString().slice(0, 10)}\n`);

  const cust = await stripe.customers.create({ email: `commitment-e2e-${suffix}@example.com`, test_clock: clock.id });
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: cust.id });
  await stripe.customers.update(cust.id, { invoice_settings: { default_payment_method: pm.id } });

  // ---- 1. enrollment: Checkout-style subscription + production helper ----
  const sub = await stripe.subscriptions.create({
    customer: cust.id,
    items: [{ price: p120, quantity: 1 }],
    metadata: { supabase_user_id: "e2e-user", membership_kind: "commitment" },
  });
  const invoice1 = (await stripe.invoices.list({ customer: cust.id, limit: 1 })).data[0] ?? null;
  check("month 1 invoiced $120", invoice1?.amount_due === 12000);

  const sched = await createCommitmentScheduleFromSubscription(stripe, sub.id, p120, p150);
  check("schedule created with 2 phases", sched.phases.length === 2);
  const phase1 = sched.phases[0]!;
  const phase2 = sched.phases[1]!;
  check("phase 1 is $120 for 3 months", phase1.items[0]?.price === p120);
  const phase1End = phase1.end_date ? new Date(phase1.end_date * 1000) : null;
  const phase2Start = phase2.start_date ? new Date(phase2.start_date * 1000) : null;
  check("phase 1 end == phase 2 start ($150 begin date)", Boolean(phase1End && phase2Start && phase1End.getTime() === phase2Start.getTime()));
  // Stripe materializes a provisional 30-day end_date on the open-ended
  // final phase at creation; what matters is the price and that the
  // transition keeps recurring (verified below by cycles 5+ continuing).
  check("phase 2 is $150", phase2.items[0]?.price === p150);

  const subsAfter = await subAmounts(cust.id);
  check("same subscription id, no duplicates", subsAfter.length === 1 && subsAfter[0]?.id === sub.id && subsAfter[0]?.schedule === sched.id);

  // ---- 2 & 3: renewals and auto transition ----
  const expected = [12000, 12000, 12000, 15000, 15000];
  for (let i = 0; i < expected.length; i++) {
    await advance(clock, MONTH);
    const invs = await stripe.invoices.list({ customer: cust.id, limit: 1 });
    const latest = invs.data[0] ?? null;
    check(`cycle ${i + 2} invoice $${(expected[i] ?? 0) / 100} (${i === 3 ? "transition to $150" : i === 4 ? "stays $150" : "commitment $120"})`, latest?.amount_due === expected[i], `${latest?.amount_due ?? "none"}`);
    const subs = await subAmounts(cust.id);
    if (i === 3) {
      check("transition happened automatically on the SAME subscription", subs.length === 1 && subs[0]?.id === sub.id && subs[0]?.status === "active" && subs[0]?.amount === 15000, subs);
    }
    if (i === 4) {
      check("continues $150 month-to-month", Boolean(subs[0]?.amount === 15000 && subs[0]?.status === "active"));
    }
  }

  // ---- 4. graceful cancel (schedule trim) ----
  await sleep(30000); // let the last clock advance settle before modifying
  const subNow = await stripe.subscriptions.retrieve(sub.id);
  const schedCanceled = (await withQuiet(
    () => gracefullyCancelSchedule(stripe, sched.id, subNow),
    "graceful cancel"
  )) as Stripe.SubscriptionSchedule;
  check("graceful cancel: schedule trimmed to current phase + end_behavior cancel", schedCanceled.end_behavior === "cancel" && schedCanceled.phases.length === 1);
  const subAfterCancel = await stripe.subscriptions.retrieve(sub.id);
  check("graceful cancel: subscription still active (access through paid period)", subAfterCancel.status === "active");
  check("graceful cancel: cancel_at set to current period end", subAfterCancel.cancel_at === (subNow.items.data[0]?.current_period_end ?? null));

  // ---- 5. resume restores the $150 phase ----
  const schedResumed = (await withQuiet(
    () =>
      resumeCommitmentSchedule({
        stripe,
        scheduleId: sched.id,
        subscription: subAfterCancel,
        commitmentPriceId: p120,
        standardPriceId: p150,
        commitmentEnd: new Date(phase1End!.getTime()).toISOString(),
      }),
    "resume"
  )) as Stripe.SubscriptionSchedule;
  check("resume: schedule has both phases again with $150 future", Boolean(schedResumed.phases.length === 2 && schedResumed.phases[1]?.items[0]?.price === p150 && schedResumed.end_behavior === "release"));

  // ---- pure math sanity ----
  check("commitmentMonthOf: month 1", commitmentMonthOf("2026-08-15T00:00:00Z", "2026-11-15T00:00:00Z", new Date("2026-08-20T00:00:00Z")) === 1);
  check("commitmentMonthOf: month 2", commitmentMonthOf("2026-08-15T00:00:00Z", "2026-11-15T00:00:00Z", new Date("2026-09-20T00:00:00Z")) === 2);
  check("commitmentMonthOf: month 3", commitmentMonthOf("2026-08-15T00:00:00Z", "2026-11-15T00:00:00Z", new Date("2026-10-20T00:00:00Z")) === 3);
  check("commitmentMonthOf: null after end", commitmentMonthOf("2026-08-15T00:00:00Z", "2026-11-15T00:00:00Z", new Date("2026-12-01T00:00:00Z")) === null);
  check("commitmentMonthOf: null without dates", commitmentMonthOf(null, null) === null);

  console.log(`\n${failures.length === 0 ? "ALL E2E CHECKS PASSED" : `${failures.length} CHECK(S) FAILED`} — clock ${clock.id}`);
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});