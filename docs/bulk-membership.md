# Bulk Membership (2026-07-31)

One unified system for a brokerage of any size, from 1 loan officer up to
**500**, to buy access in a single deal at a **custom-negotiated price** —
NOT a public tier. Built additively on top of the existing Team Membership
system (docs/team-membership.md) rather than a parallel one: same
`organizations` / `memberships` / `org_subscriptions` / `org_invites`
tables, same coverage resolver, same `/account/team` roster UI. The
existing 3-tier self-serve system (Essential/Professional/Enterprise,
docs/membership.md) is completely untouched by this feature — no pricing,
no feature gating, no code path there was modified.

## Deployment status — CODE COMPLETE, NOT YET DEPLOYED

Schema changes are in `prisma/schema.prisma` (validated — `npx prisma
validate` passes) and `supabase/bulk-membership-schema.sql`, but **have
not been pushed to the live database** — this session had no
`DATABASE_URL` (cleared between sessions, same convention noted in
HANDOFF.md). All 2486 domain tests still pass; `next lint` and `tsc
--noEmit` are clean. To finish deployment:

```
# 1. Push the new schema (adds membership_plans.stripe_product_id,
#    org_subscriptions' new bulk columns, and bulk_membership_requests)
npx prisma db push

# 2. Re-run the usual defaults scripts — REQUIRED after every db push
#    per HANDOFF.md's "known operational gotcha" (db push resets
#    manually-added DB-level defaults on tables it doesn't fully own):
node supabase/id-defaults.sql        # or however these are normally applied
node supabase/updated-at-defaults.sql
node supabase/membership-defaults.sql
node supabase/team-membership-defaults.sql

# 3. Run the new SQL file (seeds the hidden bulk_enterprise plan row,
#    enables RLS + the 500-seat DB trigger on bulk_membership_requests /
#    org_subscriptions):
psql $DATABASE_URL -f supabase/bulk-membership-schema.sql

# 4. Re-run prisma generate against the real DB
npx prisma generate
```

