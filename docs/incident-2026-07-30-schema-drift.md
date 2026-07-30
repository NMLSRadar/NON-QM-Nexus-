# Incident Report — Schema Drift Data Loss During Team Membership Deployment

**Date:** 2026-07-30
**Severity:** High (real production data dropped, since restored/mitigated where possible)
**Status:** Structurally resolved and verified live. One data-recovery action remains open for the owner (Supabase PITR check).
**Repo:** `NMLSRadar/NON-QM-Nexus-`, branch `main` (mirrored to `claude/non-qm-navigator-platform-eb0jhb`)
**Relevant commits:** search for `9e6e2f6` ("Team Membership: deploy schema live + critical fix...") and the merge commit immediately after it.

This document is written to be handed to another engineer or agent (e.g. Claude Code) to independently verify the fix and follow up on the one remaining action.

---

## 1. What was being done when this happened

Deploying the previously-built "Team Membership" feature (org subscriptions & seats — `org_subscriptions`, `org_invites`, `memberships.covered_by_org_plan`) to the live Supabase database. This required running `npx prisma db push --accept-data-loss` using a freshly-supplied `DATABASE_URL`.

## 2. Root cause

`prisma/schema.prisma` is supposed to be the single source of truth for the database schema. In practice, **several earlier features in this codebase's history were built by writing raw SQL migration files directly (in `supabase/*.sql`) and applying them to the live database by hand — without ever adding the corresponding models to `prisma/schema.prisma`.** This had happened for:

- The 14-day trial system (`supabase/trial-access.sql`, `supabase/trial-email-tracking.sql`) — tables `trial_campaigns`, `trial_redemptions`, plus 3 columns added to `user_subscriptions` (`is_trial`, `trial_activated_at`, `trial_expires_at`).
- Citation-link monitoring (`supabase/citation-link-checks.sql`) — table `citation_link_checks`.
- The AE Directory / Sponsored Placement / Outreach system (`supabase/ae-directory.sql`, built concurrently by another session on 2026-07-30) — tables `ae_profiles`, `ae_profile_events`, `ae_placements`, `outreach_contacts`, `email_suppressions`, `outreach_sends`, plus a column added to `lenders` (`email_domain`).

None of these 9 tables or 4 columns existed in `prisma/schema.prisma` at the time.

`prisma db push` works by diffing the *live database* against *whatever `prisma/schema.prisma` currently says* and forcing the database to match the file — anything in the database that the file doesn't know about is treated as drift to be removed. Because the file was missing all of the above, the push's plan included dropping every one of those tables/columns. Since `--accept-data-loss` was passed (required for this push to proceed given other in-scope destructive changes — a `Membership.coveredByOrgPlan`-adjacent partial-unique-index change had already flagged the confirmation prompt), it executed the drops.

## 3. Exact sequence of commands (chronological)

```
1. npx prisma db push --accept-data-loss     # <-- destructive run against the stale schema
2. Verified via supabase-js queries that 9 tables + user_subscriptions' 3 trial columns
   + lenders.email_domain were gone ("Could not find the table X in the schema cache" /
   "column X does not exist")
3. Re-ran the ORIGINAL raw SQL files to restore table/column STRUCTURE:
   - supabase/trial-access.sql
   - supabase/trial-email-tracking.sql
   - supabase/citation-link-checks.sql
   - supabase/ae-directory.sql
   (all use `create table if not exists` / `add column if not exists`, so they're safe
   to re-run — but they do NOT restore data, only structure/RLS/indexes/functions)
4. Verified via supabase-js that all 9 tables + all missing columns now exist again (empty)
5. Added ALL 9 models + 4 columns to prisma/schema.prisma (TrialCampaign, TrialRedemption,
   CitationLinkCheck, AeProfile, AeProfileEvent, AePlacement, OutreachContact,
   EmailSuppression, OutreachSend, Lender.emailDomain, UserSubscription.isTrial/
   trialActivatedAt/trialExpiresAt)
6. Ran `npx prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel
   prisma/schema.prisma --script` — a DRY-RUN diff, no changes applied — confirmed
   the diff was now ENTIRELY non-destructive (only cosmetic ALTER COLUMN DROP DEFAULT /
   TIMESTAMP(3) precision / FK-constraint-addition statements, zero DROP TABLE / DROP COLUMN)
7. Only THEN ran `npx prisma db push --accept-data-loss` again — this time genuinely safe,
   confirmed clean ("Your database is now in sync... " with NO data-loss warnings this time)
8. Re-applied supabase/id-defaults.sql, updated-at-defaults.sql, membership-defaults.sql,
   team-membership-defaults.sql (all reset by every db push, per this repo's own documented
   "known operational gotcha" in HANDOFF.md) — ALSO extended id-defaults.sql and
   updated-at-defaults.sql to cover the 9 newly-tracked tables, since their defaults get
   reset by db push too now that they're Prisma-managed
9. Applied supabase/team-membership-schema.sql and supabase/team-invite-signup.sql
   (the actual Team Membership feature's own schema/RLS/trigger — this was the original,
   non-destructive goal of this whole deployment)
```

