-- App-generated trial beta-invite tokens (2026-08-11).
--
-- Replaces the earlier dependency on Supabase admin `generateLink({type:"invite"})`
-- for the streamlined beta flow. The old approach relied on Supabase's hosted
-- verify link bouncing the invitee back to /trial/[slug]/invite-accept with a
-- session in the URL hash, which was inconsistent and left invitees stuck on
-- "We couldn't verify your invitation link" (and then "Invalid login
-- credentials" at login, because the admin-created account sat unconfirmed
-- with no password).
--
-- Now the admin-side invite is a plain app link (…?token=<raw>); the invite-accept
-- page validates it server-side by SHA-256 hash of the raw token against this
-- table (same convention as org_invites / shared_links.tokenHash). Only the hash
-- is stored — the raw token exists exactly once, in the invite email/link.
create table if not exists public.trial_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.trial_campaigns(id) on delete cascade,
  email text not null,
  normalized_email text not null, -- lowercased + trimmed, for lookups
  token_hash text not null unique, -- sha256 hex of the raw token; only the hash is stored
  created_by uuid references public.users(id), -- the platform admin who sent the invite
  created_at timestamptz not null default now(),
  expires_at timestamptz not null, -- server-side computed; never trusted from a client
  accepted_at timestamptz, -- set once the invitee completes setup / the trial activates
  revoked_at timestamptz
);

-- Only allow one ACTIVE pending invite per (email, campaign). A completed or
-- revoked invite is ignored by this constraint so the admin can re-invite later.
create unique index if not exists trial_invites_active_pending_uq
  on public.trial_invites (normalized_email, campaign_id)
  where accepted_at is null and revoked_at is null;

create index if not exists trial_invites_normalized_email_idx
  on public.trial_invites (normalized_email);

-- Locked down: the invite-accept page validates via the service-role client,
-- and the admin issues invites via the service-role client. No anon/authenticated
-- role ever reads or writes trial_invites directly, so RLS is enabled with no
-- policies (service role bypasses RLS).
alter table public.trial_invites enable row level security;