-- NON-QM Nexus — Membership Management (task 04, docs/tasks/04-membership-management.md).
--
-- One per-org membership lifecycle row with an explicit status enum and an
-- append-only events trail. Attribution (task 03) is read ADMIN-ONLY here and
-- joined for reporting; it is never exposed to member-facing routes.
--
-- Portal-naming note: the task spec's table is named `memberships`, but that
-- name is already the org↔user role table used by every RLS helper
-- (user_org_ids) and team logic. Approved decision: `organization_memberships`
-- instead, keeping the spec's columns/status/events one-to-one.
--
-- Applied with scripts/apply-sql.mjs; mirrored into prisma/schema.prisma.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Membership lifecycle (one row per org, status enum)
-- ---------------------------------------------------------------------------
create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null,          -- trialing | active | past_due | cancelled_pending | cancelled | churned | trial_expired
  plan_tier text not null,       -- monthly | annual | beta | comp
  seat_count integer not null default 1,
  mrr_cents integer not null default 0,
  billing_interval text,         -- month | year
  processor_customer_id text,
  processor_sub_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  converted_at timestamptz,      -- trial → first paid
  current_period_end timestamptz,
  cancel_requested_at timestamptz,
  access_ends_at timestamptz,    -- when access actually lapses
  churned_at timestamptz,
  churn_type text,               -- voluntary | involuntary
  churn_reason text,
  churn_reason_detail text,
  reactivated_at timestamptz,
  reactivation_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_org_unique unique (organization_id)
);
create index if not exists organization_memberships_status_idx on public.organization_memberships (status, updated_at);
create index if not exists organization_memberships_churn_idx on public.organization_memberships (churned_at);

-- ---------------------------------------------------------------------------
-- 2. Membership events trail (append-only; source: webhook | admin | system)
-- ---------------------------------------------------------------------------
create table if not exists public.membership_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  source text not null,          -- webhook | admin | system
  actor_user_id uuid references public.users(id),
  mrr_delta_cents integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists membership_events_org_idx on public.membership_events (organization_id, created_at);
create index if not exists membership_events_period_idx on public.membership_events (created_at, to_status);

-- ---------------------------------------------------------------------------
-- 3. Membership notes (internal, admin-only, append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.membership_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_user_id uuid not null references public.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. RLS — platform-admin only. Members have zero rows (same helper as
--    membership-rls.sql's public.is_platform_admin()).
-- ---------------------------------------------------------------------------
alter table public.organization_memberships enable row level security;
alter table public.membership_events enable row level security;
alter table public.membership_notes enable row level security;

drop policy if exists organization_memberships_admin on public.organization_memberships;
create policy organization_memberships_admin on public.organization_memberships
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists membership_events_admin on public.membership_events;
create policy membership_events_admin on public.membership_events
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists membership_notes_admin on public.membership_notes;
create policy membership_notes_admin on public.membership_notes
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5. Status transition writer (SECURITY DEFINER, admin-gated by caller).
--    The ONLY writer of organization_memberships.status transitions is this
--    function; it always appends a membership_events row, so history is never
--    lost. Webhook/Stripe handlers and admin actions call it with a source.
-- ---------------------------------------------------------------------------
create or replace function public.record_membership_transition(
  p_organization_id uuid,
  p_to_status text,
  p_source text,
  p_actor_user_id uuid default null,
  p_reason text default null,
  p_mrr_delta_cents integer default 0,
  p_churn_type text default null,
  p_churn_reason text default null,
  p_churn_reason_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_status text;
  v_now timestamptz := now();
begin
  if p_organization_id is null then
    return;
  end if;
  if p_source not in ('webhook', 'admin', 'system') then
    raise exception 'invalid membership event source: %', p_source;
  end if;
  if p_to_status not in ('trialing', 'active', 'past_due', 'cancelled_pending', 'cancelled', 'churned', 'trial_expired') then
    raise exception 'invalid membership status: %', p_to_status;
  end if;

  select status into v_from_status from public.organization_memberships where organization_id = p_organization_id;

  -- Idempotent replay: a transition to the CURRENT status is a no-op (a
  -- webhook redelivery of an already-applied event must not create a second
  -- event row). The spec's replay test depends on this.
  if v_from_status = p_to_status then
    return;
  end if;

  insert into public.membership_events (organization_id, from_status, to_status, reason, source, actor_user_id, mrr_delta_cents, created_at)
  values (p_organization_id, v_from_status, p_to_status, p_reason, p_source, p_actor_user_id, p_mrr_delta_cents, v_now);

  if v_from_status is null then
    -- First touch: seed the row at the new status. plan_tier is NOT NULL;
    -- a trial status seeds as 'beta', anything else 'monthly' (an
    -- admin/webhook may refine the tier afterward via a follow-up write).
    insert into public.organization_memberships (organization_id, status, plan_tier, updated_at)
    values (p_organization_id, p_to_status, case when p_to_status in ('trialing', 'trial_expired') then 'beta' else 'monthly' end, v_now)
    on conflict (organization_id) do update set status = excluded.status, updated_at = v_now;
  else
    update public.organization_memberships
      set status = p_to_status,
          updated_at = v_now,
          churned_at = case when p_to_status in ('churned', 'cancelled') and churned_at is null then v_now else churned_at end,
          churn_type = coalesce(p_churn_type, churn_type),
          churn_reason = coalesce(p_churn_reason, churn_reason),
          churn_reason_detail = coalesce(p_churn_reason_detail, churn_reason_detail),
          access_ends_at = case when p_to_status in ('churned', 'cancelled') and access_ends_at is null then v_now else access_ends_at end,
          reactivated_at = case when p_to_status = 'active' and v_from_status in ('churned', 'cancelled') then v_now else reactivated_at end,
          reactivation_count = case when p_to_status = 'active' and v_from_status in ('churned', 'cancelled') then reactivation_count + 1 else reactivation_count end
      where organization_id = p_organization_id;
  end if;
end;
$$;

COMMIT;