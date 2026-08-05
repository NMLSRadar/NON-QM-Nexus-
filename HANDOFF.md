# NON-QM Nexus — Project Handoff / Status

Written for a coding-agent (Claude Code or similar) picking up this repo. Read
this before touching anything — it's the actual current state, not the
original plan (see `FINALIZE.md` for the original phased spec this evolved
from, and `docs/*.md` for feature-specific detail docs referenced below).

## What this product is

A mortgage decision-support / research platform for loan officers evaluating
Non-QM (non-qualified-mortgage) lending scenarios against lender program
guidelines. It is explicitly **not a lender** — it does not originate,
underwrite, or approve loans; every match/eligibility result is an estimate,
not a commitment (see `src/app/terms/page.tsx` for the exact legal framing).

## Stack

- **Frontend/backend:** Next.js (App Router), TypeScript, Tailwind CSS
  (`@tailwindcss/typography` for prose pages). Deployed on Vercel.
- **Database:** Supabase Postgres, accessed via Prisma ORM
  (`prisma/schema.prisma`). Row-Level Security (RLS) enforced per
  `organization_id` on every tenant-owned table — see
  `supabase/*.sql` files for policy definitions.
- **Auth:** Supabase Auth (email/password), custom SMTP routed through
  Resend (not Supabase's built-in rate-limited mailer).
- **Email:** Resend, verified sending domain `nonqmnexus.com`.
- **AI:** Anthropic or OpenAI (`AI_PROVIDER` env var selects provider) for
  PDF guideline extraction — see `src/lib/ai/provider.ts`.
- **Tests:** Vitest — 100 test files, 2,751 tests passing (`tests/domain/*`,
  `tests/e2e/*`, `tests/integration/*` — the latter against the LIVE
  Supabase database, not a mock). Run `REQUIRE_INTEGRATION=1 npm test` to
  also fail the run if every integration test was silently skipped
  (`tests/integration/requireIntegrationReporter.ts`).

## Infrastructure already live

- **Domain:** `nonqmnexus.com` (+ `www`), purchased via Cloudflare Registrar,
  DNS on Cloudflare, pointed at Vercel (A records `76.76.21.21`, DNS-only /
  not proxied), SSL provisioned, aliased as the Vercel production alias.
- **Vercel project:** `nmlsradars-projects/non-qm-navigator`.
- **GitHub repo:** `NMLSRadar/NON-QM-Nexus-`, branches `main` and
  `claude/non-qm-navigator-platform-eb0jhb` (kept in sync — push both).
- **Supabase project:** "NON QM Nexus", ref `sjwdfekcmbllbmkqzvwu`, region
  us-west-2.
- **Admin account:** `nonqmnexusadmin@gmail.com` (platform_admin=true).
- **Email:** Resend verified domain, custom SMTP wired into Supabase Auth
  config via the Management API (fixes both sender domain and a
  project-level `rate_limit_email_sent` setting that was capped at 2/hour).
- **Cron:** Vercel Cron hits `/api/cron/recheck-guidelines` weekly
  (`vercel.json`), auth'd via `CRON_SECRET`; the route itself only actually
  re-fetches a guideline once its `last_checked_at` is 6+ weeks old (42-day
  `RECHECK_INTERVAL_DAYS`), so the effective cadence per guideline is 6 weeks.

## Schema workflow (mandatory, since 2026-08-05 — supersedes the gotcha below for NEW changes)

Following the 2026-07-30 schema-drift data-loss incident (see
`docs/incident-2026-07-30-schema-drift.md`, "Verification results"), raw
`prisma db push --accept-data-loss` against the live database is retired
for new work. Every table/column change from now on:
1. Is modeled in `prisma/schema.prisma`.
2. Ships as a real, committed migration file in `prisma/migrations/`
   (created + applied via `prisma migrate`, e.g. `prisma migrate dev
   --create-only` to author it, `prisma migrate deploy` to apply it —
   `prisma migrate deploy` is the standing production path going forward).
3. Never raw hand-run SQL for schema (DDL) changes — `supabase/*.sql`
   remains the right place ONLY for policies, triggers, functions, and
   seeds, never table/column definitions.
4. One schema-writer at a time — confirm no other session is mutating the
   database before any schema step.
5. Any `--accept-data-loss` (or equivalent) prompt naming a NON-EMPTY
   object is a full stop: abort and report, never confirm through it.

The first migration committed under this workflow is
`prisma/migrations/20260805033308_add_signup_trigger_errors` (the
trigger-observability table, see the incident doc).

## Standing rules (read before touching anything)

- **Schema workflow** — see above; `prisma migrate deploy` is the
  production path, never raw `db push --accept-data-loss`.
- **One schema-writer at a time.** Before any migration/schema step,
  confirm no other session (human or agent) is currently mutating this
  database.
- **Stripe stays in TEST MODE.** Production Vercel has no live Stripe
  keys — see "Stripe billing status" below for what's actually configured
  and the exact live-mode cutover checklist.
- **Never commit ad-hoc report/analysis files** (incident write-ups,
  review reports, one-off audits) to the repo — those are delivered to the
  owner as chat text/files. Durable process docs belong in `docs/`.
- **Real secrets never get hardcoded or committed** — `.env.local` only,
  git-ignored; `.env.example` documents the full inventory (see below)
  with empty values.

## Environment variable inventory

See `.env.example` for the authoritative, always-current list with
context comments. Summary by purpose:

| Purpose | Variables |
|---|---|
| App URL | `NEXT_PUBLIC_APP_URL` |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |
| AI | `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Error tracking | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| Email | `RESEND_API_KEY`, `SUPPORT_EMAIL`, `EMAIL_UNSUBSCRIBE_SECRET`, `OWNER_POSTAL_ADDRESS`, `GUIDELINE_MONITOR_ALERT_EMAIL`, `BULK_MEMBERSHIP_NOTIFY_EMAIL` |
| Cron auth | `CRON_SECRET` |
| Files / links | `FILE_MAX_SIZE_MB`, `SHARED_LINK_SECRET` |
| Billing (Stripe, test mode) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| AE Directory | `AE_PLACEMENT_STRIPE_PRICE_ID`, `AE_MONETIZATION_ENABLED` (must stay `false` until pricing is finalized) |
| Build/deploy (Vercel-set, not user-configured) | `VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_BUILD_SHA`, `NEXT_RUNTIME` |

## Known operational gotcha (historical — applied to the old `db push` workflow)

`npx prisma db push` resets manually-added DB-level defaults
(`gen_random_uuid()`, `now()`, membership defaults) on tables it doesn't
fully own. **After every `prisma db push`, re-run, in order:**
```
supabase/id-defaults.sql
supabase/updated-at-defaults.sql
supabase/membership-defaults.sql
```
This is documented in `docs/membership.md` and has bitten this project
multiple times already. Not relevant going forward for schema changes made
via the migration workflow above (a real migration doesn't reset defaults
the way `db push` did) — kept here for historical context and in case
`db push` is ever used again for local/throwaway experimentation only.

## Features built (in build order)

1. **Auth & accounts** — signup/login, self-serve password change
   (`/account`), forgot-password flow (`/forgot-password`,
   `/reset-password`) with a fixed client-side race condition on token
   parsing.
2. **Real database repository** — `SupabaseRepository` (see `src/lib/store.ts`
   seam) replaced the original in-memory demo store; full Prisma schema
   pushed, RLS applied on every tenant table.
3. **Membership tiers** — `MembershipPlan` / `Discount` / `UserSubscription`
   models. Tiers: Essential ($60), Professional ($79), Enterprise ($100),
   gating lender visibility by `Lender.tierLevel`. **Currently
   admin-assigned only** (see "In progress" below — Stripe self-serve
   checkout is being built to replace this).
4. **Admin portal** — `/admin/plans`, `/admin/lenders`, `/admin/discounts`,
   `/admin/users`, `/admin/documents`, `/admin/monitoring` (nav in
   `src/app/admin/layout.tsx`).
5. **Self-serve subscription cancel/reactivate** — `cancel_own_subscription()`
   / `reactivate_own_subscription()` Postgres RPCs, with Resend confirmation
   emails (`src/lib/email.ts`, `src/lib/emailTemplates.ts`).
6. **Rebrand** — "NON-QM Nexus", white background / gold accent / black trim
   (`tailwind.config.ts` `brand` palette), logo as header badge + favicon +
   PWA icons.
7. **Bulk lender/program data import**, admin-only:
   - CSV import (`/admin/lenders`, `src/domain/validation/programImportSchema.ts`
     + `programImportRowSchema`), with a downloadable template
     (`public/lender-program-import-template.csv`).
   - PDF upload + AI extraction (`/admin/documents`,
     `src/domain/validation/programExtractionSchema.ts`,
     `src/lib/ai/provider.ts`'s `completeWithDocument`). AI-extracted
     programs are **never** auto-activated — an admin must review and
     approve each one (`src/app/admin/documents/review-actions.ts`
     `approveExtractedProgram`) before it becomes a real `Program` +
     `guideline_version` row (`verification_status: "human_verified"`).
8. **Security audit** — found and fixed a real RLS gap:
   `lenders_write`/`programs_write`/`guideline_versions_write`/`rules_write`
   policies previously let ANY `org_admin` (auto-granted to every signup)
   write catalog data directly, bypassing the admin-only upload UI. Fixed
   via `supabase/lender-catalog-write-lockdown.sql` (now requires
   `is_platform_admin()`), which required moving catalog self-seeding to a
   service-role client (`src/lib/repository/serviceRoleClient.ts`).
   Regression tests in `tests/integration/adminOnlyUploadAudit.test.ts`.
   Write-up in `docs/audit-admin-only-upload.md`.
9. **Real lender/program data** — 10 real, publicly-sourced DSCR programs
   across 9 lenders are LIVE (not sample data):

   | Lender | Program | Source note |
   |---|---|---|
   | Orion Lending | COIN DSCR | Full internal guideline PDF (user-supplied) |
   | Orion Lending | COIN X | Full internal guideline PDF (user-supplied) |
   | Angel Oak Mortgage Solutions | DSCR Loan | Public marketing page only — reserves/PPP not disclosed |
   | Acra Lending | Platinum DSCR | Full public matrix PDF |
   | A&D Mortgage | DSCR | Real DSCR-specific flyer (replaced a thinner base-guideline placeholder) |
   | LendSure Mortgage Corp. | Investor Cash Flow (DSCR) — 1-4 Unit | Real DSCR Wholesale Power program page |
   | GreenBox Loans | Elite Plus – DSCR | Full public matrix PDF |
   | BluePoint Mortgage | BlueXpanded DSCR | Real DSCR-specific matrix (initial fetch 403'd, retried successfully via a different fetch path) |
   | Carrington Mortgage Services | Flexible Advantage | Matrix file dated 2018 but confirmed still current via Carrington's official June 2026 guideline-update bulletin |
   | NQM Funding | Investor DSCR | Full master guideline PDF |

   Extraction was done **manually** (not via the app's own AI pipeline —
   the account's OpenAI key hit `insufficient_quota`), using
   `extract_document`/`image_analyze`-equivalent tooling, hand-validated
   against `extractedProgramSchema`, inserted as pending
   `document_extractions` rows, then approved through the same code path
   `approveExtractedProgram` uses (so nothing bypassed the review gate).
   **American Heritage Lending excluded** — no public guideline source
   exists (broker-portal only); would need user-supplied PDFs.
10. **Automated guideline re-check monitoring** —
    `src/app/api/cron/recheck-guidelines/route.ts`: Vercel Cron triggers it
    weekly, but each guideline is only actually re-fetched once its
    `last_checked_at` is 6+ weeks old (42-day `RECHECK_INTERVAL_DAYS`
    constant in the route) — SHA-256-hashes the content, compares to the
    stored `content_hash`. Unchanged just
    updates `last_checked_at`; a real change sets `change_detected=true` and
    emails the admin via Resend — **never edits program data automatically**.
    New admin page `/admin/monitoring` (`src/app/admin/monitoring/page.tsx`)
    surfaces status. `GuidelineVersion` gained `source_url`, `content_hash`,
    `last_checked_at`, `change_detected` columns for this.
11. **PWA (installable app)** — `public/manifest.json`, `public/sw.js`
    (network-first for navigations, falls back to cached shell only when
    offline — never caches API/auth responses), icons generated from the
    logo, `src/components/pwa-register.tsx`. Same codebase/deploy as the
    website — installing it just launches the live site full-screen; every
    future deploy is reflected immediately, no separate build step. This is
    NOT a native app-store listing (that would need Capacitor or a full
    React Native rebuild — discussed but not started).
12. **Legal pages** — `/terms`, `/privacy` (`src/app/terms/page.tsx`,
    `src/app/privacy/page.tsx`), written specifically for this app's actual
    behavior (not-a-lender disclaimer, AI-extraction-requires-human-review
    clause, data access/deletion via `legal@nonqmnexus.com`). Both carry an
    explicit in-page note that they need licensed-attorney review before
    being treated as final/binding, and the governing-law section is a
    placeholder pending the operator forming an LLC. `legal@nonqmnexus.com`
    is meant to forward to `nonqmnexusadmin@gmail.com` via Cloudflare Email
    Routing — confirm this was actually completed by the user (it required
    manual Cloudflare dashboard steps I can't do myself).

## Stripe billing status (complete in test mode, 2026-08-05)

Self-serve Stripe Checkout + Billing is fully built and verified live in
Stripe TEST MODE — the plan below (originally sketched as "IN PROGRESS")
is done:

- All 3 `membership_plans` rows (Essential $99, Professional $125,
  Enterprise $150) have a real test-mode `stripe_price_id` whose Stripe
  amount matches the DB row exactly (verified live via the Stripe API).
- Per-seat team pricing (`stripe_team_price_id` / `stripe_team_annual_price_id`)
  is configured for every plan (`scripts/stripe-team-billing.js`).
- Checkout (personal + team, `mode: "subscription"`), the webhook endpoint
  (`/api/webhooks/stripe` — the single writer of Stripe-sourced
  subscription/seat state, verified via `STRIPE_WEBHOOK_SECRET`), and the
  Customer Portal are all wired.
- Full end-to-end verified live against the real database
  (`scripts/stripe-b4-full-e2e.ts`, run against a local `next dev` server):
  real card 4242 (via Stripe's `pm_card_visa` test token) checkout →
  real webhook event delivered → `user_subscriptions` row created → tier
  access confirmed → cancel (portal-equivalent) → access revoked; team
  checkout at quantity=3 → webhook-confirmed `seat_count` → seat update to
  5 → webhook-confirmed again.
- `stripeWebhook`, `trialEmailCron`, `teamStripeLifecycle`, and
  `pricingLenderCountPin` integration suites all run live now (test
  credentials in place) instead of self-skipping.
- Comped (no-Stripe) subscriptions continue to work exactly as before —
  admin sets `source: "comped"`, no Stripe object involved.

**Production Vercel has NO Stripe keys configured — intentionally, per the
launch gate.** Live-mode cutover (owner-executed only, when ready to accept
real payments) needs, in order:
1. Create the real live-mode Products/Prices in the Stripe dashboard (live
   mode, not test) matching the same 3 plans + team per-seat prices.
2. Re-point each `membership_plans` row's `stripe_price_id` /
   `stripe_team_price_id` / `stripe_team_annual_price_id` at the new live
   Price ids (a small one-off script, same shape as
   `scripts/stripe-setup-products.js` but reading existing live Price ids
   instead of creating test ones).
3. Register a live-mode webhook endpoint
   (`https://nonqmnexus.com/api/webhooks/stripe`) and get its live signing
   secret.
4. Set `STRIPE_SECRET_KEY` (live `sk_live_...`), `STRIPE_WEBHOOK_SECRET`
   (the new live one), and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live
   `pk_live_...`) in Vercel's production environment variables.
