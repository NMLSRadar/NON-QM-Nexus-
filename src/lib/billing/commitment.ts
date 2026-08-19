/**
 * Pricing v2 commitment schedule logic.
 *
 * Checkout creates a normal monthly subscription at the commitment price.
 * The webhook promotes it to a two-phase Subscription Schedule:
 *
 *   Phase 1 — four monthly commitment-price cycles. The Checkout payment is
 *             cycle one, followed by three additional monthly invoices.
 *   Phase 2 — the standard monthly price, open-ended.
 *
 * Existing schedules are never rebuilt merely because the catalog changes;
 * legacy subscriptions keep their original Stripe prices and phase dates.
 */
import type Stripe from "stripe";
import { PLANS } from "@/config/pricing";

export const COMMITMENT_MONTHS = PLANS.commit_4mo.termMonths;
export const COMMITMENT_MONTHLY_CENTS = PLANS.commit_4mo.amountCents;
export const STANDARD_MONTHLY_CENTS = PLANS.monthly.amountCents;

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
 * The two phases for a commitment schedule, anchored at the
 * schedule's existing first-phase start (the billing period the Checkout
 * subscription was created in). Phase 1 lasts `commitmentMonths`
 * iterations of the the commitment price price; phase 2 is the the monthly price price, open-ended
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
 *  - actual the commitment price price active  => still inside the commitment
 *  - the monthly price price active but sub was enrolled as a commitment
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
  subscription: Stripe.Subscription,
  preserveCommitment: boolean = true
): Promise<Stripe.SubscriptionSchedule> {
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const currentPhase = schedule.current_phase;
  const configuredPhase = schedule.phases.find(
    (phase) => currentPhase && phase.start_date === currentPhase.start_date
  ) ?? schedule.phases[0];
  if (!configuredPhase) throw new Error("Schedule has no current phase — cannot schedule cancellation.");

  const activePriceId = subscription.items.data[0]?.price?.id;
  const commitmentIsActive = activePriceId != null && activePriceId === configuredPhase.items[0]?.price;
  const commitmentBoundary = configuredPhase.end_date;

  if (preserveCommitment && commitmentIsActive && commitmentBoundary) {
    // Preserve the entire four-payment phase. Removing only the rollover phase
    // stops month-five renewal without forgiving any committed $50 invoice.
    return stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: "cancel",
      phases: [
        {
          items: [{ price: activePriceId, quantity: 1 }],
          start_date: configuredPhase.start_date,
          end_date: commitmentBoundary,
        },
      ],
    });
  }

  const periodEnd = currentPeriodEndOf(subscription);
  if (!activePriceId || !periodEnd) throw new Error("Subscription billing boundary is unavailable.");
  return stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "cancel",
    phases: [{ items: [{ price: activePriceId, quantity: 1 }], start_date: configuredPhase.start_date, end_date: periodEnd }],
  });
}

/**
 * Resume after a graceful cancel (schedule trimmed with end_behavior
 * cancel): restores the two-phase commitment shape anchored at the
 * schedule's own (unchanged) current-phase start. If the commitment
 * period already ended by the time of resume, the member simply goes
 * straight to the standard the monthly price/month phase.
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