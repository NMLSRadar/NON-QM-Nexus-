-- AE Directory, Sponsored Placement & Outreach System (2026-07-30)
--
-- COMPLIANCE SHAPE (RESPA Section 8 conservative design — see docs/legal-agenda.md):
-- ae_placements is a FLAT MONTHLY SUBSCRIPTION for advertising placement
-- only. There is no per-lead, per-click, or per-referral pricing anywhere
-- in this schema, and no column here is ever read by the matching/ranking
-- engine (src/domain/matching/*) — sponsorship affects presentation only.

-- ---------------------------------------------------------------------
-- 1. AE Directory
-- ---------------------------------------------------------------------

alter table public.lenders add column if not exists email_domain text;
comment on column public.lenders.email_domain is 'Admin-maintained verified email domain (e.g. "acralending.com") used ONLY to auto-approve an AE claim when their verified auth email matches. Never used for anything eligibility-related.';

create table if not exists public.ae_profiles (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references public.lenders(id),
  name text not null,
  title text,
  email text not null,
  phone text,
  nmls_id text,
  states text[] not null default '{}',
  photo_url text,
  claimed_by_user_id uuid references public.users(id),
  status text not null default 'unclaimed' check (status in ('unclaimed', 'claimed', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ae_profiles_lender_idx on public.ae_profiles (lender_id);
create index if not exists ae_profiles_claimed_by_idx on public.ae_profiles (claimed_by_user_id);

alter table public.ae_profiles enable row level security;

-- Public read: only visible (non-hidden) profiles, for anyone.
drop policy if exists ae_profiles_public_read on public.ae_profiles;
create policy ae_profiles_public_read on public.ae_profiles
  for select using (status <> 'hidden');

-- Writes: platform admins only (checked via public.users.platform_admin),
-- EXCEPT an AE may update their own claimed row (claim flow below uses the
-- service-role client server-side for the claim/approve transition itself,
-- so this UPDATE policy only needs to cover a claimed AE editing their own
-- profile fields afterward).
drop policy if exists ae_profiles_admin_write on public.ae_profiles;
create policy ae_profiles_admin_write on public.ae_profiles
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  ) with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );

drop policy if exists ae_profiles_self_update on public.ae_profiles;
create policy ae_profiles_self_update on public.ae_profiles
  for update using (claimed_by_user_id = auth.uid())
  with check (claimed_by_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. Metrics instrumentation — counts only, never viewer identity.
-- ---------------------------------------------------------------------

create table if not exists public.ae_profile_events (
  id uuid primary key default gen_random_uuid(),
  ae_profile_id uuid not null references public.ae_profiles(id),
  event text not null check (event in ('view', 'click_phone', 'click_email')),
  created_at timestamptz not null default now()
);
create index if not exists ae_profile_events_profile_idx on public.ae_profile_events (ae_profile_id, created_at);

alter table public.ae_profile_events enable row level security;
-- No public read policy at all — this table is written by a service-role
-- server action (src/app/ae/record-event-action.ts) and read only via
-- getAeMonthlyStats (also service-role), never queried client-side.
drop policy if exists ae_profile_events_admin_read on public.ae_profile_events;
create policy ae_profile_events_admin_read on public.ae_profile_events
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );

-- ---------------------------------------------------------------------
-- 3. Sponsored placement (Stripe test mode) — presentation only.
-- ---------------------------------------------------------------------

create table if not exists public.ae_placements (
  id uuid primary key default gen_random_uuid(),
  ae_profile_id uuid not null unique references public.ae_profiles(id),
  status text not null default 'none' check (status in ('none', 'active', 'canceled')),
  source text check (source in ('stripe', 'comped')),
  stripe_customer_id text,
  stripe_subscription_id text,
  started_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ae_placements enable row level security;
drop policy if exists ae_placements_public_read on public.ae_placements;
create policy ae_placements_public_read on public.ae_placements
  for select using (true); -- status/badge is public-facing (the "Sponsored" label itself)
drop policy if exists ae_placements_admin_write on public.ae_placements;
create policy ae_placements_admin_write on public.ae_placements
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  ) with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );

-- Generic admin audit log — already exists in this database with its own
-- real schema (organization_id, actor_user_id, action, entity_type,
-- entity_id, metadata jsonb, created_at) from an earlier migration this
-- session didn't originally know about. Discovered 2026-07-30 while
-- testing the comp/revoke actions (a CREATE TABLE IF NOT EXISTS here was
-- a harmless no-op against the real table). Application code
-- (src/app/admin/ae-profiles/comp-actions.ts) writes to the REAL existing
-- columns — reason goes in metadata jsonb, not a dedicated column.
-- No DDL needed here; this comment exists so a future reader doesn't
-- re-introduce a conflicting assumption about this table's shape.

-- ---------------------------------------------------------------------
-- 4. Outreach email system — admin-initiated, never auto-blasted.
-- ---------------------------------------------------------------------

create table if not exists public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  ae_profile_id uuid references public.ae_profiles(id),
  name text not null,
  email text not null,
  lender_name text not null,
  source_note text,
  status text not null default 'prospect' check (status in ('prospect', 'invited', 'claimed', 'subscribed', 'unsubscribed')),
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_contacts_status_idx on public.outreach_contacts (status);
create index if not exists outreach_contacts_lender_idx on public.outreach_contacts (lender_name);

alter table public.outreach_contacts enable row level security;
drop policy if exists outreach_contacts_admin_only on public.outreach_contacts;
create policy outreach_contacts_admin_only on public.outreach_contacts
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  ) with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );

-- Global suppression list — checked by the send function for EVERY
-- commercial email template, regardless of source table.
create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null default 'unsubscribed',
  created_at timestamptz not null default now()
);
create index if not exists email_suppressions_email_idx on public.email_suppressions (lower(email));

alter table public.email_suppressions enable row level security;
drop policy if exists email_suppressions_admin_only on public.email_suppressions;
create policy email_suppressions_admin_only on public.email_suppressions
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  ) with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );

create table if not exists public.outreach_sends (
  id uuid primary key default gen_random_uuid(),
  outreach_contact_id uuid references public.outreach_contacts(id),
  template text not null,
  recipient_email text not null,
  triggered_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists outreach_sends_created_idx on public.outreach_sends (created_at);

alter table public.outreach_sends enable row level security;
drop policy if exists outreach_sends_admin_only on public.outreach_sends;
create policy outreach_sends_admin_only on public.outreach_sends
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  ) with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );
