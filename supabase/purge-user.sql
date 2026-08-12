-- Non-QM Nexus — complete account purge + signup-trigger hardening.
--
-- WHY THIS FILE EXISTS (matthew@easemortgage.com, 2026-08-12):
-- Deleting a user from the Supabase AUTH dashboard only removes auth.users.
-- The app's OWN tables keep that email (public.users, trial_redemptions,
-- user_subscriptions, trial_invites, ...), and public.users.email is UNIQUE —
-- so the next account creation for the same email fails inside the
-- handle_new_user trigger ("Database error creating new user") because the
-- stale public.users row blocks the insert, and the whole auth transaction
-- rolls back. The owner is then stuck: the email "doesn't exist" in auth yet
-- cannot be re-created.
--
-- FIX, IN ONE RUN:
--   1) purge_user_by_email('someone@example.com') — a durable, transaction-
--      safe cleanup of EVERYTHING tied to that email (auth + app tables),
--      callable any time from the SQL editor. Use THIS instead of the auth
--      dashboard delete button from now on.
--   2) A hardened handle_new_user(): the normal-signup branch now uses the
--      same exception safety net as the invite branch — a leftover/stale row
--      can no longer silently block account creation; it is logged to
--      signup_trigger_errors (domain only, no full email) and signup proceeds.
--
-- The call below is commented out — uncomment and run after the functions are
-- created, or call it separately once.
--
--   select purge_user_by_email('matthew@easemortgage.com');

-- ===========================================================================
-- 1) Complete purge for ONE email
-- ===========================================================================
create or replace function public.purge_user_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid;
  v_auth_uid uuid;
  n bigint;
  result jsonb := '{}'::jsonb;
begin
  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  select id into v_uid from public.users where lower(email) = v_email limit 1;
  select id into v_auth_uid from auth.users where lower(email) = v_email limit 1;

  -- App tables keyed by user_id
  declare
    _t record;
  begin
    for _t in select * from (values
      ('user_profiles','user_id'), ('memberships','user_id'),
      ('user_subscriptions','user_id'), ('trial_redemptions','user_id'),
      ('beta_tester_surveys','user_id'), ('audit_logs','user_id'),
      ('ai_requests','user_id')
    ) as t(tbl text, col text) loop
      begin
        if v_uid is not null and to_regclass(format('public.%I', _t.tbl)) is not null then
          execute format('delete from public.%I where %I = %L', _t.tbl, _t.col, v_uid);
          get diagnostics n = row_count;
          result := result || jsonb_build_object(_t.tbl, n);
        end if;
      exception when others then
        result := result || jsonb_build_object(_t.tbl, format('skipped: %s', sqlerrm));
      end;
    end loop;
  end;

  -- Tables keyed by email / normalized email
  declare
    _t record;
  begin
    for _t in select * from (values
      ('trial_redemptions','normalized_email'), ('trial_invites','normalized_email'),
      ('org_invites','email'), ('outreach_contacts','email'),
      ('email_suppressions','email'), ('ae_profiles','email'),
      ('ae_placements','email'), ('lenders','contact_email')
    ) as t(tbl text, col text) loop
      begin
        if to_regclass(format('public.%I', _t.tbl)) is not null then
          execute format('delete from public.%I where lower(%I) = %L', _t.tbl, _t.col, v_email);
          get diagnostics n = row_count;
          result := result || jsonb_build_object(_t.tbl, n);
        end if;
      exception when others then
        result := result || jsonb_build_object(_t.tbl, format('skipped: %s', sqlerrm));
      end;
    end loop;
  end;

  -- Null out creator stamps so the users row can be removed even if org-owned
  -- records (scenarios, lenders, programs, ...) reference it.
  if v_uid is not null then
    for _t in select * from (values
      ('scenarios','created_by'), ('lenders','created_by'),
      ('programs','created_by'), ('guideline_versions','created_by'),
      ('trial_campaigns','created_by')
    ) as t(tbl text, col text) loop
      begin
        if to_regclass(format('public.%I', _t.tbl)) is not null then
          execute format('update public.%I set %I = null where %I = %L', _t.tbl, _t.col, _t.col, v_uid);
          get diagnostics n = row_count;
          result := result || jsonb_build_object(format('%s.stamps_nulled', _t.tbl), n);
        end if;
      exception when others then
        result := result || jsonb_build_object(format('%s.stamps_nulled', _t.tbl), format('skipped: %s', sqlerrm));
      end;
    end loop;
  end if;

  -- User-created share links (created_by is NOT NULL — delete, don't null)
  if v_uid is not null and to_regclass('public.shared_links') is not null then
    begin
      execute format('delete from public.shared_links where created_by = %L', v_uid);
      get diagnostics n = row_count; result := result || jsonb_build_object('shared_links', n);
    exception when others then
      result := result || jsonb_build_object('shared_links', format('skipped: %s', sqlerrm));
    end;
  end if;

  -- Auth tables (must be deleted before public.users for FK order)
  if v_auth_uid is not null then
    begin
      delete from auth.refresh_tokens where user_id = v_auth_uid;
      get diagnostics n = row_count; result := result || jsonb_build_object('auth.refresh_tokens', n);
    exception when others then null; end;
    begin
      delete from auth.sessions where user_id = v_auth_uid;
      get diagnostics n = row_count; result := result || jsonb_build_object('auth.sessions', n);
    exception when others then null; end;
    begin
      delete from auth.identities where user_id = v_auth_uid;
      get diagnostics n = row_count; result := result || jsonb_build_object('auth.identities', n);
    exception when others then null; end;
    begin
      delete from auth.users where id = v_auth_uid;
      get diagnostics n = row_count; result := result || jsonb_build_object('auth.users', n);
    exception when others then
      result := result || jsonb_build_object('auth.users', format('skipped: %s', sqlerrm));
    end;
  end if;

  -- The app-side users row last (children already gone)
  if v_uid is not null then
    begin
      delete from public.users where id = v_uid;
      get diagnostics n = row_count; result := result || jsonb_build_object('public.users', n);
    exception when others then
      result := result || jsonb_build_object('public.users', format('skipped: %s', sqlerrm));
    end;
  end if;

  return result;
end;
$$;

-- ===========================================================================
-- 2) Hardened handle_new_user: a stale/blocking row must NEVER fail signup.
--    Same exception safety net the invite branch already has. The insert into
--    public.users for the NORMAL path is wrapped so that a leftover row for
--    the email (unique violation) is logged (domain only) and signup continues
--    instead of aborting the auth transaction. Invite branch unchanged.
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  raw_token text;
  v_token_hash text;
  invite record;
  active_seat_count int;
  covered_count int;
  will_be_covered boolean;
