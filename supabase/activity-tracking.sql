-- NON-QM Nexus — Activity & Beta Testing analytics (2026-08-10).
--
-- ONE table (user_activity_events) answers "who is actually using NEXUS,
-- how often, which features". Every derived figure on the /admin/activity
-- Active Users & Beta Testers screen comes from this single table — no
-- per-feature counter columns, no parallel tracking system. Rows always
-- join to the existing public.users id, never a separate tracking user.
--
-- users gets two flags: is_beta_tester (a boolean separate from trial /
-- paid status — a beta tester can be trial OR paid) and beta_granted_at.

create table if not exists public.user_activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  event_type  text not null check (event_type in (
    'login', 'scenario_submitted', 'voice_scenario', 'ai_assistant',
    'lender_list', 'programs', 'doc_needs', 'products'
  )),
  occurred_at timestamptz not null default now(),
  metadata    jsonb
);

create index if not exists user_activity_events_user_idx
  on public.user_activity_events (user_id, occurred_at desc);
create index if not exists user_activity_events_occurred_idx
  on public.user_activity_events (occurred_at desc);

comment on table public.user_activity_events is
  'Single source of truth for user activity. Summary figures (last login, last activity, scenario count, features used, days idle, top feature) are derived from this table, never stored in per-feature columns.';

-- RLS: platform admins manage/everything; a user reads + records their own
-- activity (login events are written from middleware with the user's own
-- session; feature events from server actions/routes with that session).
alter table public.user_activity_events enable row level security;

drop policy if exists activity_admin_all on public.user_activity_events;
create policy activity_admin_all on public.user_activity_events
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists activity_own on public.user_activity_events;
create policy activity_own on public.user_activity_events
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Beta tester flags on the existing public.users row.
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists is_beta_tester boolean not null default false;
alter table public.users add column if not exists beta_granted_at timestamptz;

comment on column public.users.is_beta_tester is
  'True when this account was invited/flagged as a beta tester. Separate from trial/paid status — shown as a small secondary chip because a beta tester can also be trial or paid.';
comment on column public.users.beta_granted_at is
  'When is_beta_tester was first set.';

-- ---------------------------------------------------------------------------
-- Derived read-side views (the screen never hand-rolls these aggregates).
-- security_invoker so RLS still applies to anon/user-session reads; the
-- service-role client used by the admin screen bypasses RLS anyway.
-- ---------------------------------------------------------------------------
create or replace view public.user_activity_summary
with (security_invoker = true)
as
select
  user_id,
  count(*)                                              as event_count,
  count(*) filter (where event_type = 'login')          as logins,
  count(*) filter (where event_type = 'scenario_submitted') as scenarios,
  count(*) filter (where event_type = 'voice_scenario') as voice_scenarios,
  count(*) filter (where event_type = 'ai_assistant')   as ai_assistant,
  count(*) filter (where event_type = 'lender_list')    as lender_list,
  count(*) filter (where event_type = 'programs')       as programs,
  count(*) filter (where event_type = 'doc_needs')      as doc_needs,
  count(*) filter (where event_type = 'products')       as products,
  max(occurred_at)                                      as last_activity,
  max(occurred_at) filter (where event_type = 'login')  as last_login
from public.user_activity_events
group by user_id;

-- Each user's most recent 20 events (newest first), for the inline expand
-- timeline. row_number() 1 = most recent. Filter rn <= 20 at query time.
create or replace view public.user_activity_timeline
with (security_invoker = true)
as
select
  user_id,
  event_type,
  occurred_at,
  metadata,
  row_number() over (partition by user_id order by occurred_at desc) as rn
from public.user_activity_events;

-- ---------------------------------------------------------------------------
-- Extend activate_trial to optionally flag the caller as a beta tester
-- (p_is_beta). The streamlined beta-invite flow (admin invite -> email ->
-- /trial/[slug]/invite-accept) passes TRUE so invited LOs are automatically
-- marked beta; the ordinary /trial/[slug] signup path defaults to false.
-- ---------------------------------------------------------------------------
create or replace function public.activate_trial(
  p_campaign_slug text,
  p_normalized_email text,
  p_first_name text default null,
  p_last_name text default null,
  p_company_name text default null,
  p_nmls_number text default null,
  p_state text default null,
  p_admin_override boolean default false,
  p_is_beta boolean default false
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

  -- Duplicate-trial check: by normalized email, across ALL campaigns.
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

  -- Beta flag for invited testers.
  if p_is_beta then
    update public.users
    set is_beta_tester = true,
        beta_granted_at = coalesce(beta_granted_at, now()),
        updated_at = now()
    where id = v_user_id;
  end if;

  return query select v_redemption_id, v_expires_at;
end;
$$;

grant execute on function public.activate_trial(text, text, text, text, text, text, text, boolean, boolean) to authenticated;