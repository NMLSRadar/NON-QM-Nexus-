-- Trigger observability (incident 2026-07-30 hardening, 2026-08-05).
-- handle_new_user()'s invite-branch EXCEPTION WHEN OTHERS handler
-- (supabase/team-invite-signup.sql) used to swallow errors invisibly and
-- silently fall through to a normal (self-created-org) signup. This table
-- gives that fallback an observable trail (paired with RAISE WARNING in
-- the trigger itself). No full email is ever stored, only the domain.
--
-- This is the FIRST migration committed under the new schema workflow
-- (see docs/incident-2026-07-30-schema-drift.md, "Verification results").

CREATE TABLE "signup_trigger_errors" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sqlstate" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "email_domain_only" TEXT,

    CONSTRAINT "signup_trigger_errors_pkey" PRIMARY KEY ("id")
);
