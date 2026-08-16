# Billing Runbook — NON-QM Nexus

**2026-08-16.** Companion to the admin **Billing & Retention** dashboard
(`/admin/billing`). This is the procedure for every billing possibility in
the platform: what the system does automatically (webhook + cron) and what
a platform admin should do when something lands in a particular state.

## 1. Architecture (single source of truth)

- **Stripe is the source of truth** for money: subscriptions, invoices,
  payment methods, retries, cancellations. The app never writes a billing
  value that Stripe hasn't told it.
- **The webhook** (`/api/webhooks/stripe`, validated by
  `STRIPE_WEBHOOK_SECRET`) is the *single writer* of Stripe-sourced state on
  `user_subscriptions` / `org_subscriptions`, and (2026-08-16) the single
  writer of the **event trail** (`billing_payment_events`) and the dunning
  columns.
- **The daily cron** `/api/cron/billing-dunning` (Vercel Cron, `vercel.json`,
  daily 15:00 UTC) sends the declined-payment follow-up email **once per
  day** to every member whose payment is failing.
- **Email** goes through Resend (`sendTransactionalEmail`,
  `noreply@nonqmnexus.com`); one-click unsubscribe is respected via
  `email_suppressions`.

## 2. The billing lifecycle — every state and what happens

### Checkout / new membership
- `checkout.session.completed` → personal row upserted, commitment schedule
  attached if the 3-Month Commitment price was bought, and
  `membership_started` recorded on the trail. `started_at` anchors the
  retention cohort.
- **Checkout fails before Stripe** (card not accepted at checkout): no
  subscription is created and nothing persists — Stripe handles the decline
  UX. There is nothing to track; the funnel metric lives in Stripe.
- **Checkout succeeds but first invoice fails** (`invoice.payment_failed`
  with `attempt_count = 1`): the subscription row becomes `past_due`,
  `decline_count` → 1 in the trail, and the dunning sequence begins (below).

### Card declines on renewal (dunning) — the "at-risk" state
Every failed renewal invoice (Stripe retries automatically, typically 4
attempts over ~2 weeks) fires `invoice.payment_failed`; the webhook:
1. Records the event in `billing_payment_events` with `amount_cents`,
   `attempt_number`, `failure_code`/`failure_message`, and `next_retry_at`
   (Stripe's next scheduled attempt).
2. Flips the subscription to `stripe_status = past_due`, stamps
   `last_payment_failed_at`, and atomically increments `decline_count` via
   `increment_decline_count()`.
3. The member **keeps full access** (tier resolution only drops on
   `canceled_at`), so this state is purely a revenue-recovery signal.

**Daily follow-up email** — the `billing-dunning` cron emails the member
every calendar day while `stripe_status ∈ {past_due, unpaid, incomplete,
incomplete_expired}` and not canceled, at most once per day (idempotent via
`last_dunning_email_sent_at`). The email states the amount, the attempt
number, the next retry time, and links to the account page to update the
payment method (Stripe Customer Portal). `dunning_email_count` tracks how
many have been sent — visible on the admin dashboard.

### Recovery
- `invoice.payment_succeeded` → the webhook records the event, resets the
  subscription to `active`, clears `decline_count`, `last_payment_failed_at`,
  `next_payment_attempt_at` (and marks `last_payment_succeeded_at`). The
  member disappears from the dunning queue; the trail keeps the full history
  of failures → success, which the dashboard renders as "Payment recovered".
- Nothing else needed from an admin. If the member had reached
  `canceled_at` via unpaid and re-subscribes, that's a new subscription
  (new `started_at` cohort).

### Voluntary cancel (retention: "cancel requested")
- Member cancels in-app → Stripe `cancel_at_period_end = true` →
  `customer.subscription.updated` → webhook records `cancel_requested`
  event and stamps `cancel_requested_at` (idempotent — never overwritten).
  The member still has access to the end of the period.
- If the member changes their mind (`cancel_at_period_end` false again) →
  `cancel_revoked` event + `cancel_requested_at` cleared.
- **Admin action:** these members show under "Cancel requested" on the
  dashboard until their `current_period_end` — a save/retention call list.

### Actual churn
- `customer.subscription.deleted` → subscription row → `canceled_at` stamped,
  `stripe_status = canceled`, `membership_canceled` event recorded.
- Whether it was voluntary (had `cancel_requested_at`) or involuntary
  (payment failure without a cancel request) is answerable from the trail.

### Special objects
- **AE placements** (`metadata.kind = ae_placement`) and **team
  subscriptions** (`metadata.team = true`) are handled with their own
  writers (`ae_placements`, `org_subscriptions`); both also get trail
  events. Team dunning is informational (members keep access until the
  org sub cancels).
- **3-Month Commitment** ($120 ×3 then $150) is Stripe
  Subscription-Schedule-managed; `subscription_schedule.*` events mirror
  commitment dates; dunning/retention logic is agnostic (it keys off
  subscription status, not schedule).

## 3. Admin procedures

- **Someone's card keeps declining** — check the **Declined payments —
  dunning queue** table on the dashboard: status, decline count, last
  failure, next Stripe retry, emails already sent. Decide:
  - Card on file is old → tell the member via reply/phone; the daily emails
    are already nudging them; or update the payment method yourself in
    Stripe if the member asks you to.
  - Fraud suspect (multiple declines, unusual reason codes) → cancel the
    subscription in Stripe (the webhook will reflect it) and follow your
    fraud process.
  - Member wants to keep it → nothing to do; the system recovers
    automatically on `invoice.payment_succeeded`.
- **Retention review** — the dashboard's "Retention by month" + "Recent
  cancellations" give monthly start/cancel counts, retention %, and tenure.
  A negative retention month with many `cancel_requested` members = run a
  save campaign before period ends.
- **Webhook broken?** `/api/health` + Stripe dashboard → events list. If
  events aren't landing: `STRIPE_WEBHOOK_SECRET` mismatch (redeploy env),
  or the endpoint 400s on signature (check Vercel env var matches the live
  endpoint secret).
- **Cron health** — Vercel project → Settings → Cron Jobs, or hit
  `/api/cron/billing-dunning` with `Authorization: Bearer $CRON_SECRET`
  (Vercel logs show runs).

## 4. Schema owned by this system (2026-08-16 migration
`20260816120000_add_billing_dunning_retention`)

- `billing_payment_events` — append-only trail (`stripe_event_id` unique,
  dedupes redelivery).
- `user_subscriptions`: `last_payment_failed_at`, `last_payment_succeeded_at`,
  `next_payment_attempt_at`, `decline_count`, `dunning_email_count`,
  `last_dunning_email_sent_at`, `cancel_requested_at`.
- `org_subscriptions`: same dunning columns (informational).
- `increment_decline_count(table, subscription_id)` — atomic counter
  (supabase/billing-dunning-rls.sql).
- RLS: platform admins may read the trail (`billing_events_admin_select`).

## 5. Tests / verify after deploy

- `npm run typecheck`
- Integration (#REQUIRE_INTEGRATION=1) webhook suite plus the new
  billing-events path.
- Manual dashboard check: `/admin/billing` renders KPIs identical to
  `/admin` numbers; dunning queue matches Stripe dashboard past-due subs.