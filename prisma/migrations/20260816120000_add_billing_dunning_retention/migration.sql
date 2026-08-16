-- NON-QM Nexus — Billing & Retention (2026-08-16, docs/billing-runbook.md)
--
-- Three additions, all additive (no data loss, no dropped columns):
--   1. billing_payment_events — append-only Stripe event trail powering the
--      admin Billing & Retention dashboard (every failed/succeeded payment
--      attempt, membership starts, cancel requests, actual cancels).
--   2. Dunning columns on user_subscriptions — decline counters + timing +
--      daily-email idempotency markers, written ONLY by the Stripe webhook
--      and the billing-dunning cron.
--   3. The same dunning columns on org_subscriptions (team subscriptions).
--
-- Plain SQL, matching the live Supabase table shapes (lowercase unquoted
-- identifiers, existing table names) — created via prisma migrate deploy.

-- 1. Event trail table -----------------------------------------------------
CREATE TABLE "billing_payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "organization_id" UUID,
    "event_type" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "amount_cents" INTEGER,
    "attempt_number" INTEGER,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "next_retry_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "billing_payment_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_payment_events_stripe_event_id_key" UNIQUE ("stripe_event_id")
);

CREATE INDEX "billing_payment_events_user_id_created_at_idx" ON "billing_payment_events" ("user_id", "created_at" DESC);
CREATE INDEX "billing_payment_events_organization_id_created_at_idx" ON "billing_payment_events" ("organization_id", "created_at" DESC);
CREATE INDEX "billing_payment_events_stripe_subscription_id_idx" ON "billing_payment_events" ("stripe_subscription_id");
CREATE INDEX "billing_payment_events_event_type_created_at_idx" ON "billing_payment_events" ("event_type", "created_at" DESC);

-- 2. Personal subscription dunning / retention columns ---------------------
ALTER TABLE "user_subscriptions"
    ADD COLUMN "last_payment_failed_at" TIMESTAMPTZ,
    ADD COLUMN "last_payment_succeeded_at" TIMESTAMPTZ,
    ADD COLUMN "next_payment_attempt_at" TIMESTAMPTZ,
    ADD COLUMN "decline_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "dunning_email_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "last_dunning_email_sent_at" TIMESTAMPTZ,
    ADD COLUMN "cancel_requested_at" TIMESTAMPTZ;

-- 3. Team subscription dunning columns --------------------------------------
ALTER TABLE public.org_subscriptions
    ADD COLUMN "last_payment_failed_at" TIMESTAMPTZ,
    ADD COLUMN "last_payment_succeeded_at" TIMESTAMPTZ,
    ADD COLUMN "next_payment_attempt_at" TIMESTAMPTZ,
    ADD COLUMN "decline_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "dunning_email_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "last_dunning_email_sent_at" TIMESTAMPTZ,
    ADD COLUMN "cancel_requested_at" TIMESTAMPTZ;