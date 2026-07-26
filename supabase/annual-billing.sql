-- Adds annual billing support alongside the existing monthly billing.
-- Additive only: existing monthly columns/behavior are untouched, so this
-- is safe to run without affecting any current subscription.

ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS annual_price_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_annual_price_id text UNIQUE;

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly';
