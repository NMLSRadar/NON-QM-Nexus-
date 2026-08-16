# Build Task: Signup Attribution — NON-QM Nexus

**Agent-agnostic build spec.** Written to be handed to whatever coding agent has repo access — Claude Code, Codex, or another harness. It requires a filesystem, git, database migrations, and a test runner, so it must be run by an agent that has those.

Save as `docs/tasks/03-signup-attribution.md`, commit, then build.

> Dependency note: Task 04 (`docs/tasks/04-membership-management.md`) reads every row of this section, so its column semantics (organization_id unique, admin-only RLS, attribution method + source, `attribution_changes` audit) are load-bearing. Get those shapes right here.

## 1. Goal

Record **which sales rep brought in which organization** — captured at the moment of signup, stored admin-only, and never visible to members. This is the data foundation for Membership Management's per-rep retention (task 04). Attribution is internal data for the operator: the loan officers on the platform must never see which rep (if any) "owns" their organization, and no member-scoped route or API may return it.

Non-negotiables:

1. **Attribution is admin-only.** Enforced by RLS (platform-admin read/write only) AND by route-level authorization, never by hiding it in the UI. A member-role Supabase session gets zero rows from these tables.
2. **First capture wins; later captures don't silently overwrite.** The org's first attribution is only ever changed by an explicit admin reassignment, which writes `attribution_changes` with a mandatory reason.
3. **Conflicts are visible, not silent.** When two different reps (or one rep and an unknown source) both claim a signup, the row enters `needs_review` status and the admin UI shows it — it must never just pick one and forget the other.
4. **Attachment at the trigger, not the form.** The authoritative capture happens in `handle_new_user()` (the auth-users signup trigger), from the `ref` code that rode through Supabase Auth user metadata. Client code only passes the raw code through; the trigger validates against `sales_reps.code` and resolves the organization.

## 2. First step: inspect before building

- Confirm `supabase/onboarding-trigger.sql` / `supabase/team-invite-signup.sql`'s `handle_new_user()` — this is where capture lands (it already consumes `raw_user_meta_data` for the invite token; the ref code rides the same metadata).
- Confirm `src/app/signup` + `src/app/login/actions.ts`'s `signUp()` (user metadata passthrough) and the invite path.
- Confirm `public.is_platform_admin()` in `supabase/membership-rls.sql` and use the same policy helper.
- Confirm the schema convention: authoritative DDL in `supabase/*.sql`, applied with `node scripts/apply-sql.mjs supabase/<file>.sql`, mirrored into `prisma/schema.prisma` for types.

## 3. Data model

```sql
BEGIN;

-- Sales rep identity: one row per rep, linked to their platform user.
CREATE TABLE "sales_reps" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        UUID NOT NULL,
  "code"           TEXT NOT NULL,              -- short shareable code, e.g. "bobby"
  "display_name"   TEXT NOT NULL,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "sales_reps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_reps_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "sales_reps_code_unique" UNIQUE ("code"),
  CONSTRAINT "sales_reps_user_unique" UNIQUE ("user_id")
);

-- The current attribution for an organization. ONE row per org.
-- status: confirmed | needs_review
-- method: signup_link | invite | admin_manual
--   signup_link  — captured from a rep's shareable link (?ref=<code>) at signup
--   invite       — the org's admin invited a user and that admin is a rep
--   admin_manual — manually set by a platform admin (writes attribution_changes)
CREATE TABLE "organization_attribution" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"    UUID NOT NULL,
  "attributed_to_user_id" UUID,               -- NULL = unattributed (org has a row but no rep yet)
  "method"             TEXT NOT NULL,         -- signup_link | invite | admin_manual
  "status"             TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | needs_review
  "conflict_detail"    TEXT,                  -- human-readable conflict explanation when needs_review
  "first_captured_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_modified_by"   UUID REFERENCES users(id),
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "organization_attribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_attribution_org_unique" UNIQUE ("organization_id"),
  CONSTRAINT "organization_attribution_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Every raw attribution capture, one row per attempt (append-only). This is
-- the trail 04's conflict review reads; organization_attribution is the
-- resolved current state. A duplicate capture with the SAME rep/code refets
-- is a no-op; a capture that differs from the resolved attribution raises
-- needs_review.
CREATE TABLE "attribution_captures" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"    UUID NOT NULL,
  "rep_code"           TEXT,                  -- share code seen on the link, if any
  "rep_user_id"        UUID REFERENCES users(id), -- resolved rep, if the code matched
  "method"             TEXT NOT NULL,          -- signup_link | invite | admin_manual
  "source"             TEXT,                   -- free-form source (clipboard link host, invite id)
  "resolved"           BOOLEAN NOT NULL DEFAULT false,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "attribution_captures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attribution_captures_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Reassignment log: every admin change of an org's attribution, with reason.
CREATE TABLE "attribution_changes" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL,
  "from_user_id"      UUID REFERENCES users(id),
  "to_user_id"        UUID REFERENCES users(id),
  "reason"            TEXT NOT NULL,
  "changed_by"        UUID NOT NULL REFERENCES users(id),
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "attribution_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attribution_changes_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "attribution_captures_org_idx" ON "attribution_captures"("organization_id", "created_at");
CREATE INDEX "attribution_changes_org_idx" ON "attribution_changes"("organization_id", "created_at");

ALTER TABLE "sales_reps"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_attribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attribution_captures"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attribution_changes"      ENABLE ROW LEVEL SECURITY;

-- Admin-only across the board. Match the repo's existing helper names.
CREATE POLICY "sales_reps_admin" ON "sales_reps"
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "organization_attribution_admin" ON "organization_attribution"
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "attribution_captures_admin" ON "attribution_captures"
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "attribution_changes_admin" ON "attribution_changes"
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

COMMIT;
```

