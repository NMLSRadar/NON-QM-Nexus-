-- Tutorial + lightweight user-activity instrumentation (2026-08-10).
--
-- One tiny table for anonymous-friendly product events. Follows the exact
-- house pattern of pwa_install_events.sql:
--   * written by a route handler with the service-role client (so RLS never
--     blocks a public page's fire-and-forget POST — see
--     src/app/api/tutorial/events/route.ts),
--   * rows are counts-first: user_id is optional and only ever set from a
--     server-side verified Supabase session, never from client input,
--   * no public read policy — analytics reads are for platform admins only.
--
-- Event types (validated server-side in the route handler):
--   tutorial_viewed         the /tutorial page was opened
--   tutorial_section_viewed a section scrolled into view (metadata.slug)
--   tutorial_cta_clicked    a "Try it" deep-link CTA was clicked (metadata.slug)
--
-- Anonymous visitors are counted as rows with user_id = NULL; they are never
-- user-linked. Requires `create extension if not exists pgcrypto;` (already
-- standard on Supabase) for gen_random_uuid().

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (
    event_type in (
      'tutorial_viewed',
      'tutorial_section_viewed',
      'tutorial_cta_clicked'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_events_type_idx
  on public.user_activity_events (event_type, created_at desc);
create index if not exists user_activity_events_user_idx
  on public.user_activity_events (user_id, created_at desc);

-- The service-role client bypasses RLS, so table-level grants to the anon
-- and authenticated roles are NOT needed for writes (the route uses
-- createServiceRoleClient, exactly like src/app/api/pwa/track/route.ts).
-- They are granted read to nobody; the only read path is the platform-admin
-- policy below (mirrors pwa_install_events_admin_read).
alter table public.user_activity_events enable row level security;

drop policy if exists user_activity_events_admin_read on public.user_activity_events;
create policy user_activity_events_admin_read on public.user_activity_events
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );
