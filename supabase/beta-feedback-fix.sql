-- Beta Tester Feedback — harden "one survey per tester" (2026-08-12).
--
-- The original table (supabase/beta-feedback.sql) omitted a UNIQUE constraint
-- on user_id. Every "create survey" path uses `ON CONFLICT (user_id)` — the
-- cron backfill (src/app/api/cron/beta-feedback), the manual admin send
-- (src/app/admin/trials/beta-feedback-actions.ts) and the activation RPC
-- (ensure_beta_survey_for_me) — and PostgreSQL rejects that ON CONFLICT
-- target without a matching unique constraint (SQLSTATE 42P10), so NO survey
-- row could ever be created and every send/backfill failed. This adds the
-- constraint, which also backstops the spec's "do not create duplicate
-- surveys" rule at the database level.
--
-- Idempotent, safe to re-run. No rows exist yet (all inserts were failing),
-- but the index-if-not-exists guard makes this harmless anyway.
alter table public.beta_tester_surveys
  add constraint if not exists beta_tester_surveys_user_id_key unique (user_id);