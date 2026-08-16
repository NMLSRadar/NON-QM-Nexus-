// Billing & Retention analytics (2026-08-16, docs/billing-runbook.md) —
// the data layer behind the admin Billing & Retention dashboard.
//
// All queries run through the service-role client (platform-admin page only).
// Retention definitions (tethered to docs/billing-runbook.md §retention):
//   - A member "starts" at user_subscriptions.started_at.
//   - "Cancel requested" = cancel_requested_at (cancel at period end) — the
//     voluntary-churn intent signal, distinct from actual churn.
//   - "Canceled" (churned) = canceled_at — access actually ended.
//   - Monthly retention rate = members active at month start who are STILL
//     active at month end / members active at month start.
//   - Monthly churn rate = 1 - retention rate.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RetentionPoint {
  month: string; // "YYYY-MM"
  activeAtStart: number;
  newMembers: number;
  cancelRequested: number;
  canceled: number;
  churnRate: number; // 0-1
  retentionRate: number; // 0-1
}

export interface DunningRow {
  subscriptionId: string;
  userId: string;
  email: string;
  displayName: string | null;
  planName: string | null;
  stripeStatus: string | null;
  declineCount: number;
  lastPaymentFailedAt: string | null;
  nextPaymentAttemptAt: string | null;
  lastDunningEmailSentAt: string | null;
  dunningEmailCount: number;
  currentMonthlyPriceCents: number | null;
}

export interface BillingOverview {
  totalMembers: number;
  activeMembers: number;
  activeStripe: number;
  mrrCents: number;
  inDunning: number;
  cancelRequestedNow: number;
  recentFailures7d: number;
  recentFailures30d: number;
  failuresByReason: Array<{ reason: string; count: number }>;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  source: string | null;
  stripe_status: string | null;
  started_at: string;
  canceled_at: string | null;
  cancel_requested_at: string | null;
  cancel_at_period_end: boolean;
  decline_count: number | null;
  last_payment_failed_at: string | null;
  next_payment_attempt_at: string | null;
  last_dunning_email_sent_at: string | null;
  dunning_email_count: number | null;
  current_monthly_price_cents: number | null;
  plan?: { name?: string | null; monthly_price_cents?: number | null } | { name?: string | null; monthly_price_cents?: number | null }[];
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Loads every personal subscription row with the fields the dashboard
 * needs. Admin-only; deliberately simple (a few thousand rows at most). */
async function loadSubscriptions(supabase: SupabaseClient): Promise<SubscriptionRow[]> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select(
      "id, user_id, plan_id, source, stripe_status, started_at, canceled_at, cancel_requested_at, cancel_at_period_end, decline_count, last_payment_failed_at, next_payment_attempt_at, last_dunning_email_sent_at, dunning_email_count, current_monthly_price_cents, plan:membership_plans(name, monthly_price_cents)"
    );
  if (error) throw new Error(`Failed to load subscriptions: ${error.message}`);
  return (data ?? []) as SubscriptionRow[];
}

function planOf(s: SubscriptionRow): { name?: string | null; monthly_price_cents?: number | null } | null {
  if (!s.plan) return null;
  return Array.isArray(s.plan) ? s.plan[0] ?? null : s.plan;
}

function isActive(s: SubscriptionRow, nowMs: number): boolean {
  if (s.canceled_at) return false;
  // Trial rows resolve to inactive once expired.
  return true;
}

