-- Chatbot precision plumbing (chatbot upgrade spec §5 / Part 2 §2 + §8).
-- Three org-scoped tables: lender flexibility posture (editorial metadata,
-- never guideline data), the unanswered-questions flywheel, and thumbs
-- feedback. All carry organization_id and are RLS-protected per-org.

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

-- RLS: each org can only read/write its own rows.
ALTER TABLE "lender_flexibility_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_unanswered_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_feedback" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lender_flexibility_profiles_org_isolation" ON "lender_flexibility_profiles"
    USING ("organization_id" = auth.uid()::text::uuid OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "lender_flexibility_profiles"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));
CREATE POLICY "chat_unanswered_questions_org_isolation" ON "chat_unanswered_questions"
    USING ("organization_id" = auth.uid()::text::uuid OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_unanswered_questions"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));
CREATE POLICY "chat_feedback_org_isolation" ON "chat_feedback"
    USING ("organization_id" = auth.uid()::text::uuid OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_feedback"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));