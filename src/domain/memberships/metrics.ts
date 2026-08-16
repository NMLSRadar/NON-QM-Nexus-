// Membership metrics — task 04, docs/tasks/04-membership-management.md §5.
//
// Every function here is PURE: it takes plain arrays of membership rows /
// events / trial rows and returns numbers, so each can be unit-tested against
// hand-computed fixtures without a database. The admin UI builds these inputs
// from the membership_events / organization_memberships tables (via the
// service client) and passes them in.
//
// Money is integer cents throughout — there are NO floats in this module.
// Ratios are returned as plain numbers in 0..1 (retention, churn, conversion)
// or 0..N multiples (net revenue retention, LTV), and reported as a
// fraction-of-context rather than an unbounded percentage where the spec says
// so (denominator-aware honesty).

export type MembershipStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled_pending"
  | "cancelled"
  | "churned"
  | "trial_expired";

export interface MembershipRow {
  organizationId: string;
  status: MembershipStatus;
  planTier: string;
  mrrCents: number;
  trialStartedAt: string | null;
  convertedAt: string | null;
  churnedAt: string | null;
  churnType: "voluntary" | "involuntary" | null;
  churnReason: string | null;
  reactivationCount: number;
  attributionRepUserId: string | null; // null = unattributed
}

export interface TrialRow {
  organizationId: string;
  startedAt: string; // trial start
  convertedAt: string | null; // trial → paid
}

/** A month key in "YYYY-MM" local time. */
export function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function monthStart(month: string): Date {
  const [yy, mm] = month.split("-").map(Number);
  return new Date(yy ?? 1970, (mm ?? 1) - 1, 1);
}

function inMonth(d: Date, key: string): boolean {
  return monthKey(d) === key;
}

// ---------------------------------------------------------------------------
// Voluntary vs involuntary churn split for a month — reported as two distinct
// numbers (the spec's key distinction), never summed.
// ---------------------------------------------------------------------------
export function monthlyChurnSplit(
  memberships: MembershipRow[],
  month: string
): { voluntary: number; involuntary: number } {
  const inMo = (m: MembershipRow) => m.status === "churned" && m.churnedAt !== null && inMonth(new Date(m.churnedAt), month);
  const voluntary = memberships.filter((m) => inMo(m) && m.churnType === "voluntary").length;
  const involuntary = memberships.filter((m) => inMo(m) && m.churnType === "involuntary").length;
  return { voluntary, involuntary };
}

// ---------------------------------------------------------------------------
// Logo churn (monthly): churned_in_month ÷ active_at_month_start.
// active_at_month_start = memberships in status confirmed-if-active at the
// month's first acceptable boundary minus those created later that month
// (kept simple: any active OR trialing member whose first touch was before
// the month start is "active at start"). Trials that simply expire are
// EXCLUDED from both numerator (trial_expired is not churn) — the spec's key
// rule.
// ---------------------------------------------------------------------------
export function logoChurnRate(
  memberships: MembershipRow[],
  month: string // "YYYY-MM"
): { rate: number; churned: number; activeAtStart: number } {
  const start = monthStart(month);

  const activeAtStart = memberships.filter((m) => {
    if (m.status === "trial_expired" || m.status === "trialing") return false;
    const first = m.trialStartedAt ?? m.convertedAt;
    if (first && new Date(first).getTime() < start.getTime()) return true;
    // Rows without a trial/conversion timestamp: treat as active-at-start if
    // their churn (or current) status precedes the month.
    return m.churnedAt === null;
  }).length;

  const churned = memberships.filter((m) => {
    if (!m.churnedAt) return false;
    if (!inMonth(new Date(m.churnedAt), month)) return false;
    // Involuntary churn (failed card) DOES count here; trial_expired does not.
    return m.status === "churned";
  }).length;

  return { rate: activeAtStart > 0 ? churned / activeAtStart : 0, churned, activeAtStart };
}

