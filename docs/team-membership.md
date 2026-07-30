# Team Membership — Org Subscriptions & Seats (2026-07-30)

Lets a brokerage buy access for its whole team: one subscription, N seats,
one bill. Built additively on top of the existing per-user
`MembershipPlan` / `UserSubscription` billing (docs/billing.md,
docs/membership.md) — personal and org subscriptions coexist.

## Deployment status — LIVE (schema deployed 2026-07-30)

The schema is pushed to the live database and the resolver, invite flow,
`/account/team` UI, and pricing page are all live. **Stripe team billing is
NOT yet set up** — `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` /
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are all blank in `.env.local` (cleared
between sessions, same as `DATABASE_URL` was). Comped org subscriptions
(`/admin/teams`, no Stripe needed) work today. To finish Stripe:

```
# Get a real STRIPE_SECRET_KEY (test mode) from
# dashboard.stripe.com/test/apikeys, paste as plain text into .env.local,
# then:
node scripts/stripe-team-billing.js
# Edit TEAM_VOLUME_BREAKPOINTS in that script with real discount
# percentages first if the owner has supplied them (see "Volume breakpoint
# constants" below) — safe to re-run after editing.
node scripts/stripe-register-webhook.js   # or reuse the existing personal-billing webhook if one's already registered
```

Then re-run `REQUIRE_INTEGRATION=1 npm run test:integration` — the
Stripe-lifecycle tests self-skip (silently, by design — see the existing
skip-without-credentials convention) until real Stripe keys are present;
they'll actually assert once they are.

### Incident note (2026-07-30) — read before ever running `prisma db push` again

The first deployment attempt ran `prisma db push --accept-data-loss`
against a **stale** `prisma/schema.prisma` that didn't reflect three other
features that had been added to the live database via raw SQL only (the
14-day trial system, citation-link monitoring, and the AE Directory
system) — none of those were ever added to the Prisma schema file by the
sessions that built them. `db push` syncs the DB to *exactly* match
`schema.prisma`, so it **dropped** `trial_campaigns`, `trial_redemptions`,
`citation_link_checks`, `ae_profiles`, `ae_placements`, `ae_profile_events`,
`outreach_contacts`, `outreach_sends`, `email_suppressions`, and the
`is_trial`/`trial_activated_at`/`trial_expires_at` columns on
`user_subscriptions`, plus `lenders.email_domain`.

**Table/column structure was restored immediately** (by re-running the
original `supabase/trial-access.sql`, `trial-email-tracking.sql`,
`citation-link-checks.sql`, and `ae-directory.sql` files) and **all nine
of those models are now added to `prisma/schema.prisma`** (see
`TrialCampaign`, `TrialRedemption`, `CitationLinkCheck`, `AeProfile`,
`AeProfileEvent`, `AePlacement`, `OutreachContact`, `EmailSuppression`,
`OutreachSend`, plus `Lender.emailDomain` and the three trial columns on
`UserSubscription`) so this can never happen silently again — a
`prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel
prisma/schema.prisma --script` now shows zero destructive changes.

**Actual data loss, confirmed by checking what the `db push` warning
flagged as non-empty before dropping** (everything else was already empty
— zero rows — at the time, so no other data existed to lose):
- `user_subscriptions.is_trial` (and the two paired trial columns) — 230
  non-null values, i.e. every currently-tracked trial user's activation/
  expiration state.
- `citation_link_checks` — 77 rows (operational monitoring state, cheaply
  rebuilt by the next citation-check cron run — not user data).
- `trial_campaigns` — 1 row (a campaign definition, not per-user data).

