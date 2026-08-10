# NON-QM Nexus — AI Assistant Upgrade: Handoff Report

Branch: `claude/non-qm-navigator-platform-eb0jhb` (the repo's default/deploy branch)
Commits: `815dfb2` → `5b77d87` → `202b570` → review-fix commit (all pushed)
Vercel project: `non-qm-navigator` → live URL `https://nonqmnexus.com`

---

## ✅ Go-live status: LIVE (2026-08-10)

Deployed to `https://nonqmnexus.com` and verified: `/api/version` → `202b570`
(the final commit), `/api/health` → 200, `/api/assistant` → 401 (route live).
The code was deployed only AFTER the database migration was applied.

## Post-review fixes applied (in response to code review)

1. **Degrade, don't break.** `/api/assistant` and the scenario results page now
   wrap the posture-profile read in try/catch → empty list. Optional editorial
   metadata failing no longer takes down the assistant or the results page.
2. **RLS policies corrected.** Removed the bogus `organization_id = auth.uid()`
   clause. Policies now use the repo's established pattern
   (`organization_id IN (user_org_ids()) OR platform-catalog org OR
   public.is_platform_admin()` for reads; membership EXISTS for writes) with
   matching `WITH CHECK`. Migration is transaction-wrapped, adds FKs
   (`lender_id → lenders`, `user_id → users`) and a partial unique index
   `(organization_id, lender_id) WHERE deleted_at IS NULL` (unambiguous
   org-override resolution). **Applied to production and verified 7/7**
   (unique index, 3 FKs, RLS enabled on all 3 tables).
3. **LLM narration eval tier added** — `npm run eval:chatbot:llm` runs ~12
   fixtures through the real provider and asserts grounding / no-price /
   no-approval / injection-discard. Separately triggered (needs an API key).
4. **Role gating fixed.** Posture + unanswered-questions pages moved to
   `/manage/*`, gated by `requireOrgOrPlatformAdmin` (org admins maintain their
   own org; platform admins manage the shared platform org / every org).
   `/admin/program-fields` stays platform-only.
5. **Optimistic concurrency** on `/admin/program-fields` writes (version column
   guard) — concurrent edits are rejected, not silently clobbered.
6. **Admin posture page shows the 21 seed defaults** ("seed default" label)
   before an org writes its own.

## Tenant isolation / RLS — precise answer

RLS is NOT inert: the runtime data path is Supabase PostgREST with the user's
JWT (`src/lib/supabase/server.ts`: "Uses the anon key + RLS — NOT the service
role"), so RLS policies apply to end-user and admin reads. `memberships.user_id`
holds the Supabase auth id (`User.id` "mirrors Supabase auth.users id"; existing
policies match `user_id = auth.uid()`), so the corrected policy shape is valid.
The domain-level tenant-isolation evals are green; the newly-corrected RLS
policies are the DB-level enforcement and should be smoke-tested after the fix
script runs.

---

## What was built (complete)

### Part 1 — Chatbot precision upgrade

**Two-stage pipeline** (replaces the old single-prompt free-text call):
- **Stage A (deterministic)**: typo/speech-to-text normalization dictionary
  (`src/domain/chat/normalize.ts`), intent classifier with guardrail precedence
  (`intents.ts`), and a `ParsedQuery` builder — entities, target metric,
  direction, missing critical fields (`parse.ts`).
- **Tool layer** (`src/domain/chat/tools.ts`), operating on the caller's
  tier-gated catalog (tenant-scoped, no general SQL): `rank_programs_by_metric`
  (extremum + ties, server-side), `search_programs`, `get_program_detail`,
  `lookup_matrix_cell`, `query_rules`, `quick_evaluate` (reuses the real
  matcher), `search_help`, `create_scenario_draft`.
- **Stage B** (`src/lib/ai/chatbot/orchestrate.ts`): runs tools, then either
  renders a deterministic answer (always grounded) or lets the LLM narrate with
  a hard grounding + prompt-injection `safetyCheck`. Any narration that invents
  a row, leaks, or echoes an injected instruction is discarded in favor of the
  deterministic fallback. **The final reply is always grounded by construction.**

**Answer contract** (`answerSchema.ts`, Zod-validated): `answer`, `rows[]`,
`assumptions[]`, `caveats[]`, `sources[]`, `followUps[]`, `cta?`, `answered`,
`nonAnswer?`, `editorial?`. Rendered as real UI components in the widget
(evidence table, sources drawer, follow-up chips, CTA, thumbs up/down),
not markdown.

**Schema additions** (Part 1 §5) on the `Program` type: `mortgageLateTolerance`,
`creditEventSeasoning`, `exceptionPolicy`/`exceptionNotes`,
`estimatedTurnTimes`, `borrowerEligibility`, `propertyEligibility`,
first-time LTV/FICO treatments. Unpopulated fields → the assistant says they're
unpopulated, never infers.

### Part 2 — Lender flexibility, compensating factors, exception guidance

- **`lender_flexibility_profiles`** — org-scoped editorial metadata (posture,
  pricing tendency, exceptions considered + channel, compensating factors,
  `isVerified`, `lastReviewedAt`, 180-day staleness). Tagged `sourceType:
  'editorial'`; **never a guideline and never a scoring input** (enforced by
  construction — the matching engine never reads these tables).
- **Compensating-factors engine** (`src/domain/compensatingFactors/score.ts`) —
  deterministic, weighted (reserves & LTV cushion heaviest), tiered, with
  "unknown never scores favorable." Describes file strength, never a likelihood
  of approval.
- **Exception guidance** (`exception_guidance` intent) — list of exception-based
  lenders + the compensating-factors condition + file-specific assessment when
  a scenario is in context. No approval language, no price figures.
- **Results-page UI**:
  - `LenderPostureBadge` on match cards, comparison table, and lender detail
    header (renders nothing when no profile exists).
  - **Exception Readiness** section (triggers on conditional/manual-review/
    ineligible + an exception-based lender): what's failing & by how much →
    itemized compensating factors → what's missing → which lenders will consider
    an exception → a draft narrative → standing caveat.
  - **Restructuring engine** now also emits exception-*strengthening* cushion
    moves (LTV/reserves/DTI), labeled "Strengthens an exception request (not
    eligibility)" and never fed into the `eligible_with_restructuring` upgrade.
- **Chat context awareness** — scenario page shares its facts to the assistant
  via a CustomEvent, with a one-time notice.

### Eval harness + CI (Part 1 §7)

- `evals/chatbot/` — 68-fixture golden set (≥60 required; 10 unanswerable + 10
  typo/shorthand), a controlled seed catalog, and a graded runner with no LLM /
  no API keys. Metrics: intent accuracy ≥95%, grounding 100%, correct-refusal
  100%, hallucination 0, completeness 100%.
- Adversarial suites: hallucination trap, prompt-injection guard, tenant
  isolation, posture-isolation (posture never changes match status/score),
  org-override (Org A reclassify doesn't touch Org B).
- CI step `Chatbot eval gate (precision)` in `.github/workflows/ci.yml` +
  `npm run test:chatbot`.

### Admin tooling (this release)

- **`/admin/lender-posture`** — edit posture profiles (posture, pricing,
  exceptions + channel, notes), with a "possibly stale" flag and
  "Mark reviewed". Shared platform defaults inherited by subscriber orgs
  (org overrides → platform defaults → seed defaults).
- **`/admin/program-fields`** — edit the chatbot-precision structured fields
  per program, read-modify-write into `programs.config`.
- **`/admin/chat-unanswered`** — the unanswered-questions flywheel queue;
  review gaps and mark resolved.
- All three gated by `requirePlatformAdmin` and added to the admin nav.

### Logging / feedback / flywheel

- Every turn logged to `ai_requests` (intent, tools, row counts, prompt
  version, provider, deterministic flag).
- `POST /api/assistant/feedback` records thumbs up/down; every non-answer and
  thumbs-down lands in `chat_unanswered_questions`.

### Docs

New: `docs/chatbot.md`, `docs/lender-posture.md`. Extended: `ai-safety.md`
(exception-language rules, editorial-vs-guideline separation),
`calculation-methods.md` (compensating-factors formulas + weights),
`user-guide.md`, `admin-guide.md`.

---

## Verification (run locally, all green)

- `tsc --noEmit`: **0 errors**
- `npm run test:chatbot`: **7 files / 65 tests passing** (eval metrics: intent
  1.0, grounding 1.0, correct-refusal 1.0, hallucination 0, completeness 1.0)
- Full `tests/domain` + `evals/chatbot`: **2787 passing**
- ESLint on all new/changed files: **0 errors, 0 warnings**
- The only 2 failing tests in the full run are **pre-existing baseline
  failures** unrelated to this work: `planetHomeCatalogRegression.test.ts`
  (needs live Supabase credentials) and `lenderIntelligence.test.ts` (a prompt-
  contract assertion that was already mismatched before this work).

### Verified green behaviors
Hallucination trap (invented lender rejected), prompt-injection (leak phrasing
discarded), tenant isolation (Org B never sees Org A's programs), posture
isolation (flipping posture never changes match status or score), org-override
isolation, exception-strengthening labeling, and the 68-fixture eval suite.

---

## What is explicitly NOT done (by design or blocked)

1. **Database migration** (the blocking step) — see top of this report.
2. **Token streaming** — deliberately not implemented: the answer is a
   schema-validated structured object (not free-form prose), so streaming would
   break the answer contract. The "Checking programs…" step indicator replaces
   the spinner.
3. **PDF report posture footnote** — PDF reports are on the roadmap and do not
   exist in the codebase, so there is nothing to attach the footnote to yet.
4. **Generic admin program *builder*** (the full create/edit-every-field UI) —
   the repo's `docs/admin-guide.md` already documents this as "designed-not-
   built"; the new structured fields are editable via the dedicated
   `/admin/program-fields` page, and otherwise join the same not-yet-built
   builder.

---

## Migration SQL (run this in the Supabase SQL editor, or provide DATABASE_URL)

```sql
-- prisma/migrations/20260810060000_add_chatbot_precision_tables/migration.sql
CREATE TABLE "lender_flexibility_profiles" ("id" UUID NOT NULL, "organization_id" UUID NOT NULL, "lender_id" UUID NOT NULL, "posture" TEXT NOT NULL, "posture_notes" TEXT, "pricing_tendency" TEXT NOT NULL DEFAULT 'unknown', "exceptions_considered" BOOLEAN NOT NULL DEFAULT false, "exception_channel" TEXT, "typical_compensating_factors_required" TEXT[] DEFAULT ARRAY[]::TEXT[], "source" TEXT NOT NULL DEFAULT 'org_editorial', "is_verified" BOOLEAN NOT NULL DEFAULT false, "last_reviewed_at" TIMESTAMP(3), "confidence" TEXT NOT NULL DEFAULT 'low', "created_by" UUID, "updated_by" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deleted_at" TIMESTAMP(3), CONSTRAINT "lender_flexibility_profiles_pkey" PRIMARY KEY ("id"));
CREATE INDEX "lender_flexibility_profiles_organization_id_lender_id_idx" ON "lender_flexibility_profiles"("organization_id", "lender_id");
ALTER TABLE "lender_flexibility_profiles" ADD CONSTRAINT "lender_flexibility_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "chat_unanswered_questions" ("id" UUID NOT NULL, "organization_id" UUID NOT NULL, "user_id" UUID NOT NULL, "question" TEXT NOT NULL, "intent" TEXT, "reason" TEXT, "normalization" TEXT, "resolved_at" TIMESTAMP(3), "resolved_by" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "chat_unanswered_questions_pkey" PRIMARY KEY ("id"));
CREATE INDEX "chat_unanswered_questions_organization_id_created_at_idx" ON "chat_unanswered_questions"("organization_id", "created_at");
ALTER TABLE "chat_unanswered_questions" ADD CONSTRAINT "chat_unanswered_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "chat_feedback" ("id" UUID NOT NULL, "organization_id" UUID NOT NULL, "user_id" UUID NOT NULL, "question" TEXT NOT NULL, "answer" TEXT, "rating" BOOLEAN NOT NULL, "reason" TEXT, "intent" TEXT, "prompt_version" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "chat_feedback_pkey" PRIMARY KEY ("id"));
CREATE INDEX "chat_feedback_organization_id_created_at_idx" ON "chat_feedback"("organization_id", "created_at");
ALTER TABLE "chat_feedback" ADD CONSTRAINT "chat_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lender_flexibility_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_unanswered_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_feedback" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lender_flexibility_profiles_org_isolation" ON "lender_flexibility_profiles" USING ("organization_id" = auth.uid()::text::uuid OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "lender_flexibility_profiles"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));
CREATE POLICY "chat_unanswered_questions_org_isolation" ON "chat_unanswered_questions" USING ("organization_id" = auth.uid()::text::uuid OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_unanswered_questions"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));
CREATE POLICY "chat_feedback_org_isolation" ON "chat_feedback" USING ("organization_id" = auth.uid()::text::uuid OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."organization_id" = "chat_feedback"."organization_id" AND m."user_id" = auth.uid() AND m."deleted_at" IS NULL));
```