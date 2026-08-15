/**
 * 3-Month Commitment membership — shared billing logic (2026-08-15).
 *
 * Stripe architecture: the commitment is a NORMAL monthly subscription
 * created through Checkout at the $120 price, which is then handed over
 * to a Subscription Schedule (from_subscription) that enforces the
 * pricing shape SERVER-SIDE:
 *
 *   Phase 1 — $120/month × 3 billing cycles (starting at the cycle the
 *             subscription was created; the cycle already paid by
 *             Checkout counts as cycle 1)
 *   Phase 2 — $150/month, open-ended, from billing cycle 4
 *
 * The schedule keeps the SAME subscription id (proven on Stripe test
 * mode, 2026-08-15): no duplicate subscription, no re-checkout, no new
 * payment authorization, no gap in access at the phase boundary —
 * Stripe invoices $120 exactly three times, then $150 automatically.
 *
 * Everything in this module is pure logic / thin Stripe calls so it can
 * be exercised by both the webhook and node-based integration tests
 * (no "server-only" import — same convention as src/lib/stripe.ts).
 */
import type Stripe from "stripe";

export const COMMITMENT_MONTHS = 3;
export const COMMITMENT_MONTHLY_CENTS = 12000; // $120 intro rate
export const STANDARD_MONTHLY_CENTS = 15000; // $150 standard rate

/** metadata key on Checkout Sessions + subscriptions marking the membership kind. */
export const MEMBERSHIP_KIND_METADATA_KEY = "membership_kind";

export type MembershipKind = "standard" | "commitment" | "commitment_completed";

export const KIND_STANDARD: MembershipKind = "standard";
export const KIND_COMMITMENT: MembershipKind = "commitment";
export const KIND_COMMITMENT_COMPLETED: MembershipKind = "commitment_completed";

/** ~30.44-day month — used ONLY for display math (Month 2 of 3 / dates). */
const AVG_MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;

export function isCommitmentKind(kind: string | null | undefined): boolean {
  return kind === KIND_COMMITMENT || kind === KIND_COMMITMENT_COMPLETED;
}

/**
 * The two phases for a 3-month commitment schedule, anchored at the
 * schedule's existing first-phase start (the billing period the Checkout
 * subscription was created in). Phase 1 lasts `commitmentMonths`
 * iterations of the $120 price; phase 2 is the $150 price, open-ended
 * (no end_date => continues until canceled). `duration` is used rather
 * than `iterations` because phase `iterations` is only settable at
 * SCHEDULE CREATE, not UPDATE (Stripe API, verified 2026-08-15).
 */
export function buildCommitmentPhases(
  baseStartDate: number,
  commitmentPriceId: string,
  standardPriceId: string,
  commitmentMonths: number = COMMITMENT_MONTHS
): Stripe.SubscriptionScheduleUpdateParams.Phase[] {
  return [
    {
      items: [{ price: commitmentPriceId, quantity: 1 }],
      start_date: baseStartDate,
      duration: { interval: "month", interval_count: commitmentMonths },
    },
    {
      items: [{ price: standardPriceId, quantity: 1 }],
    },
  ];
}

/**
 * Converts a just-created Checkout subscription into a schedule-managed
 * commitment. Two API calls (create from_subscription, then update with
 * the phases) because from_subscription cannot carry arbitrary phases in
 * the same request (Stripe API, verified 2026-08-15).
 *
 * Returns the schedule. Idempotency is the CALLER's job (only call when
 * the subscription does not already have a schedule attached, and never
 * create twice for the same subscription).
 */
export async function createCommitmentScheduleFromSubscription(
  stripe: Stripe,
  subscriptionId: string,
  commitmentPriceId: string,
  standardPriceId: string
): Promise<Stripe.SubscriptionSchedule> {
  const base = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
  const basePhase = base.phases[0];
  if (!basePhase) {
    throw new Error(`Schedule ${base.id} has no phases — cannot attach commitment pricing.`);
  }
  return stripe.subscriptionSchedules.update(base.id, {
    // The base phase (from_subscription) is the subscription's CURRENT
    // billing period — its start_date is the anchor for phase 1.
    phases: buildCommitmentPhases(basePhase.start_date, commitmentPriceId, standardPriceId),
  });
}

/** The schedule-owned subscription's current period end (Unix seconds). */
export function currentPeriodEndOf(subscription: Stripe.Subscription): number | null {
  return subscription.items.data[0]?.current_period_end ?? null;
}

/**
 * Which commitment phase is currently billing on a NON-CANCELED
 * subscription, from Stripe price alone:
 *  - actual $120 price active  => still inside the commitment
 *  - $150 price active but sub was enrolled as a commitment
 *    (membership_kind=commitment metadata) => commitment completed,
 *    running month-to-month at the standard rate on the same sub.
 */