begin
  raw_token := new.raw_user_meta_data ->> 'invite_token';

  if raw_token is not null and length(raw_token) > 0 then
   begin
    v_token_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

    select oi.id, oi.organization_id, oi.role, oi.expires_at, oi.accepted_at, oi.revoked_at, oi.email
      into invite
      from org_invites oi
      where oi.token_hash = v_token_hash;

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
   exception when others then
    raise warning 'handle_new_user invite branch failed: % (SQLSTATE %)', sqlerrm, sqlstate;
    insert into public.signup_trigger_errors (id, sqlstate, message, email_domain_only)
    values (gen_random_uuid(), sqlstate, sqlerrm, split_part(new.email, '@', 2));
   end;
  end if;

  -- Normal signup (no invite token, or an invalid one). Original behavior,
  -- BUT wrapped in the same safety net: a stale public.users row for this
  -- email (unique violation on users.email) must not abort account creation —
  -- log it (domain only) and let the auth account stand; the app/support can
  -- then purge properly via purge_user_by_email().
  begin
    insert into public.users (id, email, updated_at)
    values (new.id, new.email, now())
    on conflict (id) do nothing;

    insert into public.organizations (name, updated_at)
    values (coalesce(split_part(new.email, '@', 1), 'My') || '''s Organization', now())
    returning id into new_org_id;

    insert into public.memberships (organization_id, user_id, role, updated_at)
    values (new_org_id, new.id, 'org_admin', now());
  exception when others then
    raise warning 'handle_new_user normal branch failed: % (SQLSTATE %)', sqlerrm, sqlstate;
    insert into public.signup_trigger_errors (id, sqlstate, message, email_domain_only)
    values (gen_random_uuid(), sqlstate, sqlerrm, split_part(new.email, '@', 2));
  end;

  return new;
end;
$$;

-- Re-declare the trigger (idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