Real `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` must also be present
(same requirement as Team Membership's own Stripe setup) for the
`custom_stripe` and `invoiced` billing modes to work — the `comped`
billing mode works with no Stripe keys at all, same as `/admin/teams`.

## Design

A Bulk Membership deal is just an `org_subscriptions` row pointed at one
new, hidden `membership_plans` row (`key = 'bulk_enterprise'`,
`tier_level = 3` — Enterprise-equivalent lender access, per explicit
instruction to leave the 3-tier feature system untouched: a bulk seat
gets full access, same as any Enterprise seat, through the exact same
resolver code). `is_active = false` so it never appears in `/pricing`,
`/account/team/subscribe`, or `/admin/teams`' plan pickers.

Unlike the 3 self-serve tiers (whose team price is fixed once per plan —
`membership_plans.stripe_team_price_id`, scripts/stripe-team-billing.js),
a Bulk Membership's price is negotiated per deal. `org_subscriptions`
gained:

- `billing_mode` — `"standard"` (existing 3-tier team pricing, untouched)
  | `"custom_stripe"` (dynamic per-deal Stripe Price, real subscription,
  card-billed) | `"invoiced"` (NET-30 Stripe Invoice, no subscription
  object) | `"comped"` (free pilot, no Stripe object).
- `custom_price_per_seat_cents` — the negotiated $/seat/month.
- `stripe_invoice_id` / `next_invoice_due_at` — invoiced deals only; there
  is no recurring Stripe object for an invoice, so rolling to the next
  billing cycle is a manual admin action
  (`sendNextBulkInvoice()` in `src/app/admin/bulk-memberships/actions.ts`).
- `billing_contact_email` / `billing_contact_name` — who negotiated /
  pays, independent of any one covered member.

500-seat cap: enforced in application code at every seat-count write
(`createBulkMembership`, `updateSeatCount`) AND as a DB-level trigger
(`check_bulk_seat_cap()`, scoped only to `plan.key = 'bulk_enterprise'` —
never constrains the 3 existing tiers' seat counts) as defense in depth.

## Flow

1. **Public lead capture** (`/enterprise`, no auth, no pricing shown
   anywhere) — a brokerage submits company/contact/approx. seat count.
   Creates a `bulk_membership_requests` row and emails
   `BULK_MEMBERSHIP_NOTIFY_EMAIL` (falls back to the platform admin
   account).
2. **Ops reviews** in `/admin/bulk-memberships` (platform-admin only, new
   nav item) — sees pending requests and every active/past Bulk
   Membership. "Convert" opens `/admin/bulk-memberships/new` pre-filled
   from the request.
3. **Ops creates the deal** (`createBulkMembership` server action):
   creates the `organizations` row (or attaches to an existing org),
   sets seat count (1-500) and negotiated $/seat, picks billing mode:
   - **Card (`custom_stripe`)** — creates a one-off Stripe Price on a
     shared "Bulk Membership" Product (lazily created once,
     `membership_plans.stripe_product_id`), a Stripe Checkout Session
     (`mode: subscription`, `quantity: seatCount`, `metadata.team =
     "true"` + `bulk_plan_id` so the EXISTING webhook's
     `upsertOrgSubscription()` recognizes and upserts it — extended with
     a fallback price->plan lookup for dynamic bulk prices), and emails
     the checkout link to the contact (ops also gets it back in the
     admin UI to copy/share directly).
   - **Invoiced (`invoiced`)** — creates a Stripe Customer + Invoice Item
     + Invoice (`collection_method: send_invoice`, `days_until_due: 30`),
     finalizes and sends it, and writes the `org_subscriptions` row
     immediately (ops-confirmed, not webhook-driven, since there's no
     ongoing subscription object).
   - **Comped** — a free pilot, no Stripe object at all, same pattern as
     `/admin/teams`' existing comp flow.
   In every case (for a freshly created org), the contact is
   automatically invited as the org's first `org_admin` — reusing the
   exact same `org_invites` / signup-trigger / accept mechanism as a
   normal team invite (docs/team-membership.md), just issued by a
   platform admin instead of an existing `org_admin` (who doesn't exist
   yet for a brand-new org).
4. **Mass enrollment — the actual "sign up 500 loan officers in one
   shot"**: once their subscription is active, the org's admin goes to
   `/account/team` (the EXACT SAME page every team uses) and uses the new
   **Bulk invite** card — upload a CSV (`email`[, `role`] columns) or
   paste a plain list of emails, up to 500 at once. Each row goes through
   the identical invite path as a single invite (token, 7-day expiry,
   accept/signup flow) with bounded concurrency (8 at a time) and
   per-row success/failure reporting, so a bad email or a bounce never
   silently drops the rest of the batch.
5. **Ongoing management** — same `/account/team` roster (members list,
   coverage toggles, seat-count editor capped at 500 for this plan,
   pending invites, "Manage billing" for `custom_stripe` deals via the
   existing Stripe Customer Portal). Invoiced deals get a "Send next
   invoice" button in `/admin/bulk-memberships` instead (no self-serve
   portal for a NET-30 invoice).

## Files

- `prisma/schema.prisma` — `MembershipPlan.stripeProductId`,
  `OrgSubscription`'s new bulk fields, `BulkMembershipRequest` model.
- `supabase/bulk-membership-schema.sql` — plan seed, RLS, 500-seat
  trigger.
- `src/lib/bulkMembership.ts` — shared constants (`MAX_BULK_SEATS = 500`,
  `BULK_PLAN_KEY`).
- `src/app/enterprise/` — public request-a-quote page.
- `src/app/admin/bulk-memberships/` — ops review + deal-creation UI.
- `src/app/account/team/bulk-invite-form.tsx` +
  `actions.ts`'s `bulkInviteMembers()` — the CSV mass-invite.
- `src/app/api/webhooks/stripe/route.ts` — extended `upsertOrgSubscription()`
  with the dynamic-price fallback + `billing_mode`/`custom_price_per_seat_cents`
  capture.
- `src/lib/emailTemplates.ts` — `bulkMembershipRequestNotifyEmail`,
  `bulkMembershipCheckoutLinkEmail`, `bulkMembershipInvoiceSentEmail`.