export function kindFromPrice({
  membershipKindMetadata,
  priceId,
  commitmentPriceId,
}: {
  membershipKindMetadata: string | null | undefined;
  priceId: string | undefined;
  commitmentPriceId: string | null | undefined;
}): MembershipKind {
  if (membershipKindMetadata !== KIND_COMMITMENT) return KIND_STANDARD;
  if (commitmentPriceId && priceId === commitmentPriceId) return KIND_COMMITMENT;
  return KIND_COMMITMENT_COMPLETED;
}

/**
 * Display "Month X of 3" for a member inside the commitment, computed
 * server-side from Stripe-sourced dates (never client timers):
 *   1 + floor((now - commitmentStart) / ~1 month), clamped to 1..3.
 * Returns null when the dates aren't there yet or the commitment ended.
 */
export function commitmentMonthOf(
  commitmentStart: string | null | undefined,
  commitmentEnd: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!commitmentStart || !commitmentEnd) return null;
  const start = new Date(commitmentStart).getTime();
  const end = new Date(commitmentEnd).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || now.getTime() >= end) return null;
  const elapsed = now.getTime() - start;
  if (elapsed < 0) return 1;
  return Math.min(COMMITMENT_MONTHS, Math.max(1, Math.floor(elapsed / AVG_MONTH_MS) + 1));
}

/**
 * Graceful cancellation for a schedule-managed (commitment) subscription —
 * Stripe rejects cancel_at_period_end on the subscription itself ("update
 * the schedule instead", verified 2026-08-15). The schedule is trimmed so
 * it ends at the CURRENT billing period's end (members keep access through
 * the period they've paid for — same policy as standard subscriptions)
 * and `end_behavior: cancel` makes Stripe set subscription.cancel_at to
 * that boundary (observed behavior in test mode).
 */
export async function gracefullyCancelSchedule(
  stripe: Stripe,
  scheduleId: string,
  subscription: Stripe.Subscription
): Promise<Stripe.SubscriptionSchedule> {
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const currentPhase = schedule.phases[0];
  if (!currentPhase) throw new Error("Schedule has no current phase — cannot schedule cancellation.");
  const itemPrice = currentPhase.items[0]?.price;
  const fallbackPriceId = typeof itemPrice === "string" ? itemPrice : (itemPrice as { id?: string } | undefined)?.id;
  const priceId = subscription.items.data[0]?.price?.id ?? fallbackPriceId;
  if (!priceId) throw new Error("No billable price found on the subscription/schedule.");
  const periodEnd = currentPeriodEndOf(subscription);
  if (!periodEnd) throw new Error("Subscription has no current period end — cannot schedule cancellation.");
  return stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "cancel",
    phases: [
      {
        items: [{ price: priceId, quantity: 1 }],
        start_date: currentPhase.start_date,
        end_date: periodEnd,
      },
    ],
  });
}

/**
 * Resume after a graceful cancel (schedule trimmed with end_behavior
 * cancel): restores the two-phase commitment shape anchored at the
 * schedule's own (unchanged) current-phase start. If the commitment
 * period already ended by the time of resume, the member simply goes
 * straight to the standard $150/month phase.
 */
export async function resumeCommitmentSchedule({
  stripe,
  scheduleId,
  subscription,
  commitmentPriceId,
  standardPriceId,
  commitmentEnd,
}: {
  stripe: Stripe;
  scheduleId: string;
  subscription: Stripe.Subscription;
  commitmentPriceId: string;
  standardPriceId: string;
  commitmentEnd: string | null;
}): Promise<Stripe.SubscriptionSchedule> {
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId).catch(() => null);
  if (!schedule || schedule.status === "released") {
    // The graceful cancel path releases the schedule (Stripe sets
    // subscription.cancel_at to the paid period's end and detaches the
    // schedule). The subscription is still active standalone, so resuming
    // means handing it back to a fresh schedule via from_subscription.
    return createCommitmentScheduleFromSubscription(stripe, subscription.id, commitmentPriceId, standardPriceId);
  }
  const currentPhase = schedule.phases[0];
  if (!currentPhase) throw new Error("Schedule has no phases — cannot resume.");
  const commitmentEndMs = commitmentEnd ? new Date(commitmentEnd).getTime() : 0;
  const now = Date.now();
  const stillInCommitment = commitmentEndMs > now;

  const phases = stillInCommitment
    ? buildCommitmentPhases(currentPhase.start_date, commitmentPriceId, standardPriceId)
    : [
        {
          items: [{ price: standardPriceId, quantity: 1 }],
          start_date: currentPhase.start_date,
        },
      ];

  return stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "release",
    phases,
  });
}