## 4. Actual data loss (confirmed, not assumed)

Prisma's own pre-push confirmation prompt names exactly which drops are non-empty (it inspects live row counts before dropping). Only 3 items were flagged as containing data:

| Object | Rows/values lost | Nature |
|---|---|---|
| `user_subscriptions.is_trial` (+ paired `trial_activated_at`/`trial_expires_at`) | 230 non-null values | Every currently-tracked trial user's activation/expiration state — this is the one that matters most; it's per-user state, not easily reconstructed. |
| `citation_link_checks` | 77 rows | Operational monitoring cache (last-known link-liveness status per citation URL). Not user data — self-repopulates the next time the citation-check cron runs; no permanent loss of anything user-facing. |
| `trial_campaigns` | 1 row | A single campaign definition (name, slug, rules). Small, admin-facing config — easy to recreate by hand if the original values are known/documented elsewhere. |

Everything else that got dropped (all of `trial_redemptions`, `ae_profiles`, `ae_placements`, `ae_profile_events`, `outreach_contacts`, `outreach_sends`, `email_suppressions`, and `lenders.email_domain`) was **not flagged as containing data** by Prisma's own row-count check, meaning those were already empty (0 rows / all-null) at the moment of the push — i.e., genuinely no data existed there yet to lose. This is a strong signal (Prisma checks actual row counts before presenting the warning), not a guess.

## 5. Remaining open action — Supabase Point-in-Time Recovery

