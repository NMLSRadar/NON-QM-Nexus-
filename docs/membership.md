# Membership & pricing architecture

Fully backend-driven — no pricing, tier names, or lender tier assignments
are hardcoded. Everything below is editable from `/admin` without a
deploy.

## Tables

- `membership_plans` — one row per tier (key, name, monthly_price_cents,
  tier_level, is_active, sort_order). The public `/pricing` page reads
  active plans directly from this table.
- `discounts` — reusable discount definitions (name, percent_off,
  is_active). Not tied to a specific user until assigned.
- `user_subscriptions` — one row per user: `plan_id` + optional
  `discount_id`. Admin-assigned only for now (no self-serve checkout /
  billing yet — see FINALIZE.md Phase 7 for the future Stripe wiring).
  A discount stays active until an admin removes it.
- `lenders.tier_level` (1/2/3) — the minimum plan tier required to see
  that lender in comparisons. New lenders default to 3 (Enterprise-only)
  until an admin explicitly curates them into Tier 1 (Top 12) or
  Tier 2 (Top 25) from `/admin/lenders`.

## Enforcement

`SupabaseRepository` (src/lib/repository/supabaseRepository.ts) resolves
the signed-in user's effective tier (src/lib/repository/membership.ts) and
filters `listLenders` / `listPrograms` / `listRules` server-side —
`tier_level <= user's tier`. A user with no active plan has tier level 0
and sees no lenders. Enterprise (tier 3) automatically includes every
lender, including ones added after they subscribed — no re-assignment
needed.

Discounts only affect price (`getEffectivePlan().effectivePriceCents`) —
they never change tier/lender access, which is determined solely by the
assigned plan.

## Admin portal (`/admin`, gated by `users.platform_admin`)

- `/admin/plans` — edit price/name/tier per plan, add new tiers
- `/admin/lenders` — reassign any lender's tier (across all organizations
  — the Top 12/25 lists are platform-wide, not per-tenant)
- `/admin/discounts` — add new discount percentages
- `/admin/users` — assign a plan + discount to any account

`platform_admin` is a separate, global flag from the org-scoped
`memberships.role` used elsewhere in this schema.

## Operational note: `prisma db push` resets manual SQL defaults

Prisma's `@default(uuid())` / `@updatedAt` only apply client-side, not at
the database level. We added `gen_random_uuid()` / `now()` DB defaults via
raw SQL (`supabase/id-defaults.sql`, `updated-at-defaults.sql`,
`membership-defaults.sql`) so triggers and other raw-SQL writers don't hit
not-null violations. **`prisma db push` resets these defaults** on every
table it doesn't know about them for — re-run those three SQL files after
any future `prisma db push`.
