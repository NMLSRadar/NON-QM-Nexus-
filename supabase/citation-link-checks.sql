-- Tracks the last known liveness status of each unique citation URL found
-- across programs.config.sourceCitation, so the weekly citation-check cron
-- can alert only on NEW breaks (a URL that was fine last week and is now
-- 4xx/5xx) rather than re-alerting every run for a URL already known to be
-- broken (or a persistent bot-block false positive already investigated).
create table if not exists public.citation_link_checks (
  url text primary key,
  last_status integer,
  last_checked_at timestamptz not null default now(),
  is_broken boolean not null default false,
  first_broken_at timestamptz,
  last_error text
);

alter table public.citation_link_checks enable row level security;

-- Service-role only (the cron job uses the service-role client) — this is
-- operational monitoring state, not user-facing data, so no public/anon
-- policy is defined at all.
