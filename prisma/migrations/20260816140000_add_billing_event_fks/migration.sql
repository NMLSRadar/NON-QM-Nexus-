-- NON-QM Nexus — Billing event trail foreign keys (2026-08-16,
-- docs/billing-runbook.md).
--
-- Follow-up to 20260816120000_add_billing_dunning_retention: that
-- migration created billing_payment_events with bare id columns. Without
-- real FK constraints, PostgREST cannot resolve the embedded
-- `user:users(...)` / `organization:organizations(...)` relations the
-- admin dashboard's analytics queries rely on ("Could not find a
-- relationship between 'billing_payment_events' and 'users'").
--
-- Additive only; safe to deploy. Constraint names follow the convention
-- Prisma's own DDL would generate.

ALTER TABLE "billing_payment_events"
    ADD CONSTRAINT "billing_payment_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_payment_events"
    ADD CONSTRAINT "billing_payment_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;