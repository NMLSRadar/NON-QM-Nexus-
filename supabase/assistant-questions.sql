-- AI assistant unanswered-questions / feedback queue (2026-08-10 chatbot
-- precision upgrade, spec §8).
--
-- The flywheel: every non-answer and every thumbs-down lands here, scoped to
-- the asking user's organization, so the same admins who maintain the
-- guideline library can see exactly which questions the library couldn't
-- answer and fill the gap. Question text IS stored (that's the point) — it
-- may contain borrower details, so reads are restricted to the member's own
-- org admins and platform admins; there is no cross-org visibility.
--
-- Uses the helper functions defined in rls-policies.sql:
--   public.user_org_ids()          — orgs the caller belongs to
--   public.user_has_role(org, roles) — role check within an org

create table if not exists public.assistant_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  question text not null,
  intent text not null,
  reason text not null check (reason in ('non_answer', 'thumbs_down')),
  detail text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists assistant_questions_org_idx on public.assistant_questions (organization_id, created_at desc);
create index if not exists assistant_questions_open_idx on public.assistant_questions (organization_id) where resolved_at is null;

alter table public.assistant_questions enable row level security;

-- Members insert rows for their OWN org only (the route also derives the org
-- server-side from the caller's membership, never from client input).
drop policy if exists assistant_questions_member_insert on public.assistant_questions;
create policy assistant_questions_member_insert on public.assistant_questions
  for insert with check (
    auth.uid() = user_id
    and organization_id in (select public.user_org_ids())
  );

-- Read: platform admins, plus org admins for their own org's queue.
drop policy if exists assistant_questions_admin_read on public.assistant_questions;
create policy assistant_questions_admin_read on public.assistant_questions
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
    or public.user_has_role(organization_id, array['org_admin'])
  );

-- Resolve (update): same audience as read.
drop policy if exists assistant_questions_admin_update on public.assistant_questions;
create policy assistant_questions_admin_update on public.assistant_questions
  for update using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
    or public.user_has_role(organization_id, array['org_admin'])
  );
