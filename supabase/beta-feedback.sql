-- Beta Tester Feedback — automated survey + Day 3 / Day 5 email automation.
--
-- One row per user (a beta tester who activated a trial). `trial_started_at`
-- is copied from trial_redemptions.activated_at (the exact trial start date),
-- and ALL Day-3 / Day-5 automation timing is derived from THAT column, never
-- from any other timestamp — see the "Automation logic" note in
-- src/app/api/cron/beta-feedback/route.ts.
--
-- Status lifecycle:
--   NOT_SENT            -> created, Day-3 email not yet sent
--   SENT                -> Day-3 email sent (idempotent via day3_email_id)
--   OPENED              -> tester opened the survey link
--   STARTED             -> first answer saved
--   PARTIALLY_COMPLETED -> 2..(total-1) answers saved (autosave, resumable)
--   COMPLETED           -> all questions answered (terminal; removed from the
--                          Day-5 follow-up queue)
--   FOLLOW_UP_SENT      -> Day-5 follow-up sent (only if not already COMPLETED)
-- The Day-5 follow-up also has its own idempotency columns
-- (day5_follow_up_sent_at + day5_email_id), so a repeated cron run never sends
-- a duplicate.

create table if not exists public.beta_tester_surveys (
  id uuid primary key default gen_random_uuid(),
  -- The owning user. Unique -> a user/account can only ever have ONE survey
  -- (the "do not create duplicate surveys" requirement).
  user_id uuid not null unique references public.users(id) on delete cascade,
  trial_redemption_id uuid unique references public.trial_redemptions(id) on delete set null,
  -- EXACT trial start date, copied from trial_redemptions.activated_at.
  trial_started_at timestamptz not null,
  status text not null default 'NOT_SENT',
  -- Secure, unguessable survey link token (64 hex chars). The survey page and
  -- every survey server action authenticate BY this token; the token is the
  -- capability, and the high entropy makes it unforgeable.
  token text not null unique,
  -- Day 3 idempotency markers (email not resent if either is set).
  day3_email_sent_at timestamptz,
  day3_email_id text,
  opened_at timestamptz,
  started_at timestamptz,
  last_answered_at timestamptz,
  completed_at timestamptz,
  completion_percentage integer not null default 0,
  -- Day 5 follow-up idempotency markers.
  day5_follow_up_sent_at timestamptz,
  day5_email_id text,
  -- JSONB of { <question_id>: <value> } — autonumbered ratings, choice labels,
  -- or short text. Autosaved incrementally; never replaced wholesale, so a
  -- partially-completed survey always resumes exactly where it left off.
  responses jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_tester_surveys_status_check check (
    status in ('NOT_SENT','SENT','OPENED','STARTED','PARTIALLY_COMPLETED','COMPLETED','FOLLOW_UP_SENT')
  )
);

create index if not exists beta_tester_surveys_status_idx on public.beta_tester_surveys (status);
create index if not exists beta_tester_surveys_token_idx on public.beta_tester_surveys (token);

-- RLS: locked down by default. Only platform_admins (and the caller's own read
-- of their own row) can touch this table directly; all survey-write traffic
-- goes through server-side service-role actions that authenticate by token.
-- See src/app/survey/[token]/actions.ts.
alter table public.beta_tester_surveys enable row level security;

drop policy if exists beta_tester_surveys_admin_all on public.beta_tester_surveys;
create policy beta_tester_surveys_admin_all on public.beta_tester_surveys
  for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true));

drop policy if exists beta_tester_surveys_own_read on public.beta_tester_surveys;
create policy beta_tester_surveys_own_read on public.beta_tester_surveys
  for select
  using (user_id = auth.uid());

-- SECURITY DEFINER: creates the caller's OWN survey row (if missing) at trial
-- activation, so "record the exact trial start date" happens the moment a test
-- trial begins — with the exact activated_at as trial_started_at. Narrowly
-- scoped: it can only ever insert/auth the caller's own row, never touch
-- another user's or any existing row (ON CONFLICT DO NOTHING). Called from the
-- trial activation email step (src/app/trial/[slug]/activate/actions.ts).
-- Fail-soft there: a missing table just logs and never blocks activation.
create or replace function public.ensure_beta_survey_for_me()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started_at timestamptz;
  v_redemption_id uuid;
begin
  select tr.activated_at, tr.id into v_started_at, v_redemption_id
    from public.trial_redemptions tr
    where tr.user_id = auth.uid() and tr.revoked_at is null
    order by tr.activated_at desc
    limit 1;
  if v_started_at is null then
    return;
  end if;
  insert into public.beta_tester_surveys (user_id, trial_redemption_id, trial_started_at, status, token)
  values (auth.uid(), v_redemption_id, v_started_at, 'NOT_SENT', encode(gen_random_bytes(32), 'hex'))
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.ensure_beta_survey_for_me() to authenticated;