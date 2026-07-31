-- NON-QM Nexus — Bulk Membership (2026-07-31)
--
-- Extends the existing Team Membership system (supabase/team-membership-
-- schema.sql, docs/team-membership.md) rather than building a parallel
-- one. A "Bulk Membership" is just an org_subscriptions row pointed at a
-- new, hidden membership_plans row (key = 'bulk_enterprise') whose price
-- is negotiated per deal instead of fixed — same tables, same coverage
-- resolver, same invite flow, same /account/team roster UI. See
-- docs/bulk-membership.md for the full design.
--
-- Run AFTER `prisma db push` (which creates the new columns/table from
-- prisma/schema.prisma) and AFTER re-running the usual defaults scripts
-- per HANDOFF.md's "known operational gotcha":
--   supabase/id-defaults.sql
--   supabase/updated-at-defaults.sql
--   supabase/membership-defaults.sql
--   supabase/team-membership-defaults.sql
-- then this file.

-- ---------------------------------------------------------------------------
-- The one hidden plan every bulk deal's org_subscriptions row points at.
-- isActive = false so it never appears in /pricing, /account/team/subscribe,
-- or /admin/teams' plan pickers — only src/lib/bulkMembership.ts's queries
-- (which reference it by key, not is_active) ever select it. tier_level = 3
-- (Enterprise-equivalent lender access) per the owner's explicit instruction
-- to leave the existing 3-tier feature system untouched — a bulk seat simply
-- gets full access, same as any Enterprise seat, through the SAME resolver
-- code (src/lib/repository/membership.ts), no changes needed there.
-- monthly_price_cents is 0 / unused — every bulk deal's real price lives on
-- its own org_subscriptions row (custom_price_per_seat_cents), never here.
-- ---------------------------------------------------------------------------
insert into membership_plans (id, key, name, monthly_price_cents, tier_level, description, is_active, sort_order)
values (
  gen_random_uuid(),
  'bulk_enterprise',
  'Bulk Enterprise Membership',
  0,
  3,
  'Custom-quoted bulk membership for large brokerages (up to 500 loan officers) — negotiated per deal, not a public price.',
  false,
  9999
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- bulk_membership_requests — inbound sales leads from the public
-- "Request Bulk Membership" page. No user-session policy at all (same
-- "service-role-only" pattern as org_subscriptions/audit_logs) — the public
-- form action and every admin action both use createServiceRoleClient()
-- after their own gate (anon rate-limit check / requirePlatformAdmin()).
-- ---------------------------------------------------------------------------
alter table bulk_membership_requests enable row level security;

create policy bulk_membership_requests_select on bulk_membership_requests
  for select using (public.is_platform_admin());

create index if not exists bulk_membership_requests_status_idx
  on bulk_membership_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Sanity check constraint: a bulk_enterprise org_subscription can never
-- exceed MAX_BULK_SEATS (500, src/lib/bulkMembership.ts). Enforced primarily
-- in application code (createBulkMembership / updateSeatCount) — this is a
-- defense-in-depth DB-level backstop scoped ONLY to the bulk plan, so it
-- never constrains the 3 existing self-serve tiers' seat counts.
-- ---------------------------------------------------------------------------
create or replace function public.check_bulk_seat_cap()
returns trigger
language plpgsql
as $$
declare
  plan_key text;
begin
  select key into plan_key from membership_plans where id = new.plan_id;
  if plan_key = 'bulk_enterprise' and new.seat_count > 500 then
    raise exception 'Bulk Membership seat_count (%) exceeds the 500-seat cap', new.seat_count;
  end if;
  return new;
end;
$$;

drop trigger if exists org_subscriptions_bulk_seat_cap on org_subscriptions;
create trigger org_subscriptions_bulk_seat_cap
  before insert or update on org_subscriptions
  for each row execute function public.check_bulk_seat_cap();