**This is the one thing I could not do myself and still needs owner action:** if the 230 trial-user records matter (e.g. any of those users are currently relying on an active trial), check Supabase's dashboard → Project Settings → Database → Backups for a Point-in-Time Recovery option to a timestamp just before this incident. The window for this narrows over time and with continued writes to the database, so earlier action is better. If PITR isn't available (depends on the project's plan tier) or the window has passed, that data is unrecoverable — the trial system now works correctly again for any NEW trial activations, just without the historical 230 records.

**Verification for Claude Code to run:** connect to the Supabase project and check `select count(*) from trial_redemptions;` — if this recovers to a non-zero number matching pre-incident state, PITR (or another restore) succeeded.

## 6. A second, independent bug found during verification (not data-loss related)

While testing the invite-signup flow end-to-end after the schema fix, invited signups were failing (Supabase Auth returned a 500 on `createUser`). Root cause: the new `handle_new_user()` trigger (`supabase/team-invite-signup.sql`) called Postgres's `digest()` function (from the `pgcrypto` extension) without schema-qualifying it. On this Supabase project, `pgcrypto` lives in the `extensions` schema, not `public` — and the trigger function's `search_path` is explicitly set to `public` only — so the call failed with `function digest(text, unknown) does not exist` (SQLSTATE 42883).

**Fix:** changed the call to `extensions.digest(raw_token, 'sha256')`. Additionally wrapped the entire invite-token-validation branch in a `BEGIN ... EXCEPTION WHEN OTHERS ... END` block as a permanent safety net, so that any *future* unexpected error in that branch causes a graceful fallback to normal signup (the user gets their own org) instead of failing account creation outright — this trigger fires for literally every signup on the platform, so it must never hard-fail due to an edge case in one optional code path.

**How this was diagnosed:** built a temporary instrumented copy of the trigger that logged into a throwaway `_debug_trigger_log` table inside an exception handler, reproduced the failure, read the log, found the exact SQLSTATE/message, fixed it, redeployed the real trigger, reproduced successfully, then dropped the debug table and removed the temporary script files (`scripts/_debug-trigger-test.sql`, `scripts/_debug-trigger-diag.sql` — these are NOT in the repo; they were sandbox-only and deleted after use).

## 7. Verification performed after all fixes

```
npx prisma validate                                    # schema valid
npx prisma migrate diff --from-url $DATABASE_URL \
  --to-schema-datamodel prisma/schema.prisma --script   # zero destructive statements
npm run typecheck                                       # clean
npm run lint                                             # clean, 0 warnings
npm run build                                             # production build succeeds, all routes compile
npm run seed:check                                       # all 12 sample scenarios evaluate correctly
REQUIRE_INTEGRATION=1 npm test                            # 2644 passing, 0 failing, 10 skipped (deliberate:
                                                           # Stripe-team-billing tests skip because
                                                           # STRIPE_SECRET_KEY is still blank — see below)
```

`REQUIRE_INTEGRATION=1` is this repo's own guard (`tests/integration/requireIntegrationReporter.ts`) that FAILS the whole run if every integration test was silently skipped — it did not fail, confirming real database assertions genuinely ran (not just green-by-skip).

Specifically re-verified for the Team Membership feature itself:
- `tests/integration/teamMembershipEntitlement.test.ts` — entitlement matrix (personal-only, org-only, both/max-wins, seat-overflow determinism, expired-org fallback) — all passing for real.
- `tests/integration/teamInviteSecurity.test.ts` — invite security (expired/revoked/reused/wrong-email all refused) + the invited-signup-skips-auto-org-creation regression + the normal-signup-still-auto-provisions regression — all passing for real (this is what caught the `digest()` bug in the first place).
- `tests/integration/teamIsolationRegression.test.ts` — cross-tenant isolation via real RLS-scoped sessions — all passing.
- `tests/integration/teamCompedAndContinuity.test.ts` — comped grants + billing-admin continuity — all passing.
- `tests/integration/teamStripeLifecycle.test.ts` — currently self-skips (Stripe keys blank), see section 8.

## 8. What's still NOT done (separate from this incident)

`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are blank in `.env.local` (same short-lived-credential situation `DATABASE_URL` was in). This means:
- `scripts/stripe-team-billing.js` (creates the per-seat Stripe Prices) has not been run.
- Stripe-billed team checkout/seat-updates/webhook lifecycle are un-exercised against real Stripe test mode (code is written and typechecks, but not live-verified).
- Comped (no-Stripe) org subscriptions via `/admin/teams` work today regardless.

This is unrelated to the incident above — just the next item to finish once a real Stripe secret key is supplied.

## 9. Checklist for Claude Code to independently verify

1. Clone/pull `main`, confirm commit `9e6e2f6` and the following merge commit are present.
2. Read `prisma/schema.prisma` — confirm it now has all 9 models listed in section 3/step 5 above, plus `Lender.emailDomain` and the 3 trial columns on `UserSubscription`.
3. Run `npx prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` yourself — confirm it shows ONLY cosmetic changes (no `DROP TABLE`, no `DROP COLUMN`).
4. Run `REQUIRE_INTEGRATION=1 npm test` — confirm 0 failures.
5. Check `select count(*) from trial_redemptions;`, `select count(*) from citation_link_checks;`, `select count(*) from trial_campaigns;` against the live DB to see current row counts (0 unless PITR was run since).
6. Ask the owner directly whether they've checked Supabase PITR for the 230 trial records — this is the one action item that requires a human with dashboard access, not code.