export async function getBillingOverview(supabase: SupabaseClient): Promise<BillingOverview> {
  const subs = await loadSubscriptions(supabase);

  const now = Date.now();
  let activeMembers = 0;
  let activeStripe = 0;
  let mrrCents = 0;
  let inDunning = 0;
  let cancelRequestedNow = 0;
  let recentFailures7d = 0;
  let recentFailures30d = 0;

  for (const s of subs) {
    const active = isActive(s, now);
    if (active) activeMembers++;
    if (active && s.source === "stripe" && s.stripe_status === "active") activeStripe++;

    // MRR: current billed price (webhook truth) or the plan's monthly
    // price; comped rows contribute 0.
    if (active && s.source === "stripe") {
      const price = s.current_monthly_price_cents ?? planOf(s)?.monthly_price_cents ?? 0;
      mrrCents += price;
    }

    if (active && (s.stripe_status === "past_due" || s.stripe_status === "unpaid" || s.stripe_status === "incomplete")) {
      inDunning++;
    }
    if (active && s.cancel_requested_at) cancelRequestedNow++;

    if (s.last_payment_failed_at) {
      const t = new Date(s.last_payment_failed_at).getTime();
      if (now - t <= 7 * 86400000) recentFailures7d++;
      if (now - t <= 30 * 86400000) recentFailures30d++;
    }
  }

  // Failures by reason over the last 30 days from the event trail.
  const { data: events, error: eventsError } = await supabase
    .from("billing_payment_events")
    .select("failure_code")
    .eq("event_type", "payment_failed")
    .gte("created_at", new Date(now - 30 * 86400000).toISOString());
  if (eventsError) throw new Error(`Failed to load billing events: ${eventsError.message}`);
  const reasonCounts = new Map<string, number>();
  for (const e of events ?? []) {
    const code = (e.failure_code as string | null) ?? "unknown";
    reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
  }

  return {
    totalMembers: subs.length,
    activeMembers,
    activeStripe,
    mrrCents,
    inDunning,
    cancelRequestedNow,
    recentFailures7d,
    recentFailures30d,
    failuresByReason: Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function getDunningQueue(supabase: SupabaseClient): Promise<DunningRow[]> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select(
      "stripe_subscription_id, user_id, stripe_status, decline_count, last_payment_failed_at, next_payment_attempt_at, last_dunning_email_sent_at, dunning_email_count, current_monthly_price_cents, plan:membership_plans(name), user:users!inner(email, profile:user_profiles(display_name))"
    )
    .eq("canceled_at", null)
    .in("stripe_status", ["past_due", "unpaid", "incomplete", "incomplete_expired"])
    .order("last_payment_failed_at", { ascending: false });
  if (error) throw new Error(`Failed to load dunning queue: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    subscriptionId: (r.stripe_subscription_id as string) ?? "",
    userId: (r.user_id as string) ?? "",
    email: (((r.user as { email?: string })?.email) as string) ?? "unknown",
    displayName: ((r.user as { profile?: { display_name?: string | null } })?.profile?.display_name as string | null) ?? null,
    planName: ((r.plan as { name?: string | null } | null)?.name as string | null) ?? null,
    stripeStatus: (r.stripe_status as string | null) ?? null,
    declineCount: (r.decline_count as number | null) ?? 0,
    lastPaymentFailedAt: (r.last_payment_failed_at as string | null) ?? null,
    nextPaymentAttemptAt: (r.next_payment_attempt_at as string | null) ?? null,
    lastDunningEmailSentAt: (r.last_dunning_email_sent_at as string | null) ?? null,
    dunningEmailCount: (r.dunning_email_count as number | null) ?? 0,
    currentMonthlyPriceCents: (r.current_monthly_price_cents as number | null) ?? null,
  }));
}

export async function getRecentCancellations(supabase: SupabaseClient, limit = 25) {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select(
      "started_at, canceled_at, cancel_requested_at, plan:membership_plans(name, monthly_price_cents), user:users(email)"
    )
    .not("canceled_at", "is", null)
    .order("canceled_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load cancellations: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => {
    const plan = (Array.isArray(r.plan) ? r.plan[0] : r.plan) as
      | { name?: string | null; monthly_price_cents?: number | null }
      | null;
    const user = Array.isArray(r.users) ? r.users[0] : r.users;
    const startedAt = r.started_at as string | null;
    const canceledAt = r.canceled_at as string | null;
    return {
      email: ((user as { email?: string } | null)?.email as string | null) ?? "unknown",
      planName: plan?.name ?? null,
      monthlyPriceCents: plan?.monthly_price_cents ?? null,
      startedAt,
      canceledAt,
      cancelRequestedAt: r.cancel_requested_at as string | null,
      tenureDays:
        startedAt && canceledAt
          ? Math.max(0, Math.round((new Date(canceledAt).getTime() - new Date(startedAt).getTime()) / 86400000))
          : null,
    };
  });
}

/** Monthly retention series for the last N months — computed from the
 * subscription rows themselves (the webhook-maintained start / cancel
 * dates), so it's correct even before the event trail has history. */
export async function getRetentionSeries(supabase: SupabaseClient, monthsCount = 12): Promise<RetentionPoint[]> {
  const subs = await loadSubscriptions(supabase);

  const now = new Date();
  const series: RetentionPoint[] = [];

  const countActiveAtStart = (monthStartMs: number): number =>
    subs.filter((s) => {
      const startMs = new Date(s.started_at).getTime();
      const cancelMs = s.canceled_at ? new Date(s.canceled_at).getTime() : Infinity;
      return startMs <= monthStartMs && cancelMs >= monthStartMs;
    }).length;

  for (let i = monthsCount - 1; i >= 0; i--) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const monthStartMs = monthStart.getTime();
    const nextMonthMs = nextMonth.getTime();

    const activeAtStart = countActiveAtStart(monthStartMs);
    let newMembers = 0;
    let cancelRequested = 0;
    let canceled = 0;

    for (const s of subs) {
      const startMs = new Date(s.started_at).getTime();
      if (startMs >= monthStartMs && startMs < nextMonthMs) newMembers++;

      const reqMs = s.cancel_requested_at ? new Date(s.cancel_requested_at).getTime() : null;
      if (reqMs && reqMs >= monthStartMs && reqMs < nextMonthMs) cancelRequested++;

      const cancelMs = s.canceled_at ? new Date(s.canceled_at).getTime() : null;
      if (cancelMs && cancelMs >= monthStartMs && cancelMs < nextMonthMs) canceled++;
    }

    const stillActive = countActiveAtStart(nextMonthMs);
    const retentionRate = activeAtStart > 0 ? Math.max(0, Math.min(1, stillActive / activeAtStart)) : 1;
    const churnRate = activeAtStart > 0 ? Math.max(0, 1 - retentionRate) : 0;

    series.push({
      month: monthKey(monthStart),
      activeAtStart,
      newMembers,
      cancelRequested,
      canceled,
      churnRate,
      retentionRate,
    });
  }
  return series;
}

/** Recent event-trail rows (declines + recoveries) for the dashboard's
 * "recent payment activity" table. */
export async function getRecentBillingEvents(supabase: SupabaseClient, limit = 30) {
  const { data, error } = await supabase
    .from("billing_payment_events")
    .select("event_type, amount_cents, attempt_number, failure_code, failure_message, created_at, next_retry_at, user:users(email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load billing events: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    eventType: r.event_type as string,
    amountCents: r.amount_cents as number | null,
    attemptNumber: r.attempt_number as number | null,
    failureCode: r.failure_code as string | null,
    failureMessage: r.failure_message as string | null,
    createdAt: r.created_at as string,
    nextRetryAt: r.next_retry_at as string | null,
    email: ((r.user as { email?: string } | null)?.email as string | null) ?? null,
  }));
}