5. Roll/rotate the test-mode keys once live mode is confirmed working (old
   test keys can stay valid for local dev — they're a different mode
   entirely, no need to revoke).

## Team Membership (org subscriptions & seats) — schema live, Stripe billing complete

One subscription, N seats, one bill for a whole brokerage — full spec and
incident writeup in `docs/team-membership.md`, and the full incident
closure/verification in `docs/incident-2026-07-30-schema-drift.md`.
Summary: the schema is live, the 2026-07-30 schema-drift incident is
closed (lost `trial_campaigns` row recreated, trigger-observability
hardening added — see the incident doc's "Verification results"), and
`REQUIRE_INTEGRATION=1 npm test` passes fully live (0 skips). Two real
problems were hit and fixed during the original deployment:
1. `prisma db push` initially ran against a stale `prisma/schema.prisma`
   that didn't reflect the trial system / citation monitoring / AE
   Directory tables (all added via raw SQL only, never added to Prisma's
   schema file) — it dropped those tables/columns. Structure was restored
   immediately and ALL of them are now added to `prisma/schema.prisma`,
   and (2026-08-05) `prisma db push` is retired in favor of the committed
   migration workflow above, so this class of incident can't recur. Real
   data loss: 230 trial-user status values (Supabase PITR was not run /
   not available — unrecovered; new trial activations work normally), 77
   citation-check rows (self-repopulated by the recurring cron), 1
   trial-campaign row (recreated 2026-08-05, live again at slug
   `loan-officer-beta`).
2. The invite-signup trigger's `digest()` call needed `extensions.digest()`
   (pgcrypto lives in the `extensions` schema on Supabase) — fixed, plus a
   permanent exception-handler safety net that (as of 2026-08-05) also
   logs to `signup_trigger_errors` instead of failing silently.

**Stripe team billing is complete** — see "Stripe billing status" above.
Comped (no-Stripe) org subscriptions also still work today via
`/admin/teams`.

## IN PROGRESS — Bulk Membership, 2026-07-31

A single unified system for a brokerage to buy 1-500 loan officer seats
in one deal at a **custom-negotiated price** (not a public tier) — built
additively on top of Team Membership above, reusing its organizations /
memberships / org_subscriptions / org_invites tables and coverage
resolver rather than a parallel system. Full design, deployment steps,
and file list in `docs/bulk-membership.md`. Explicitly does NOT touch the
existing 3-tier self-serve system (pricing, feature gating, or code) —
confirmed by request from the owner.

**Status: code complete, not yet deployed.** This session had no
`DATABASE_URL`/Stripe keys (cleared between sessions), so
`prisma/schema.prisma`'s new fields and `supabase/bulk-membership-
schema.sql` have not been pushed to the live DB. `npx prisma validate`
passes, `tsc --noEmit` and `next lint` are clean, and all 2486 existing
domain tests still pass unchanged. See `docs/bulk-membership.md`'s
"Deployment status" for the exact commands to finish (db push + rerun
the defaults scripts per the gotcha above + the new SQL file + real
Stripe keys for card/invoiced billing modes — comped works with no
Stripe keys at all).


## AE Directory, Sponsored Placement & Outreach System, 2026-07-30

A second revenue line: lender-side Account Executives (AEs) pay a flat
monthly subscription for featured placement in the platform's AE contact
directory. Full compliance shape is RESPA Section 8 conservative
(advertising-placement pricing only — never per-lead/click/referral/
closed-loan; sponsorship never touches lender/program matching,
eligibility, or ranking — see `tests/domain/aeSponsorshipIsolation.test.ts`).

**Schema** (`supabase/ae-directory.sql`, applied live via
`scripts/apply-sql.mjs` — this environment has no `psql` binary):
`ae_profiles` (lender_id, name, title, email, phone, nmls_id, states,
photo_url, claimed_by_user_id, status: unclaimed/claimed/hidden),
`ae_profile_events` (view/click_phone/click_email — counts only, NEVER a
stored viewer identity), `ae_placements` (status: none/active/canceled,
source: stripe/comped), `outreach_contacts`, `email_suppressions`
(global — checked by every commercial send), `outreach_sends`.
`lenders.email_domain` added for claim auto-approval. **Note:**
`audit_logs` already existed in this database with its own real schema
(`organization_id`, `actor_user_id`, `action`, `entity_type`,
`entity_id`, `metadata` jsonb) — the comp/revoke actions write to that
real shape (reason lives in `metadata`), not an invented one.

**Feature flag:** `AE_MONETIZATION_ENABLED` (env var, default `false`,
set on Vercel). When false, `/ae/subscribe` shows "coming soon" and no
checkout is reachable — flip it once subscriber volume justifies it.

**New env vars (set on `.env.local` + Vercel production this session):**
`OWNER_POSTAL_ADDRESS` (CAN-SPAM — real business address, requested from
the user), `AE_PLACEMENT_STRIPE_PRICE_ID` (from
`scripts/stripe-setup-products.js`, extended to create the "AE Featured
Placement" $49/mo test-mode product), `AE_MONETIZATION_ENABLED`,
`EMAIL_UNSUBSCRIBE_SECRET` (generated — HMAC key for signed, no-login
one-click unsubscribe tokens).

**Pages:** `/ae/claim` (existing-user claim flow, auto-approves on
matching email domain), `/ae/dashboard` (self-edit + last-3-months
stats), `/ae/subscribe` (Stripe Checkout, test mode), lender detail
pages' new "Account Executives" section, `/admin/ae-profiles` (CRUD +
CSV import + email-domain management + comp/revoke placement),
`/admin/outreach` (prospect list, live-stats email preview, rate-limited
send — admin-triggered only, no cron).

**Two real bugs found and fixed while writing the required tests** (see
`tests/integration/aeClaimSecurity.test.ts` and
`aePlacementLifecycle.test.ts` for the exact repro): the claim action's
write initially ran through the RLS-subject client and silently no-op'd
(fixed — now uses the service-role client, gated by the function's own
application-level authorization logic); and the comp/revoke actions
initially assumed a wrong `audit_logs` shape (fixed — adapted to the
real pre-existing table).

**Not done (flagged for owner input):** the RESPA Section 8 attorney
review and CAN-SPAM postal-address confirmation this feature needs
before `AE_MONETIZATION_ENABLED` is ever flipped to `true` — added to
`docs/legal-agenda.md`. A monthly stats email cron for claimed AEs was
explicitly deferred (spec said not to build it this pass).

## Other known outstanding items (not started)

- **OpenAI billing** — the `OPENAI_API_KEY` configured for
  `/admin/documents`'s in-app AI extraction hit `insufficient_quota`. Fine
  for now (the 10 real programs were extracted manually, bypassing this),
  but any *future* ad-hoc PDF upload through the actual admin UI won't work
  until the user funds that OpenAI account.
- **Lender coverage** — only 9 of the user's ~49-lender target list are in.
  American Heritage Lending has zero public source (broker-portal only).
- **Sentry / error monitoring** — none configured; a production bug
  currently only surfaces via user report.
- **App Store / Google Play** — only the PWA exists; native listing would
  need Capacitor (wrap the existing site) or a full React Native rebuild —
  discussed with the user, not started, and explicitly framed as a bigger
  follow-up, not default scope.
- **PR/branch-protection workflow** — currently pushes go straight to
  `main`; fine solo, worth revisiting if more contributors join.
- **LLC formation** — referenced by the Terms of Service governing-law
  placeholder; update that section once formed (name + state).

## Credentials & tokens — DO NOT hardcode, ask the user fresh each time

- GitHub PAT, Vercel token, and Supabase Management API token are all
  **short-lived / single-use in this environment** — the user must supply a
  fresh one for each push/deploy/Supabase-Management-API session. Never
  assume a previously-used token still works.
- `.env.local` holds the real secrets locally (`DATABASE_URL`,
  `RESEND_API_KEY`, `AI_PROVIDER`, `OPENAI_API_KEY`, `CRON_SECRET`,
  `NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY` [currently WRONG, see above],
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) — mirror any new one to Vercel via
  `vercel env add NAME production` when a fresh Vercel token is available.

## Verification checklist before shipping ANY change here

```
npm run typecheck
npm run lint
npm test            # expect 139 passing as of this handoff
npm run build
npm run seed:check   # sanity-checks the sample scenario set still evaluates correctly
```
Then `git add -A && git commit`, push to **both** `main` and
`claude/non-qm-navigator-platform-eb0jhb`, then `vercel deploy --prod`.