// ---------------------------------------------------------------------------
// Revenue churn (monthly): MRR_lost_in_month ÷ MRR_at_month_start.
// ---------------------------------------------------------------------------
export function revenueChurnRate(
  memberships: MembershipRow[],
  month: string
): { rate: number; mrrLost: number; mrrAtStart: number } {
  const start = monthStart(month);

  let mrrAtStart = 0;
  for (const m of memberships) {
    if (m.status === "trial_expired" || m.status === "trialing") continue;
    const first = m.trialStartedAt ?? m.convertedAt;
    if (first && new Date(first).getTime() < start.getTime()) mrrAtStart += m.mrrCents;
    else if (m.churnedAt === null) mrrAtStart += m.mrrCents;
  }

  let mrrLost = 0;
  for (const m of memberships) {
    if (!m.churnedAt) continue;
    if (!inMonth(new Date(m.churnedAt), month)) continue;
    if (m.status !== "churned") continue;
    mrrLost += m.mrrCents;
  }

  return { rate: mrrAtStart > 0 ? mrrLost / mrrAtStart : 0, mrrLost, mrrAtStart };
}

// ---------------------------------------------------------------------------
// Net revenue retention:
// (starting_MRR + expansion − contraction − churned) ÷ starting_MRR
// Rows with no tier upgrade yet produce expansion=0 — the field is defined
// and shown as "n/a" when there's no tier change data, per the spec.
// ---------------------------------------------------------------------------
export function netRevenueRetention(params: {
  startingMrr: number;
  expansion: number;
  contraction: number;
  churned: number;
}): number | null {
  if (params.startingMrr <= 0) return null;
  return (params.startingMrr + params.expansion - params.contraction - params.churned) / params.startingMrr;
}

// ---------------------------------------------------------------------------
// Retention rate = 1 − logo churn. Callers must ALSO display the denominator
// (activeAtStart); a "retention" on a tiny base is noise, and the spec
// requires showing it.
// ---------------------------------------------------------------------------
export function retentionRate(logoChurn: { rate: number }): number {
  return 1 - logoChurn.rate;
}

// ---------------------------------------------------------------------------
// Trial → paid conversion, cohort by TRIAL START month:
// converted ÷ trials_started_in_cohort.
// ---------------------------------------------------------------------------
export function trialConversionRate(
  trials: TrialRow[],
  cohortMonth: string
): { rate: number; converted: number; started: number } {
  const started = trials.filter((t) => monthKey(new Date(t.startedAt)) === cohortMonth);
  const converted = started.filter((t) => t.convertedAt !== null);
  return { rate: started.length > 0 ? converted.length / started.length : 0, converted: converted.length, started: started.length };
}

// ---------------------------------------------------------------------------
// Median time to conversion (days from trial_started_at to converted_at).
// Median, not mean — one outlier distorts the mean badly at low volume.
// Returns null when there are no conversions to measure (honest empty state).
// ---------------------------------------------------------------------------
export function medianDaysToConversion(trials: TrialRow[]): number | null {
  const days = trials.filter((t) => t.convertedAt !== null).map((t) => daysBetween(t.startedAt, t.convertedAt!));
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid];
  if (hi === undefined) return null;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] ?? hi) + hi) / 2;
}

// ---------------------------------------------------------------------------
// Average membership lifetime (months) + LTV.
// LTV = avg_mrr × avg_lifetime_months. Marked low-confidence until at least
// a few complete lifecycles exist.
// ---------------------------------------------------------------------------
export function averageLifetimeMonths(memberships: MembershipRow[], now: Date): number | null {
  const complete = memberships.filter((m) => m.churnedAt !== null);
  if (complete.length < 3) return null; // low-confidence guard per spec
  const total = complete.reduce((sum, m) => {
    const start = new Date(m.trialStartedAt ?? m.convertedAt ?? m.churnedAt!).getTime();
    const end = new Date(m.churnedAt!).getTime();
    return sum + Math.max(0, (end - start) / 86_400_000 / 30.44);
  }, 0);
  return total / complete.length;
}

