/**
 * Reconciliation for commitment memberships (2026-08-15).
 *
 * Rewrites user_subscriptions projection fields from the AUTHORITATIVE
 * Stripe objects (subscription + subscription schedule): status, period
 * end, current price, commitment dates, membership kind, schedule id,
 * cancel_at. This is the tool for the "database and Stripe disagree"
 * edge case — it never invents state, it only re-copies from Stripe.
 *
 * Personal subscriptions only (team/AE/bulk rows untouched). Rows that
 * are metadata-marked commitment but have NO Stripe schedule yet are
 * healed by creating the schedule (same idempotent guard as the webhook:
 * only when the Stripe subscription has no schedule attached).
 *
 * Usage: npx tsx scripts/stripe-reconcile-commitments.ts   (needs .env.local)
 * Requires STRIPE_SECRET_KEY + DATABASE_URL in .env.local.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import Stripe from "stripe";
// pg has no bundled types; tsx executes it fine at runtime.
const { Client } = require("pg") as { Client: new (cfg: unknown) => { connect(): Promise<void>; query(q: string, vals?: unknown[]): Promise<{ rows: any[]; rowCount: number }>; end(): Promise<void> } };
import {
  createCommitmentScheduleFromSubscription,
  MEMBERSHIP_KIND_METADATA_KEY,
} from "../src/lib/billing/commitment";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function sqlDate(epochSeconds: number | null | undefined): string | null {
  return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;
}

async function main() {
  await db.connect();
  console.log("=== Commitment reconciliation ===");

  // plans: price id -> commitment/standard price
  const { rows: plans } = await db.query(
    `select id, stripe_price_id as standard_price_id, stripe_commitment_price_id from membership_plans`
  );
  const standardByPlan = new Map(plans.map((p) => [p.id, p.standard_price_id]));
  const commitmentByPlan = new Map(plans.map((p) => [p.id, p.stripe_commitment_price_id]));

  const { rows: subs } = await db.query(
    `select user_id, plan_id, stripe_subscription_id, stripe_subscription_schedule_id, membership_kind
       from user_subscriptions
      where source = 'stripe' and stripe_subscription_id is not null`
  );
  console.log(`Found ${subs.length} personal Stripe subscription row(s).`);

  for (const row of subs) {
    const subId = row.stripe_subscription_id as string;
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
    } catch (err) {
      console.log(`  [skip] ${subId}: ${err instanceof Error ? err.message : "unknown"}`);
      continue;
    }

    const commitmentPriceId = (row.plan_id ? commitmentByPlan.get(row.plan_id) : null) ?? null;
    const standardPriceId = (row.plan_id ? standardByPlan.get(row.plan_id) : null) ?? null;

    // Heal missing schedules for commitment-marked subs.
    let scheduleId: string | null =
      typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id ?? null;
    if (!scheduleId && sub.metadata?.[MEMBERSHIP_KIND_METADATA_KEY] === "commitment") {
      if (!commitmentPriceId || !standardPriceId) {
        console.log(`  [warn] ${subId}: commitment needs schedule but plan prices missing — manual fix required.`);
        continue;
      }
      try {
        const sched = await createCommitmentScheduleFromSubscription(stripe, subId, commitmentPriceId, standardPriceId);
        scheduleId = sched.id;
        console.log(`  [heal] ${subId}: created schedule ${sched.id}`);
      } catch (err) {
        console.log(`  [warn] ${subId}: schedule creation failed (${err instanceof Error ? err.message : "unknown"}) — skipped heal.`);
      }
    }

    let schedule: Stripe.SubscriptionSchedule | null = null;
    if (scheduleId) {
      try {
        schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
      } catch {
        schedule = null;
      }
    }

    const priceId = sub.items.data[0]?.price?.id ?? null;
    const kind =
      sub.metadata?.[MEMBERSHIP_KIND_METADATA_KEY] === "commitment"
        ? commitmentPriceId && priceId === commitmentPriceId
          ? "commitment"
          : "commitment_completed"
        : "standard";

    const phase1 = schedule?.phases?.[0];
    const phase2 = schedule?.phases?.[1];

    const { rowCount } = await db.query(
      `update user_subscriptions set
         membership_kind = $1,
         stripe_subscription_schedule_id = $2,
         stripe_status = $3,
         current_period_end = $4,
         current_monthly_price_cents = $5,
         commitment_start_date = $6,
         commitment_end_date = $7,
         standard_rate_start_date = $8,
         cancel_at = $9,
         cancel_at_period_end = $10
       where user_id = $11`,
      [
        kind,
        scheduleId,
        sub.status,
        sqlDate(sub.items.data[0]?.current_period_end),
        sub.items.data[0]?.price?.unit_amount ?? null,
        sqlDate(phase1?.start_date),
        sqlDate(phase1?.end_date),
        sqlDate(phase2?.start_date ?? phase1?.end_date),
        sqlDate(sub.cancel_at ?? null),
        sub.cancel_at_period_end,
        row.user_id,
      ]
    );
    console.log(`  [ok] ${subId}: kind=${kind} status=${sub.status} price=${sub.items.data[0]?.price?.unit_amount ?? "?"} schedule=${scheduleId ?? "none"} (${rowCount} row)`);
  }

  await db.end();
  console.log("\nDone. Stripe remains the source of truth; the DB projection now mirrors it.");
}


main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});