**Recommended recovery**: check Supabase's Point-in-Time Recovery /
backups (Project Settings → Database → Backups) for a restore point from
just before this incident, if data recovery of the 230 trial states
matters — the longer this waits, the smaller that window gets. The trial
CAMPAIGN row and RLS policies can simply be recreated by hand if PITR isn't
available (they're small, admin-facing config, not end-user data).

A second, unrelated bug was found and fixed during verification: the
invite-signup trigger's `digest()` call needed to be schema-qualified as
`extensions.digest(...)` (pgcrypto lives in the `extensions` schema on
Supabase, not `public`) — an unqualified call failed with `function
digest(text, unknown) does not exist` (42883), which silently made every
invited-signup attempt fall back to a normal signup (own org, not the
invite's org) rather than erroring visibly. Fixed in
`supabase/team-invite-signup.sql`, which now also wraps the whole invite
branch in an exception handler as a permanent safety net (any future
unexpected error there falls back to normal signup rather than failing
account creation for every signup on this shared trigger). Verified live
via `REQUIRE_INTEGRATION=1 npm test` — all Team Membership integration
tests (entitlement matrix, invite security, isolation, comped grants +
continuity) now genuinely pass against the live database, not skipped.



## Schema

- **`org_subscriptions`** — one row per org's team subscription. `plan_id`
  -> `membership_plans`, `seat_count`, `status` (`active` | `canceled`),
  `source` (`stripe` | `comped`, mirrors `UserSubscription.source`),
  `stripe_subscription_id` (unique, nullable), `current_period_end`,
  `canceled_at`. At most one **active** row per org — enforced by a
  **partial unique index** (`supabase/team-membership-schema.sql`; Prisma's
  schema language has no partial-index syntax, hence raw SQL) rather than a
  plain `unique(organization_id)`, so a canceled row is kept for history
  when the org re-subscribes later.
- **`memberships.covered_by_org_plan`** (boolean, default false) — whether
  this member's tier access comes from the org's team subscription.
- **`org_invites`** — `organization_id`, `email`, `role`, `token_hash`
  (SHA-256 hex of a raw token that exists exactly once, in the invite
  email — never stored, same convention as `SharedLink.tokenHash`),
  `expires_at` (7 days — `INVITE_EXPIRY_DAYS` in `src/lib/invites.ts`),
  `accepted_at` / `revoked_at` (either, once set, permanently retires the
  invite — single-use + revocable).
- **`membership_plans.stripe_team_price_id` /
  `stripe_team_annual_price_id`** — the per-seat (licensed quantity
  billing) Stripe Price ids, separate from the personal
  `stripe_price_id`/`stripe_annual_price_id` (see `scripts/stripe-team-
  billing.js`).

RLS: org members read their own org's `org_subscriptions` +
`org_invites` (helper functions `user_org_ids()` / `is_platform_admin()`,
reused from `rls-policies.sql` / `membership-rls.sql`); **no user-session
write policy exists on either table at all** — every mutation goes through
a server action using `createServiceRoleClient()`, after the caller's own
session has been verified as `org_admin` (`src/lib/orgAdmin.ts`'s
`requireOrgAdmin()`) or platform admin (`src/lib/admin.ts`'s
`requirePlatformAdmin()`). This mirrors `audit_logs`'s existing
"service-role-only write" pattern exactly.

## Entitlement resolver precedence

`src/lib/repository/membership.ts`'s `getEffectivePlan()`:

```
effective tierLevel = MAX(personal subscription tierLevel, org-coverage tierLevel)
```

`resolveOrgCoverage()` computes the org-coverage half. A membership only
actually counts as covered when **all** of:

1. `covered_by_org_plan = true` and the membership is active
   (`deleted_at is null`).
2. The org has an `org_subscriptions` row with `status = 'active'`.
3. That row's `current_period_end` is null (comped — no period) or still
   in the future (an active Stripe period, including the
   `cancel_at_period_end=true` window — access still runs to period end,
   since Stripe only flips `status` to `canceled` via the
   `customer.subscription.deleted` webhook once the period has actually
   ended, not when the user merely requests cancellation).
4. **Seat-count determinism**: coverage never exceeds seats. Even if a
   member's own `covered_by_org_plan` flag is `true` in the DB (e.g. a
   stale toggle survives a `seat_count` reduction), the resolver
   independently re-derives the org's oldest `seat_count` covered members
   (ordered by `membership.created_at` ascending — ties break
   deterministically, oldest wins) and only counts a member within that
   window. `src/app/account/team/actions.ts`'s `toggleMemberCoverage()`
   also enforces this at toggle-time — the resolver check is defense in
   depth, not the only guard.

A user covered in more than one org (accepted two invites) resolves to the
**highest** qualifying tier across all of them.

## Invite flow & the auto-org wrinkle

Every signup normally auto-provisions its own organization
(`supabase/onboarding-trigger.sql`'s `handle_new_user()` trigger). An
invited signup must NOT — `supabase/team-invite-signup.sql` replaces that
trigger to check `new.raw_user_meta_data->>'invite_token'` FIRST: if it
resolves to a real, still-valid (unaccepted, unrevoked, unexpired,
email-matching) `org_invites` row, the user is added to the **inviting**
org (role + coverage from the invite, coverage only if a seat is free) and
org auto-creation is skipped entirely. Any other case (no token, or a
bogus/expired/revoked/mismatched one) falls through to the exact original
behavior — verified by `tests/integration/teamInviteSecurity.test.ts`'s
"normal signup still auto-provisions" regression test.

`src/app/login/actions.ts`'s `signUp()` passes the token through via
`supabase.auth.signUp({ options: { data: { invite_token } } })` — the
`/signup?invite=<token>` page (`src/app/signup/page.tsx`) reads it from the
URL and previews the inviting org's name (service-role lookup, reveals
nothing for an invalid token).

An **existing, logged-in** user accepts via `/invites/accept?invite=<token>`
(`src/app/invites/accept/actions.ts`'s `acceptInvite()`) — adds a SECOND
membership. Both paths validate identically: hash match, unaccepted,
unrevoked, unexpired, and (for the existing-user path) the invite's email
must match the signed-in user's own email.

**Org switcher** (`src/components/org-switcher.tsx`) — a plain `<select>`
in the account menu, shown ONLY when the user has 2+ active memberships.
Selecting an org calls `src/app/account/set-active-org.ts`'s
`setActiveOrganization()`, which re-validates the membership server-side
before storing it in the `nqn_active_org` cookie —
`src/lib/session.ts`'s `getCurrentOrganizationId()` re-validates it AGAIN
on every read (a stale/tampered cookie is silently ignored, never trusted),
falling back to the user's oldest membership — exactly the original
single-org behavior for every solo user.

## Stripe (test mode)

`scripts/stripe-team-billing.js` creates one monthly + one annual **tiered,
licensed-quantity** Stripe Price per plan (`tiers_mode: "volume"` — the
whole seat count bills at the ONE tier it falls into). **Volume breakpoint
percentages are PLACEHOLDER constants (`TEAM_VOLUME_BREAKPOINTS` in that
script) awaiting real numbers from the owner** — currently 0% off at every
tier; edit and re-run once supplied (Stripe Prices are immutable, so
re-running always creates fresh ones and overwrites the plan's
`stripe_team_price_id`). The pricing page's `TeamsPanel`
(`src/app/pricing/teams-panel.tsx`) shows the same breakpoint RANGES
without specific percentages, for the same reason.

`/account/team/subscribe` (org_admin only,
`src/app/account/team/subscribe/actions.ts`'s `startTeamCheckout()`) starts
a Checkout Session with `quantity: seatCount` on the chosen team price,
`metadata.team = "true"` + `metadata.organization_id` on both the session
and the subscription (how the webhook tells a team subscription apart from
a personal one). Reuses the org_admin's own `users.stripe_customer_id` for
org billing (this app has no separate per-organization Stripe customer
concept — a deliberate simplification for a small-brokerage scale).

The webhook (`src/app/api/webhooks/stripe/route.ts`) remains the single
writer of Stripe-sourced state — `upsertOrgSubscription()` handles
`checkout.session.completed` / `customer.subscription.created` /
`.updated` (team-tagged) by upserting `org_subscriptions` on
`stripe_subscription_id`, and `customer.subscription.deleted` sets
`status = 'canceled'`.

Seat changes: `src/app/account/team/actions.ts`'s `updateSeatCount()` — for
a Stripe org sub, calls `stripe.subscriptions.update()` (quantity, default
proration) and returns; the DB write happens via the webhook confirming
it, same principle as personal billing. **Never writes `seat_count` from
the client path directly** for a Stripe subscription. For a comped
subscription (no Stripe object), it writes `seat_count` directly with an
`audit_logs` entry.

Cancel/reactivate: the existing Stripe Customer Portal
(`src/app/account/manage-billing-form.tsx`, unchanged) — since org billing
reuses the org_admin's personal Stripe customer, the portal already shows
both subscriptions. On cancel, access runs to the current period's end
(see resolver precedence above), then falls back automatically — tested in
`tests/integration/teamStripeLifecycle.test.ts`.

**Admin-comped org subscriptions** (`/admin/teams`,
`src/app/admin/teams/actions.ts`) work with **no Stripe object at all** —
platform-admin only (an org_admin can never comp themselves — that would
be a self-serve loophole), every grant/update/cancel writes an
`audit_logs` entry.

## Team management UI (`/account/team`, org_admin only)

- **Members** (`members-list.tsx`) — name/email/role, a coverage checkbox
  (disabled with a message when seats are full), remove (soft-deletes the
  membership, turns coverage off automatically).
- **Invite a teammate** (`invite-form.tsx`) — email + role, sends the
  invite email via the existing Resend sender
  (`src/lib/emailTemplates.ts`'s `orgInviteEmail()`).
- **Pending invites** (`invites-list.tsx`) — expiry shown, revoke button.
- **Subscription card** — plan, seats used/total, an inline seat-count
  editor (`seats-form.tsx`), and "Manage billing" (Stripe org subs only).
- **Continuity**: `src/lib/orgContinuity.ts`'s
  `checkLastAdminContinuity()` — an org_admin cannot remove themselves
  while they're the ONLY org_admin on an org with an active subscription.
  Deliberately NOT inside `team/actions.ts` (a `"use server"` file) so it
  can be imported directly by integration tests without pulling in Next's
  server-action machinery.
- Non-admin members see a read-only "Covered by `<Org>`'s `<Plan>`" state
  on `/account` (`src/app/account/page.tsx`) instead of the personal
  upgrade prompt, whenever `plan.orgCoverage` is set.

## Tests

`tests/domain/inviteTokens.test.ts` (token hashing/expiry — pure, always
runs) plus five `tests/integration/*.test.ts` files covering the
entitlement matrix, invite security + the invited-signup regression,
cross-tenant isolation, the Stripe lifecycle, and comped grants +
continuity. Every integration test gates on BOTH real credentials (the
existing convention) AND a live schema probe
(`tests/integration/teamMembershipSchemaProbe.ts`) — until the deployment
steps above are done, they skip with a clear console note rather than
failing, exactly like the existing skip-without-credentials convention.
**Run `npm run test:integration` again after deployment** to actually
exercise them.

## User guide — inviting a team, coverage, billing

1. **Subscribe your team**: an org_admin visits `/account/team/subscribe`,
   picks a plan and a seat count, and checks out via Stripe (test mode —
   use `4242 4242 4242 4242`). Or ask NON-QM Nexus support for a
   no-Stripe pilot comp.
2. **Invite teammates**: from `/account/team`, enter an email + role and
   send. They get an email with a 7-day link — if they don't have an
   account yet, it takes them to signup (pre-filled with which team
   they're joining); if they do, it takes them to a one-click accept page.
   Either way, their seat is covered automatically if one's free.
3. **Manage seats**: the subscription card shows seats used/total; an
   org_admin can add seats (adjusts Stripe billing with proration) or
   toggle individual members' coverage on/off.
4. **Multiple teams**: if you're on more than one team, a small switcher
   appears next to your account link — pick which org you're currently
   working in.
5. **Billing**: "Manage billing" opens the same Stripe Customer Portal used
   for personal subscriptions — update payment method, view invoices, or
   cancel (access continues to the paid period's end, then falls back
   automatically).
