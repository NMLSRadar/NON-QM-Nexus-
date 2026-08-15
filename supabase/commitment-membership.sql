-- NON-QM Nexus — 3-Month Commitment membership (2026-08-15).
--
-- Adds the minimum application-side fields needed to render, audit and
-- reconcile the 3-month $120 -> $150 commitment membership. Stripe (via
-- Subscription Schedules) remains the source of truth for billing state;
-- these columns are the cached projection the webhook maintains and the
-- UI/admin reads. Existing rows are untouched: membership_kind defaults
-- to 'standard' so current $150/month members are unaffected.
--
-- Idempotent: safe to re-run.

alter table membership_plans
  add column if not exists stripe_commitment_price_id text;

alter table user_subscriptions
  -- 'standard' | 'commitment' (inside the $120 first-3-months phase)
  -- | 'commitment_completed' (moved to $150/month, still the SAME
  -- subscription relationship — never a separate membership).
  add column if not exists membership_kind text not null default 'standard',
  add column if not exists stripe_subscription_schedule_id text,
  add column if not exists commitment_start_date timestamp,
  add column if not exists commitment_end_date timestamp,
  add column if not exists standard_rate_start_date timestamp,
  add column if not exists current_monthly_price_cents integer,
  -- scheduled (graceful) cancel date, mirrors Stripe subscription.cancel_at
  -- (schedule-managed subscriptions surface cancelation via cancel_at, not
  -- cancel_at_period_end — see webhook / cancellation logic).
  add column if not exists cancel_at timestamp;

alter table user_subscriptions
  add constraint user_subscriptions_membership_kind_check
  check (membership_kind in ('standard', 'commitment', 'commitment_completed'));

create index if not exists user_subscriptions_membership_kind_idx
  on user_subscriptions (membership_kind);
create index if not exists user_subscriptions_schedule_id_idx
  on user_subscriptions (stripe_subscription_schedule_id);