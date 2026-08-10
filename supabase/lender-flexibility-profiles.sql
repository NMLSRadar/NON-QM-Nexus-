-- Lender flexibility / posture profiles (2026-08-10, chatbot upgrade Part 2).
--
-- EDITORIAL metadata about real lenders' market posture — guideline
-- flexibility, exception appetite, pricing TENDENCY (directional only,
-- never a figure). Architecturally separate from the guideline library:
-- never joined into rule evaluation, match scoring, or guideline citations.
--
-- organization_id NULL  = platform-level default row (platform admins only).
-- organization_id set   = that org's override — fully replaces the default
--                         for that lender, visible only to that org. One
--                         org's read on a lender never affects another's.
--
-- Uses helpers from rls-policies.sql: user_org_ids(), user_has_role().

create table if not exists public.lender_flexibility_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid, -- null = platform seed override
  lender_id uuid,       -- optional link to a catalog lender record
  canonical_name text not null,
  aliases text[] not null default '{}',
  posture text not null check (posture in ('exception_based', 'moderate', 'rigid')),
  posture_notes text not null default '',
  pricing_tendency text not null default 'unknown'
    check (pricing_tendency in ('typically_more_aggressive', 'typically_mid', 'typically_better_priced', 'unknown')),
  exceptions_considered boolean not null default false,
  exception_channel text,
  typical_compensating_factors text[] not null default '{}',
  source text not null default 'org_editorial'
    check (source in ('org_editorial', 'lender_published', 'ae_confirmed')),
  is_verified boolean not null default false,
  last_reviewed_at date,
  confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  deleted_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lender_flex_org_name_uq
  on public.lender_flexibility_profiles (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(canonical_name))
  where deleted_at is null;
create index if not exists lender_flex_org_idx on public.lender_flexibility_profiles (organization_id);

alter table public.lender_flexibility_profiles enable row level security;

-- Read: platform rows (org null) are readable by any signed-in member;
-- org rows only by that org's members.
drop policy if exists lender_flex_read on public.lender_flexibility_profiles;
create policy lender_flex_read on public.lender_flexibility_profiles
  for select using (
    organization_id is null
    or organization_id in (select public.user_org_ids())
  );

-- Write platform rows: platform admins only.
drop policy if exists lender_flex_platform_write on public.lender_flexibility_profiles;
create policy lender_flex_platform_write on public.lender_flexibility_profiles
  for all using (
    organization_id is null
    and exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  ) with check (
    organization_id is null
    and exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );

-- Write org rows: that org's org_admins (their override never leaks to or
-- affects any other org).
drop policy if exists lender_flex_org_write on public.lender_flexibility_profiles;
create policy lender_flex_org_write on public.lender_flexibility_profiles
  for all using (
    organization_id is not null and public.user_has_role(organization_id, array['org_admin'])
  ) with check (
    organization_id is not null and public.user_has_role(organization_id, array['org_admin'])
  );
