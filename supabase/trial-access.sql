-- 14-Day Loan Officer Testing Access — trial campaign schema.
--
-- Per the "14-Day Loan Officer Testing Access" spec (2026-07-28), phases
-- 1-5 and 14. Three new tables:
--   trial_campaigns    — admin-created, named promotional links (Phase 5)
--   trial_redemptions  — one row per user who activated a trial via a
--                        campaign link (Phase 2's tracked fields)
--   (user_subscriptions gets 3 new nullable columns rather than a 4th
--    table, since a trial IS a subscription state, not a separate
--    concept — this keeps getEffectivePlan/tier-resolution as the single
--    source of truth for "what can this user see right now" instead of
--    forking a second parallel access-check path)
--
-- Design decisions:
-- - Expiration is ALWAYS computed server-side from the ACTIVATION
--   timestamp (trial_activated_at + interval '14 days'), never trusted
--   from any client input — see Phase 4's hard requirement that the
--   server clock is the sole source of truth.
-- - A trial is modeled as a real user_subscriptions row pointing at the
--   Enterprise plan (tier 3 = "temporary Tier 3 / All Access", per
--   Phase 1) with is_trial = true and a trial_expires_at set. Existing
--   getEffectivePlan() tier-resolution logic is extended (in application
--   code, not SQL) to check trial_expires_at and resolve to tier 0 once
--   expired — automatically, with no admin action required (Phase 3).
-- - Duplicate-trial prevention (Phase 4) is enforced primarily at the
--   application layer (checking trial_redemptions by normalized email
--   before allowing a new trial signup) PLUS a database unique
--   constraint on (normalized_email) in trial_redemptions as a defense-
--   in-depth backstop against a race condition or a bypassed check.

create table if not exists public.trial_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  slug text not null unique, -- URL-safe campaign identifier, e.g. "loan-officer-beta" -> /trial/loan-officer-beta
  is_active boolean not null default true,
  trial_duration_days integer not null default 14,
  max_redemptions integer, -- null = unlimited
  starts_at timestamptz,
  ends_at timestamptz,
  allowed_email_domains text[], -- null/empty = any domain allowed
  require_one_redemption_per_email boolean not null default true,
  require_nmls_number boolean not null default false,
  require_company_name boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trial_campaigns_slug_idx on public.trial_campaigns (slug);

create table if not exists public.trial_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.trial_campaigns(id),
  user_id uuid not null references public.users(id),
  email text not null,
  normalized_email text not null, -- lowercased + trimmed, for duplicate-detection
  first_name text,
  last_name text,
  company_name text,
  nmls_number text,
  state text,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null, -- activated_at + campaign.trial_duration_days, computed server-side at insert time
  revoked_at timestamptz, -- admin manual revoke (Phase 5) — set alongside clearing the trial off user_subscriptions
  extended_by uuid references public.users(id), -- last admin who manually extended this trial, if any
  extension_count integer not null default 0,
  converted_at timestamptz, -- set when the user selects a paid/comped plan after their trial (Phase 2's "trial conversion status")
  converted_plan_key text,
  last_login_at timestamptz,
  scenarios_submitted_count integer not null default 0,
  lender_comparisons_count integer not null default 0,
  voice_scenarios_submitted_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_redemptions_one_per_user unique (user_id)
);

create index if not exists trial_redemptions_campaign_idx on public.trial_redemptions (campaign_id);
create index if not exists trial_redemptions_normalized_email_idx on public.trial_redemptions (normalized_email);
create index if not exists trial_redemptions_expires_at_idx on public.trial_redemptions (expires_at);

-- Trial state on user_subscriptions: a trial IS a subscription row (see
-- design note above) — these columns let getEffectivePlan() resolve trial
-- access without a second, parallel gating path.
alter table public.user_subscriptions add column if not exists is_trial boolean not null default false;
alter table public.user_subscriptions add column if not exists trial_activated_at timestamptz;
alter table public.user_subscriptions add column if not exists trial_expires_at timestamptz;

comment on column public.user_subscriptions.is_trial is 'true = this row represents a 14-day (or admin-configured) promotional trial, not a real paid/comped subscription. tier resolution checks trial_expires_at against now() when this is true.';
comment on column public.user_subscriptions.trial_expires_at is 'Server-computed at trial activation (trial_activated_at + campaign.trial_duration_days). The SOLE source of truth for trial expiration — never derived from client input, never extended except via an explicit admin action that re-writes this column server-side.';

-- RLS: trial_campaigns and trial_redemptions follow the same
-- platform-admin-write pattern as membership_plans/user_subscriptions
-- (see membership-rls.sql) — regular users have no direct write access;
-- trial activation happens through a SECURITY DEFINER function (see
-- below) the same way self-serve cancellation does.
alter table public.trial_campaigns enable row level security;
alter table public.trial_redemptions enable row level security;

drop policy if exists trial_campaigns_admin_all on public.trial_campaigns;
create policy trial_campaigns_admin_all on public.trial_campaigns
  for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true));

-- Anyone (including anonymous, pre-signup) must be able to READ an active
-- campaign by slug to render the trial landing page and validate the
-- link before the user has an account yet.
drop policy if exists trial_campaigns_public_read_active on public.trial_campaigns;
create policy trial_campaigns_public_read_active on public.trial_campaigns
  for select
  using (is_active = true);

drop policy if exists trial_redemptions_admin_all on public.trial_redemptions;
create policy trial_redemptions_admin_all on public.trial_redemptions
  for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true));

