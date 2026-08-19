-- NON-QM Nexus Pricing v2
-- Apply with the repository SQL deployment runner before deploying application code.
-- This migration extends the existing membership_plans catalog instead of creating
-- a second global catalog, avoiding two sources of truth and unnecessary tenant RLS.
BEGIN;

alter table public.membership_plans
  add column if not exists amount_cents integer,
  add column if not exists billing_mode text,
  add column if not exists term_months integer,
  add column if not exists rolls_to_plan_key text,
  add column if not exists cancellable_mid_term boolean,
  add column if not exists stripe_lookup_key text;

alter table public.user_subscriptions
  add column if not exists pricing_version text,
  add column if not exists amount_cents integer,
  add column if not exists billing_mode text,
  add column if not exists term_months integer,
  add column if not exists rolls_to_plan_id text,
  add column if not exists legacy_plan_key text,
  add column if not exists commitment_ack_text text,
  add column if not exists commitment_ack_version text,
  add column if not exists commitment_ack_at timestamptz,
  add column if not exists commitment_ack_ip text,
  add column if not exists commitment_ack_user_agent text,
  add column if not exists commitment_checkout_session_id text,
  add column if not exists cancel_at_commitment_end boolean not null default false;

create unique index if not exists membership_plans_stripe_lookup_key_uidx
  on public.membership_plans (stripe_lookup_key)
  where stripe_lookup_key is not null;

-- Grandfather every pre-v2 commitment projection. No Stripe object is
-- updated, canceled, or repriced by this migration.
update public.user_subscriptions
set legacy_plan_key = 'legacy_commit_3mo_120'
where membership_kind = 'commitment'
  and pricing_version is null
  and legacy_plan_key is null;

create unique index if not exists user_subscriptions_commitment_checkout_session_uidx
  on public.user_subscriptions (commitment_checkout_session_id)
  where commitment_checkout_session_id is not null;

-- billing_payment_events is the existing append-only audit table. Stripe replay
-- safety is enforced by this database index, not by a process-local check.
create unique index if not exists billing_payment_events_stripe_event_id_uidx
  on public.billing_payment_events (stripe_event_id);

COMMIT;

-- DOWN (manual rollback; never run automatically in production)
-- BEGIN;
-- DROP INDEX IF EXISTS public.user_subscriptions_commitment_checkout_session_uidx;
-- ALTER TABLE public.user_subscriptions
--   DROP COLUMN IF EXISTS cancel_at_commitment_end,
--   DROP COLUMN IF EXISTS commitment_checkout_session_id,
--   DROP COLUMN IF EXISTS commitment_ack_user_agent,
--   DROP COLUMN IF EXISTS commitment_ack_ip,
--   DROP COLUMN IF EXISTS commitment_ack_at,
--   DROP COLUMN IF EXISTS commitment_ack_version,
--   DROP COLUMN IF EXISTS commitment_ack_text,
--   DROP COLUMN IF EXISTS legacy_plan_key,
--   DROP COLUMN IF EXISTS rolls_to_plan_id,
--   DROP COLUMN IF EXISTS term_months,
--   DROP COLUMN IF EXISTS billing_mode,
--   DROP COLUMN IF EXISTS amount_cents,
--   DROP COLUMN IF EXISTS pricing_version;
-- ALTER TABLE public.membership_plans
--   DROP COLUMN IF EXISTS stripe_lookup_key,
--   DROP COLUMN IF EXISTS cancellable_mid_term,
--   DROP COLUMN IF EXISTS rolls_to_plan_key,
--   DROP COLUMN IF EXISTS term_months,
--   DROP COLUMN IF EXISTS billing_mode,
--   DROP COLUMN IF EXISTS amount_cents;
-- COMMIT;
