-- Chatbot precision plumbing (chatbot upgrade spec §5 / Part 2 §2 + §8).
--
-- REVIEWED VERSION (2026-08-10): addresses five review findings —
--  1. RLS policies no longer contain the nonsense "organization_id = auth.uid()"
--     clause (an org id is never a user id). Policies now match the repo's
--     established pattern (membership EXISTS check OR public.is_platform_admin()).
--  2. Wrapped in an explicit transaction (BEGIN/COMMIT) so a failure mid-way
--     rolls back instead of leaving a half-migrated schema.
--  3. Foreign keys added: lender_id -> lenders(id), user_id -> users(id).
--  4. Partial unique index on (organization_id, lender_id) WHERE deleted_at IS
--     NULL, so the org-override → platform-default → seed-default resolution is
--     unambiguous (no duplicate posture profiles per lender).
--  5. Note: if this migration is hand-run against production, record it in
--     _prisma_migrations with `prisma migrate resolve --applied
--     20260810060000_add_chatbot_precision_tables`.

BEGIN;

-- 1. Lender flexibility profiles (editorial posture metadata).
CREATE TABLE "lender_flexibility_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "posture" TEXT NOT NULL,
    "posture_notes" TEXT,
    "pricing_tendency" TEXT NOT NULL DEFAULT 'unknown',
    "exceptions_considered" BOOLEAN NOT NULL DEFAULT false,
    "exception_channel" TEXT,
    "typical_compensating_factors_required" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'org_editorial',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_reviewed_at" TIMESTAMP(3),
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "lender_flexibility_profiles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lender_flexibility_profiles_organization_id_lender_id_idx" ON "lender_flexibility_profiles"("organization_id", "lender_id");
ALTER TABLE "lender_flexibility_profiles" ADD CONSTRAINT "lender_flexibility_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lender_flexibility_profiles" ADD CONSTRAINT "lfp_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- One live posture profile per lender: org-override resolution stays unambiguous.
CREATE UNIQUE INDEX "lfp_org_lender_unique" ON "lender_flexibility_profiles"("organization_id", "lender_id") WHERE "deleted_at" IS NULL;

-- 2. Unanswered-questions flywheel.
CREATE TABLE "chat_unanswered_questions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "intent" TEXT,
    "reason" TEXT,
    "normalization" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_unanswered_questions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_unanswered_questions_organization_id_created_at_idx" ON "chat_unanswered_questions"("organization_id", "created_at");
ALTER TABLE "chat_unanswered_questions" ADD CONSTRAINT "chat_unanswered_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_unanswered_questions" ADD CONSTRAINT "cuq_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Thumbs up/down feedback.
CREATE TABLE "chat_feedback" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "rating" BOOLEAN NOT NULL,
    "reason" TEXT,
    "intent" TEXT,
    "prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_feedback_organization_id_created_at_idx" ON "chat_feedback"("organization_id", "created_at");
ALTER TABLE "chat_feedback" ADD CONSTRAINT "chat_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_feedback" ADD CONSTRAINT "cf_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: membership EXISTS check (user_id = auth.uid(), matching the repo's
-- established membership-rls.sql pattern) OR platform admin. Never an
-- org-id-to-user-id comparison.
ALTER TABLE "lender_flexibility_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_unanswered_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_feedback" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lfp_org_isolation" ON "lender_flexibility_profiles"
    USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "lender_flexibility_profiles"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL))
    WITH CHECK (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "lender_flexibility_profiles"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));

CREATE POLICY "cuq_org_isolation" ON "chat_unanswered_questions"
    USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_unanswered_questions"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL))
    WITH CHECK (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_unanswered_questions"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));

CREATE POLICY "cf_org_isolation" ON "chat_feedback"
    USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_feedback"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL))
    WITH CHECK (public.is_platform_admin() OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_feedback"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));

COMMIT;