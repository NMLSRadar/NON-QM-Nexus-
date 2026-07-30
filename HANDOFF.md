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
- **Tests:** Vitest — 139 tests passing (`tests/domain/*`, `tests/integration/*`,
  the latter against the LIVE Supabase database, not a mock).

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
- **Cron:** Vercel Cron hits `/api/cron/recheck-guidelines` on the 1st and
  15th of each month (`vercel.json`), auth'd via `CRON_SECRET`.

## Known operational gotcha (important — will bite you)

`npx prisma db push` resets manually-added DB-level defaults
(`gen_random_uuid()`, `now()`, membership defaults) on tables it doesn't
fully own. **After every `prisma db push`, re-run, in order:**
```
supabase/id-defaults.sql
supabase/updated-at-defaults.sql
supabase/membership-defaults.sql
```
This is documented in `docs/membership.md` and has bitten this project
multiple times already.

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
    `src/app/api/cron/recheck-guidelines/route.ts`: on the 1st/15th monthly,
    fetches each `human_verified` guideline's `source_url`, SHA-256-hashes
    the content, compares to the stored `content_hash`. Unchanged just
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

## IN PROGRESS — Stripe self-serve billing (NOT complete, currently blocked)

Goal: replace admin-assigned `UserSubscription` rows with live Stripe
Checkout + Billing, per the architecture this project's own `FINALIZE.md`
Phase 7 sketched (adapted here to the *per-user* `MembershipPlan` /
`UserSubscription` schema that actually exists, not the aspirational
per-organization model in that doc).

**Done so far:**
- `stripe` npm package installed.
- Schema additions (already pushed to the live DB via `prisma db push
  --accept-data-loss`, defaults re-applied per the gotcha above):
  - `User.stripeCustomerId` (unique, nullable — created lazily on first
    checkout).
  - `MembershipPlan.stripePriceId` (unique, nullable — the Stripe recurring
    Price id for that tier).
  - `UserSubscription` gained: `source` (`"stripe"` | `"comped"`, defaults
    `"comped"`), `stripeCustomerId`, `stripeSubscriptionId` (unique),
    `stripeStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd`.
- `scripts/stripe-setup-products.js` written (NOT yet successfully run) —
  one-off script that creates a Stripe Product + monthly recurring Price
  per active `membership_plans` row and writes the price id back onto the
  plan. Idempotent (skips a plan that already has `stripe_price_id`).
- Test-mode Stripe keys obtained from the user (`dashboard.stripe.com/test/apikeys`,
  confirmed test mode via a screenshot). Publishable key
  (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) is in `.env.local` and looks
  syntactically valid. **The secret key currently in `.env.local` as
  `STRIPE_SECRET_KEY` is WRONG** — it was transcribed from a screenshot
  (image OCR/manual read) rather than pasted as text, and Stripe rejected it
  with `StripeAuthenticationError: Invalid API Key provided` (401) when
  `scripts/stripe-setup-products.js` was run. The user was asked to
  copy-paste the secret key directly instead of screenshotting it again, but
  the conversation was interrupted before they answered.

**Next steps to actually finish this feature, in order:**
1. **Get the correct `STRIPE_SECRET_KEY` from the user as pasted text** (not
   an image) and update `.env.local` (and later, Vercel env vars via
   `vercel env add STRIPE_SECRET_KEY production` — needs a fresh Vercel
   token from the user, tokens are single-use/short-lived in this
   environment).
2. Run `node scripts/stripe-setup-products.js` to create the 3 Stripe
   Products/Prices and populate `membership_plans.stripe_price_id`.
3. Build a checkout server action/route: creates a Stripe Checkout Session
   (`mode: "subscription"`) for the chosen plan's price id, using or
   creating the user's `stripeCustomerId`, with `success_url`/`cancel_url`
   back to the app, `allow_promotion_codes: true` (so Stripe's own
   Promotion Codes feature covers the discount use case without extra
   custom code — see `Discount` model's existing role for *comped*
   access, which should remain separate/admin-only).
4. Build the webhook endpoint (e.g. `/api/webhooks/stripe`) — **the single
   writer of Stripe-sourced subscription state**, verifying
   `STRIPE_WEBHOOK_SECRET`:
   - `checkout.session.completed` → upsert `UserSubscription` with
     `source: "stripe"`, the resolved `planId` (map from the Price id back
     to `membership_plans.stripe_price_id`), `stripeCustomerId`,
     `stripeSubscriptionId`, clear `canceledAt`.
   - `customer.subscription.updated` → sync `stripeStatus`,
     `currentPeriodEnd`, `cancelAtPeriodEnd`.
   - `customer.subscription.deleted` → set `canceledAt = now()`.
   - `invoice.payment_failed` → reflect `past_due` status, consider an
     email alert to the user.
   - The webhook endpoint can be registered via the Stripe API itself
     (`POST /v1/webhook_endpoints`) once the app's public URL is known
     (`https://nonqmnexus.com/api/webhooks/stripe`) — this returns the
     signing secret directly, no manual dashboard step needed.
5. Add a "Manage Billing" link using the Stripe Customer Portal
   (`stripe.billingPortal.sessions.create`) so users can update payment
   method, view invoices, and cancel without any custom UI.
6. Update the existing self-serve cancel/reactivate flow (`/account`) so it
   calls Stripe's API (cancel-at-period-end, or resume) for `source:
   "stripe"` subscriptions, instead of just flipping the local `canceledAt`
   flag — the local flag should end up as a *reflection* of Stripe's state
   (via the webhook), not the thing that directly grants/revokes access for
   paid subscribers. Comped subscriptions keep working exactly as today
   (admin sets `source: "comped"`, no Stripe object involved).
7. Update `/pricing` (and wherever plans are shown) with real
   "Subscribe"/"Manage Billing" buttons instead of (or alongside) the
   existing admin-assignment-only UI.
8. **Test the full flow with Stripe test cards** (e.g. `4242 4242 4242
   4242`) before ever touching live keys — checkout → webhook fires →
   `UserSubscription` created correctly → tier access unlocked → cancel →
   webhook fires → access revoked at period end.
9. Only after full test-mode verification, swap in the user's live keys
   (`pk_live_...` / `sk_live_...` — already provided once earlier in this
   project's history; do not reuse them without re-confirming with the user
   they still want to go live at that point) and re-register the
   production webhook endpoint.
10. Add tests: webhook signature rejection, checkout → entitlement sync,
    cancel → entitlement revoked, comped access unaffected by any of this.

## IN PROGRESS — Team Membership (org subscriptions & seats), 2026-07-30

One subscription, N seats, one bill for a whole brokerage — full spec and
current status in `docs/team-membership.md`; read that before touching
this feature. **Schema is written (Prisma + `supabase/team-membership-
*.sql`) but NOT yet pushed to the live database** — blocked on a fresh
`DATABASE_URL` (blank in `.env.local` when this was built; the user was
asked and didn't supply one in this session). Everything else — resolver,
invite flow (with the invited-signup auto-org fix), Stripe team pricing +
checkout + webhook handling, `/account/team` UI, pricing page Teams panel,
and a full test suite (all gated to skip cleanly until the schema is live)
— is built and passing typecheck/lint/the existing test suite (2601
passing, 0 regressions). `docs/team-membership.md`'s "Deployment status"
section has the exact remaining commands to run once a real
`DATABASE_URL` + Stripe secret key are available.

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
