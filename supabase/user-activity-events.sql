-- Tutorial analytics on the shared activity table (2026-08-10).
--
-- The user_activity_events table is defined authoritatively in
-- supabase/activity-tracking.sql (user-scoped activity for the /admin/activity
-- Active Users & Beta Testers screen). This file UPGRADES that table so the
-- public /tutorial page can reuse it for tutorial analytics, per the tutorial
-- spec: "log to the existing user_activity_events table using the existing
-- user ID ... anonymous visitors are counted but not user-linked."
--
-- Two deliberate changes to the upstream schema:
--   1. event_type CHECK gains the three tutorial_* event types.
--   2. user_id becomes NULLABLE — tutorial rows for anonymous visitors carry
--      user_id = NULL (counted, never user-linked). The /admin/activity screen
--      renders one row per user from the users table and looks up the summary
--      by user_id, so anonymous rows never surface there.
--
-- Idempotent: safe to run on a fresh DB (creates the full final shape) or on
-- a database that already has the upstream table (the alters upgrade it).
-- Writes come from src/app/api/tutorial/events/route.ts via the service-role
-- client (RLS bypassed, same as /api/pwa/track); rows never carry PII.

create table if not exists public.user_activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  event_type  text not null check (event_type in (
    'login', 'scenario_submitted', 'voice_scenario', 'ai_assistant',
    'lender_list', 'programs', 'doc_needs', 'products',
    'tutorial_viewed', 'tutorial_section_viewed', 'tutorial_cta_clicked'
  )),
  occurred_at timestamptz not null default now(),
  metadata    jsonb
);

-- Upgrade path when the upstream table already exists:
--  * allow anonymous tutorial rows (user_id NULL) — dropped NOT NULL,
--  * extend the event_type whitelist with the tutorial events.
alter table public.user_activity_events alter column user_id drop not null;
alter table public.user_activity_events drop constraint if exists user_activity_events_event_type_check;
alter table public.user_activity_events add constraint user_activity_events_event_type_check
  check (event_type in (
    'login', 'scenario_submitted', 'voice_scenario', 'ai_assistant',
    'lender_list', 'programs', 'doc_needs', 'products',
    'tutorial_viewed', 'tutorial_section_viewed', 'tutorial_cta_clicked'
  ));

create index if not exists user_activity_events_type_idx
  on public.user_activity_events (event_type, occurred_at desc);
create index if not exists user_activity_events_user_idx
  on public.user_activity_events (user_id, occurred_at desc);
create index if not exists user_activity_events_occurred_idx
  on public.user_activity_events (occurred_at desc);

-- RLS stays as upstream defined it (activity_admin_all + activity_own in
-- activity-tracking.sql). This file only adds an admin read path that does
-- not depend on the is_platform_admin() helper, for databases where this
-- script created the table standalone.
alter table public.user_activity_events enable row level security;
drop policy if exists user_activity_events_admin_read on public.user_activity_events;
create policy user_activity_events_admin_read on public.user_activity_events
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );

comment on table public.user_activity_events is
  'User activity (login/scenario/feature events, see activity-tracking.sql) plus tutorial analytics. tutorial_* rows may have user_id = NULL for anonymous visitors — counted but never user-linked; the admin activity screen only renders per-user rows, so anonymous rows are invisible there.';