Transaction-wrapped, FKs present, unique index on org, admin-only RLS on every table. After applying, mirror the tables into `prisma/schema.prisma` (match existing mirrored models like `SignupTriggerError`).

### Capture flow (in `handle_new_user`)

1. Read `ref` from `new.raw_user_meta_data`. Normalize (trim + lowercase).
2. If present, resolve against `sales_reps` by `code` where `is_active = true`.
3. Determine the signup's organization: the new org just created for a normal signup, or the invite's org (already handled by the invite branch — attribution runs AFTER the org is decided, in the same trigger, for BOTH branches).
4. Insert an `attribution_captures` row (method `signup_link` when ref present and matched; `invite` when no ref but the org invite was created by a rep).
5. Upsert `organization_attribution`: on conflict (org already attributed) do nothing UNLESS the existing row differs in rep → set `status = needs_review`, `conflict_detail` describing both sides.
6. Never throw. Any attribution error must be log-and-continue (the trigger's existing exception pattern; record into `signup_trigger_errors` with a message distinguishing attribution failures).

Keep a `record_attribution_code_is_active` helper if useful; prefer a single SECURITY DEFINER function `public.resolve_attribution_for_signup(p_org_id, p_ref)` so Prisma/app code can also call it (e.g. for invites created by reps via the admin UI, and the admin's "attach rep" action).

### Invite path

When the invite branch succeeds and the invite row is created by a platform user who is an ACTIVE sales rep, capture attribution method `invite` to that rep — unless a `ref` code is also present (ref wins; differing reps → needs_review).

### Admin UI (minimal — full reporting comes in task 04)

`/admin/attribution`:
- Table: Org · Rep · Method · Status · Captured · Actions.
- Filter: status (confirmed / needs_review), rep, method.
- Row action: **Reassign rep** (select rep + mandatory reason) → writes `attribution_changes` + updates `organization_attribution` + logs capture `admin_manual`.
- Row action: **Resolve conflict** (pick one of the captured reps, with reason shown).
- A "Conflicts needing review" summary card at top (count + list).
- Rep management (add/edit Code, active toggle) on the same page or `/admin/attribution/reps`.

## 6. Guardrails

- Attribution data is never exposed on any member-facing route or API. Add a test: a member-role request for their own org returns no attribution fields.
- `?ref=` is passed through user metadata only; the trigger validates the code against `sales_reps.is_active = true`. Never trust a client-supplied rep id.
- Never delete attribution rows: `attribution_changes` is append-only, `organization_attribution` is upsert-only, `attribution_captures` is insert-only.
- Every admin reassignment carries `reason` and `changed_by`.

## 7. Tests

- `handle_new_user` with a valid active rep code captures `signup_link`, resolves the org, marks `resolved`.
- Same code applied twice → one `organization_attribution` row, no needs_review, one capture row only on first.
- New signup via an invite created by a rep (no ref) → `invite` method, rep attributed.
- Signup with ref code while the org already has a DIFFERENT rep → status -> `needs_review` + conflict_detail, original attribution unchanged.
- Signup with a bogus/unknown ref code → no rep attributed, org has no attribution row (or needs_review), capture logged.
- A member-role Supabase query returns **zero rows** from `organization_attribution` / `attribution_captures`.
- Admin reassignment writes `attribution_changes` with reason and updates `organization_attribution`; blank reason is rejected.
- The existing signup/invite integration tests still pass (attribution must not break the invite logic).

## 8. Definition of done

- A rep's share link (`/signup?ref=<code>`) attributes the signee's org to that rep, admin-visible within minutes.
- Conflicts surface in `/admin/attribution` with both sides visible.
- Reassignment is reason-mandatory and fully logged.
- A member-role request can't see attribution exists (tests prove it).
- Task 04's schema references (`organization_attribution`, `attribution_changes`) exist with the exact names above.