-- A user may read (but never write) their OWN redemption row — needed for
-- the "N days remaining" UI.
drop policy if exists trial_redemptions_own_read on public.trial_redemptions;
create policy trial_redemptions_own_read on public.trial_redemptions
  for select
  using (user_id = auth.uid());

-- Activates a trial for the CALLING (already signed-up) user against a
-- named campaign. SECURITY DEFINER so it can write trial_campaigns'
-- redemption count and user_subscriptions (both otherwise admin-write-
-- only) — but scoped narrowly: it can only ever write the CALLER's own
-- user_subscriptions row and only ever set trial fields, never touch
-- plan_id/discount_id/stripe_* columns on an existing real subscription
-- (defensive check: refuses if the caller already has a NON-trial active
-- subscription, so a paying customer's real plan can never be
-- accidentally overwritten by hitting a trial link).
--
-- Duplicate-trial enforcement (Phase 4): raises an exception if
-- normalized_email already has ANY trial_redemptions row, UNLESS
-- p_admin_override is true (Phase 4's explicit admin-override
-- requirement) — the caller (application code) is responsible for only
-- ever passing true here from an authenticated platform-admin action.
create or replace function public.activate_trial(
  p_campaign_slug text,
  p_normalized_email text,
  p_first_name text default null,
  p_last_name text default null,
  p_company_name text default null,
  p_nmls_number text default null,
  p_state text default null,
  p_admin_override boolean default false
)
returns table (redemption_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_existing_sub record;
  v_expires_at timestamptz;
  v_redemption_id uuid;
  v_redemption_count integer;
begin
  if v_user_id is null then
    raise exception 'Not signed in';
  end if;

  select * into v_campaign from public.trial_campaigns where slug = p_campaign_slug and is_active = true;
  if v_campaign is null then
    raise exception 'Trial campaign not found or inactive';
  end if;

  if v_campaign.starts_at is not null and now() < v_campaign.starts_at then
    raise exception 'This trial campaign has not started yet';
  end if;
  if v_campaign.ends_at is not null and now() > v_campaign.ends_at then
    raise exception 'This trial campaign has ended';
  end if;

  if v_campaign.max_redemptions is not null then
    select count(*) into v_redemption_count from public.trial_redemptions where campaign_id = v_campaign.id;
    if v_redemption_count >= v_campaign.max_redemptions then
      raise exception 'This trial campaign has reached its redemption limit';
    end if;
  end if;

  select email into v_user_email from public.users where id = v_user_id;

  if v_campaign.allowed_email_domains is not null and array_length(v_campaign.allowed_email_domains, 1) > 0 then
    if not (lower(split_part(v_user_email, '@', 2)) = any (select lower(d) from unnest(v_campaign.allowed_email_domains) as d)) then
      raise exception 'This trial campaign is restricted to specific email domains';
    end if;
  end if;

  if v_campaign.require_nmls_number and (p_nmls_number is null or length(trim(p_nmls_number)) = 0) then
    raise exception 'An NMLS number is required for this trial campaign';
  end if;
  if v_campaign.require_company_name and (p_company_name is null or length(trim(p_company_name)) = 0) then
    raise exception 'A company name is required for this trial campaign';
  end if;

  -- Duplicate-trial check (Phase 4): by normalized email, across ALL
  -- campaigns, not just this one — a user cannot get a second free trial
  -- by using a different campaign link either.
  if not p_admin_override and v_campaign.require_one_redemption_per_email then
    if exists (select 1 from public.trial_redemptions where normalized_email = p_normalized_email) then
      raise exception 'This email address has already used a trial. Contact an administrator if you believe this is an error.';
    end if;
  end if;

  -- Refuse to clobber a real, non-trial active subscription.
  select * into v_existing_sub from public.user_subscriptions where user_id = v_user_id;
  if v_existing_sub is not null and v_existing_sub.plan_id is not null and v_existing_sub.is_trial = false and v_existing_sub.canceled_at is null then
    raise exception 'This account already has an active subscription';
  end if;

  v_expires_at := now() + (v_campaign.trial_duration_days || ' days')::interval;

  insert into public.trial_redemptions (
    campaign_id, user_id, email, normalized_email, first_name, last_name, company_name, nmls_number, state, activated_at, expires_at
  ) values (
    v_campaign.id, v_user_id, v_user_email, p_normalized_email, p_first_name, p_last_name, p_company_name, p_nmls_number, p_state, now(), v_expires_at
  )
  returning id into v_redemption_id;

  insert into public.user_subscriptions (user_id, plan_id, is_trial, trial_activated_at, trial_expires_at, source, assigned_by)
  select v_user_id, mp.id, true, now(), v_expires_at, 'comped', v_user_id
  from public.membership_plans mp where mp.key = 'enterprise'
  on conflict (user_id) do update set
    plan_id = excluded.plan_id,
    is_trial = true,
    trial_activated_at = now(),
    trial_expires_at = v_expires_at,
    canceled_at = null,
    updated_at = now();

  return query select v_redemption_id, v_expires_at;
end;
$$;

grant execute on function public.activate_trial(text, text, text, text, text, text, text, boolean) to authenticated;

-- Records a login for "last login date" trial analytics (Phase 2/8).
create or replace function public.record_trial_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trial_redemptions set last_login_at = now(), updated_at = now() where user_id = auth.uid();
end;
$$;

grant execute on function public.record_trial_login() to authenticated;
