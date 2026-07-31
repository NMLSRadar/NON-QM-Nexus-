-- PWA install funnel instrumentation (2026-07-31).
--
-- Counts only, never viewer identity — same shape as ae_profile_events.
-- Tracks the native-install funnel (prompt_shown -> accepted/dismissed ->
-- installed) plus the iOS manual-instructions flow, since iOS Safari never
-- fires beforeinstallprompt/appinstalled and needs its own funnel events.

create table if not exists public.pwa_install_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (
    event in (
      'prompt_shown',      -- beforeinstallprompt fired, custom CTA rendered (Android/desktop Chrome/Edge)
      'prompt_accepted',    -- user accepted the native install dialog
      'prompt_dismissed',   -- user dismissed the native install dialog
      'installed',          -- appinstalled fired (belt-and-suspenders vs. prompt_accepted)
      'ios_instructions_shown', -- iOS Safari CTA opened the "Add to Home Screen" guidance
      'ios_instructions_dismissed'
    )
  ),
  platform text not null check (platform in ('android_desktop', 'ios')),
  created_at timestamptz not null default now()
);
create index if not exists pwa_install_events_event_idx on public.pwa_install_events (event, created_at);

alter table public.pwa_install_events enable row level security;
-- No public read policy — written by a route handler using the service-role
-- client (src/app/api/pwa/track/route.ts), read only by platform admins.
drop policy if exists pwa_install_events_admin_read on public.pwa_install_events;
create policy pwa_install_events_admin_read on public.pwa_install_events
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.platform_admin = true)
  );
