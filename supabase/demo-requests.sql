-- Live-demo intake log (2026-08-16).
--
-- A visitor on the public /demo page submits name/email/phone. The server
-- action (src/app/demo/actions.ts) inserts a row here via the service-role
-- client (RLS bypassed) and then redirects the visitor to the booking
-- scheduler (see DEMO_BOOKING_URL in src/lib/demo.ts) to pick a time.
--
-- /admin/demo-requests renders this log so the team can track who has
-- requested a demo and follow up. `status` is a simple pipeline for the
-- team to set as they work the lead.
--
-- Idempotent: safe to run on a fresh DB (creates the full shape) or on a
-- database that already has the table (the alters upgrade it).

create table if not exists public.demo_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text not null,
  status     text not null default 'new'
             check (status in ('new', 'booked', 'reached_out', 'completed', 'declined')),
  created_at timestamptz not null default now()
);

-- Upgrade path when the table already exists without the final shape.
alter table public.demo_requests alter column name set not null;
alter table public.demo_requests alter column email set not null;
alter table public.demo_requests alter column phone set not null;
alter table public.demo_requests drop constraint if exists demo_requests_status_check;
alter table public.demo_requests add constraint demo_requests_status_check
  check (status in ('new', 'booked', 'reached_out', 'completed', 'declined'));

create index if not exists demo_requests_created_idx
  on public.demo_requests (created_at desc);

-- RLS: public visitors submit via the service-role client (bypass), so no
-- anonymous insert/read policy is granted. Only platform admins can read.
alter table public.demo_requests enable row level security;
drop policy if exists demo_requests_admin_read on public.demo_requests;
create policy demo_requests_admin_read on public.demo_requests
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );

comment on table public.demo_requests is
  'Live-demo leads from the public /demo form (name/email/phone). Writes come from the server action via the service-role client; only platform admins read via RLS.';