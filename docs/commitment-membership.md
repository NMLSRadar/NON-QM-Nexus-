# 3-Month Commitment membership

Shipped 2026-08-15. Adds a second membership option alongside the existing
month-to-month $150/month membership:

| Option | Price | After |
| --- | --- | --- |
| Monthly Membership | $150/month month-to-month | unchanged (no commitment) |
| 3-Month Commitment | **$120** for billing cycles 1–3, then **$150/month** from cycle 4, month-to-month until canceled | saves $90 in the first 3 months |

## How it works (Stripe architecture)

The commitment is a **normal recurring subscription at the $120 price** created
through the existing Stripe Checkout flow, which is then handed to a **Stripe
Subscription Schedule** (`from_subscription`) by the
`checkout.session.completed` webhook. The schedule has exactly two phases:

1. `$120/month × 3` billing cycles (anchored at the enrollment cycle — the
   cycle Checkout already invoiced counts as cycle 1)
2. `$150/month`, open-ended

Phase transitions are 100% server-side (Stripe billing engine, no cron, no
front-end timers). Verified in Stripe test mode with a test clock: invoices
land at $120 → $120 → $120 → $150 → $150…; the subscription id never
changes; there is no second checkout, no new payment authorization, no gap
in access, no duplicate customer/subscription.

Important details that shaped the implementation (all verified 2026-08-15 on
Stripe test mode):

- `subscription_schedules.create({ from_subscription })` keeps the SAME
  subscription (it becomes schedule-managed) — it does not create a new one.
- The first (already-paid) cycle is not re-invoiced; `iterations` is only
  allowed at schedule CREATE, so the schedule UPDATE uses
  `start_date` (phase-1 anchor) + `duration: 3 months` for phase 1 and a
  second phase with no end for $150.
- Stripe rejects `cancel_at_period_end` on a schedule-managed subscription
  ("update the schedule instead"). Graceful self-serve cancel therefore
  trims the schedule to end at the CURRENT billing period and sets
  `end_behavior: "cancel"` → members keep access through the period they've
  already paid for (same as a standard cancel), then it ends. Admins keep
  immediate-cancel via the existing "Cancel Stripe subscription" action
  (works on scheduled subscriptions as-is).

## Files

| File | Purpose |
| --- | --- |
| `src/lib/billing/commitment.ts` | Shared commitment logic: phase builder, schedule creation, graceful cancel/resume, kind derivation, `commitmentMonthOf` display math |
| `src/app/api/webhooks/stripe/route.ts` | The single writer of subscription state: creates the schedule on checkout complete (idempotent + self-healing on `customer.subscription.updated`), mirrors schedule events (`subscription_schedule.created/updated/canceled/aborted/released`) into `user_subscriptions`, writes membership kind, current price, commitment dates, `cancel_at` |
| `src/app/pricing/checkout-actions.ts` | `membership=commitment` branch: $120 price + `membership_kind=commitment` metadata; duplicate-subscription guard redirects to /account when a live sub already exists |
| `src/app/pricing/pricing-plans.tsx` | Two side-by-side cards; commitment card has BEST VALUE badge, savings math, and a pre-checkout disclosure checkbox (affirmative acknowledgment) |
| `src/app/account/page.tsx` + `subscription-actions.ts` | Dashboard shows Current plan / Current rate / Commitment month X of 3 / Next billing date / Future rate; cancel & resume are schedule-aware |
| `src/app/admin/users/page.tsx` | Membership column (kind, rate, commitment month, dates) + Billing column (status, next billing, cus/sub/sched ids) + filters: All / $150 Monthly / 3-Month Commitment / Commitment Completed / Past Due / Canceled |
| `supabase/commitment-membership.sql` | Schema: `membership_plans.stripe_commitment_price_id` + `user_subscriptions` projection columns (kind, schedule id, commitment dates, current price, cancel_at). All nullable/defaulted — existing rows untouched |
| `scripts/stripe-commitment-setup.js` | Idempotent: creates/looks up the $120 price on the plan's product, sets `stripe_commitment_price_id`, wires webhook events (incl. all `subscription_schedule.*`) |
| `scripts/stripe-commitment-e2e.ts` | Full test-clock regression: $120×3 → $150, same sub id, graceful cancel, resume |
| `scripts/stripe-reconcile-commitments.ts` | Ops reconciliation: rewrites DB projection from Stripe truth (incl. healing schedule-less commitment subs) |

## Database fields (user_subscriptions)

Mirrors only what the UI/audit needs; **Stripe remains the source of truth**
for billing state:

- `membership_kind` — `standard` | `commitment` | `commitment_completed`
- `stripe_subscription_schedule_id`
- `commitment_start_date`, `commitment_end_date`, `standard_rate_start_date`
- `current_monthly_price_cents`
- `cancel_at` (schedule-owned subs surface graceful cancels via `cancel_at`, not `cancel_at_period_end`)

`Standard_rate_start_date` == `commitment_end_date` by construction: the $150
rate begins exactly when the commitment ends (month 4).

## Rollout (production)

1. Merge/deploy the app code (this ships the checkout branch, webhook
   handlers, UI, admin view).
2. Run with the **LIVE** Stripe key:
   `node scripts/stripe-commitment-setup.js` (idempotent; creates the $120
   price on the live account and enables the schedule webhook events on the
   endpoint matching `/api/webhooks/stripe`).
3. Sanity check in the Stripe dashboard: two active monthly prices on the
   Membership product ($150, $120), webhook endpoint lists
   `subscription_schedule.*`.
4. Existing $150/month members are untouched (proven: `membership_kind`
   defaults to `standard`; nothing migrates existing subscriptions).

## Admin / support cheat-sheet

- **Identify**: admin → Users → Membership column shows type + rate +
  commitment month/dates; Billing column shows next billing, status, cu
  ids. Filters: All / $150 Monthly / 3-Month Commitment / Commitment
  Completed / Past Due / Canceled.
- **Support cancellation "at period end" for a commitment member** — instruct
  member to use the account page "Cancel subscription" (graceful, schedule
  trims to the paid period). For an immediate hard cancel use "Cancel Stripe
  subscription" (audit-logged).
- **Refunds**: use the Stripe dashboard as usual; the webhook reflects
  status changes automatically. Refunding one payment doesn't change the
  schedule, and the schedule still transitions to $150 after 3 billing
  cycles (it's Stripe-side).
- **Reconciliation**: `npx tsx scripts/stripe-reconcile-commitments.ts`
  re-copies the DB projection from Stripe (safe; requires service/env keys).

## Edge cases addressed

Duplicate checkout submissions (server-side guard + webhook dedupe),
webhook retries/out-of-order (idempotent whole-image syncs),
missing schedule (self-heal on `customer.subscription.updated` +
reconcile script), failed payments (existing `invoice.payment_failed` →
past_due), cancel during commitment (graceful period-end), admin force
cancel/refund (unchanged, immediate), timezone (all dates are Stripe Unix
timestamps, rendered in the browser's local zone), demo/expired cards
(Stripe > subscriptions), DB↔Stripe disagreement (reconcile script,
webhook is the single writer).