export function ltv(
  memberships: MembershipRow[],
  now: Date
): { ltvCents: number | null; avgMrrCents: number; avgLifetimeMonths: number | null } {
  const avgLifetime = averageLifetimeMonths(memberships, now);
  const paying = memberships.filter((m) => m.status !== "trial_expired" && m.status !== "trialing");
  const avgMrr = paying.length > 0 ? paying.reduce((s, m) => s + m.mrrCents, 0) / paying.length : 0;
  return {
    ltvCents: avgLifetime !== null ? Math.round(avgMrr * avgLifetime) : null,
    avgMrrCents: Math.round(avgMrr),
    avgLifetimeMonths: avgLifetime,
  };
}

// ---------------------------------------------------------------------------
// Per-rep versions: same math, filtered to one rep's book. `unattributed`
// (null) is a first-class "rep" so "Unattributed" always displays even at zero.
// ---------------------------------------------------------------------------
export interface RepMetrics {
  repUserId: string | null; // null = Unattributed
  signups: number;
  churned: number;
  activeNow: number;
  retentionRate: number | null; // null when no churn basis (honest)
  mrrCents: number;
  avgTenureMonths: number | null;
}

export function perRepMetrics(
  memberships: MembershipRow[],
  repUserId: string | null,
  now: Date
): RepMetrics {
  const book = memberships.filter((m) => m.attributionRepUserId === repUserId);
  const activeNow = book.filter((m) => m.status === "active" || m.status === "cancelled_pending" || m.status === "past_due").length;
  const churned = book.filter((m) => m.status === "churned").length;
  const signups = book.length;
  const retention = signups > 0 ? 1 - churned / signups : null;

  const tenureList = book
    .filter((m) => m.trialStartedAt || m.convertedAt)
    .map((m) => {
      const start = new Date(m.trialStartedAt ?? m.convertedAt!).getTime();
      const end = m.churnedAt ? new Date(m.churnedAt).getTime() : now.getTime();
      return Math.max(0, (end - start) / 86_400_000 / 30.44);
    });
  const avgTenureMonths = tenureList.length > 0 ? tenureList.reduce((a, b) => a + b, 0) / tenureList.length : null;

  const mrrCents = book.filter((m) => m.status === "active" || m.status === "cancelled_pending" || m.status === "past_due").reduce((s, m) => s + m.mrrCents, 0);

  return { repUserId, signups, churned, activeNow, retentionRate: retention, mrrCents, avgTenureMonths };
}

// ---------------------------------------------------------------------------
// Summary the Overview tab's top strip needs: purely derived from a memberships
// array (single source, single computation) so tests can assert exact numbers.
// ---------------------------------------------------------------------------
export interface OverviewSummary {
  active: number;
  mrrCents: number;
  trialsInFlight: number;
  churnedThisMonth: number;
  retainedRate: number | null;
  retainedDenominator: number;
}

export function overviewSummary(memberships: MembershipRow[], now: Date): OverviewSummary {
  const active = memberships.filter((m) => m.status === "active" || m.status === "cancelled_pending" || m.status === "past_due").length;
  const mrrCents = memberships.filter((m) => m.status === "active" || m.status === "cancelled_pending" || m.status === "past_due").reduce((s, m) => s + m.mrrCents, 0);
  const trialsInFlight = memberships.filter((m) => m.status === "trialing").length;
  const month = monthKey(now);
  const churnedThisMonth = memberships.filter((m) => m.status === "churned" && m.churnedAt && monthKey(new Date(m.churnedAt)) === month).length;
  const lc = logoChurnRate(memberships, month);
  return {
    active,
    mrrCents,
    trialsInFlight,
    churnedThisMonth,
    retainedRate: lc.activeAtStart > 0 ? retentionRate(lc) : null,
    retainedDenominator: lc.activeAtStart,
  };
}