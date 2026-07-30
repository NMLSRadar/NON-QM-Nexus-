-- NON-QM Nexus — invite-aware signup completion.
--
-- Every signup normally auto-provisions its own organization (see
-- onboarding-trigger.sql's handle_new_user()). An invited signup must NOT:
-- src/app/signup/actions.ts passes the raw invite token through Supabase
-- Auth's signUp({ options: { data: { invite_token } } }) user metadata, so
-- it lands in new.raw_user_meta_data by the time this trigger fires. This
-- replaces handle_new_user() to check for that token FIRST: if it resolves
-- to a real, still-valid (unaccepted, unrevoked, unexpired), email-matching
-- org_invites row, the user is added to the INVITING org (with the invite's
-- role, and coverage on iff a seat is free) and organization auto-creation
-- is skipped entirely. Any other case (no token, or a bogus/expired/
-- mismatched one) falls through to the exact original behavior — this is
-- the regression the spec calls for: normal signups keep auto-provisioning
-- exactly as before (see tests/integration/invitedSignupNoAutoOrg.test.ts).
--
-- Hashing must match src/lib/invites.ts's hashInviteToken() exactly
-- (SHA-256, lowercase hex) — pgcrypto's digest()/encode() here, Node's
-- node:crypto createHash("sha256") there.
--
-- Apply AFTER onboarding-trigger.sql and team-membership-schema.sql.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  raw_token text;
  token_hash text;
  invite record;
  active_seat_count int;
  covered_count int;
  will_be_covered boolean;
begin
  raw_token := new.raw_user_meta_data ->> 'invite_token';

  if raw_token is not null and length(raw_token) > 0 then
    token_hash := encode(digest(raw_token, 'sha256'), 'hex');

    select oi.id, oi.organization_id, oi.role, oi.expires_at, oi.accepted_at, oi.revoked_at, oi.email
      into invite
      from org_invites oi
      where oi.token_hash = handle_new_user.token_hash;

    if found
      and invite.accepted_at is null
      and invite.revoked_at is null
      and invite.expires_at > now()
      and lower(invite.email) = lower(new.email)
    then
      insert into public.users (id, email, updated_at)
      values (new.id, new.email, now())
      on conflict (id) do nothing;

      select os.seat_count into active_seat_count
        from org_subscriptions os
        where os.organization_id = invite.organization_id and os.status = 'active'
        limit 1;

      if active_seat_count is not null then
        select count(*) into covered_count
          from memberships m
          where m.organization_id = invite.organization_id
            and m.covered_by_org_plan = true
            and m.deleted_at is null;
      end if;

      will_be_covered := active_seat_count is not null and coalesce(covered_count, 0) < active_seat_count;

      insert into public.memberships (organization_id, user_id, role, covered_by_org_plan, updated_at)
      values (invite.organization_id, new.id, invite.role, will_be_covered, now());

      update org_invites set accepted_at = now() where id = invite.id;

      -- Invited signup: membership created in the inviting org, organization
      -- auto-creation skipped entirely.
      return new;
    end if;
  end if;

  -- Normal signup (no invite token, or an invalid one) — original behavior,
  -- unchanged.
  insert into public.users (id, email, updated_at)
  values (new.id, new.email, now())
  on conflict (id) do nothing;

  insert into public.organizations (name, updated_at)
  values (coalesce(split_part(new.email, '@', 1), 'My') || '''s Organization', now())
  returning id into new_org_id;

  insert into public.memberships (organization_id, user_id, role, updated_at)
  values (new_org_id, new.id, 'org_admin', now());

  return new;
end;
$$;

-- Trigger itself is unchanged (still on_auth_user_created -> handle_new_user);
-- re-declaring is harmless and keeps this file self-contained / re-runnable.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
