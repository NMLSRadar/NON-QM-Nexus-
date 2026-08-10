-- FIX SCRIPT — run ONCE in the Supabase SQL editor (Production).
-- The chatbot tables already exist; this adds what the review flagged:
--   1. FKs (lender_id -> lenders, user_id -> users)
--   2. Partial unique index (organization_id, lender_id) WHERE deleted_at IS NULL
--   3. Corrected RLS policies (membership EXISTS OR platform admin) — no
--      org-id-vs-user-id comparison
-- Idempotent: safe to re-run.
BEGIN;

-- 1. Unique posture profile per lender (org override resolution stays unambiguous).
CREATE UNIQUE INDEX IF NOT EXISTS "lfp_org_lender_unique"
  ON "lender_flexibility_profiles"("organization_id", "lender_id")
  WHERE "deleted_at" IS NULL;

-- 2. Foreign keys (idempotent via exception blocks).
DO $$ BEGIN
  ALTER TABLE "lender_flexibility_profiles" ADD CONSTRAINT "lfp_lender_id_fkey"
    FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "chat_feedback" ADD CONSTRAINT "cf_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "chat_unanswered_questions" ADD CONSTRAINT "cuq_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Corrected RLS (matches the repo's established membership-rls.sql pattern).
ALTER TABLE "lender_flexibility_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_unanswered_questions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lender_flexibility_profiles_org_isolation" ON "lender_flexibility_profiles";
DROP POLICY IF EXISTS "lfp_org_isolation" ON "lender_flexibility_profiles";
CREATE POLICY "lfp_org_isolation" ON "lender_flexibility_profiles"
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "lender_flexibility_profiles"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL))
  WITH CHECK (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "lender_flexibility_profiles"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));

DROP POLICY IF EXISTS "chat_unanswered_questions_org_isolation" ON "chat_unanswered_questions";
DROP POLICY IF EXISTS "cuq_org_isolation" ON "chat_unanswered_questions";
CREATE POLICY "cuq_org_isolation" ON "chat_unanswered_questions"
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_unanswered_questions"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL))
  WITH CHECK (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_unanswered_questions"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));

DROP POLICY IF EXISTS "chat_feedback_org_isolation" ON "chat_feedback";
DROP POLICY IF EXISTS "cf_org_isolation" ON "chat_feedback";
CREATE POLICY "cf_org_isolation" ON "chat_feedback"
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_feedback"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL))
  WITH CHECK (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_feedback"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));

COMMIT;
