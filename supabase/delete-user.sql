-- NON-QM Nexus — Admin user deletion (2026-08-10).
--
-- ONE atomic SECURITY DEFINER function removes a user from every table that
-- references public.users (RESTRICT FKs would block a plain delete), wipes
-- any personal organization that ends up with zero members, and finally
-- deletes the users row itself. All in a single transaction: either
-- everything is removed or nothing is.
--
-- What it does NOT do (handled by the app action, superset):
--   * Cancel live Stripe subscriptions (personal + team) — must happen
--     BEFORE this function runs, or a paying account could be deleted
--     mid-period.
--   * Delete the auth.users account (service.auth.admin.deleteUser) —
--     that's what kills the person's ability to sign in, and it must be
--     done before/around this call so a deleted user can never log in.
--
-- Authorization: only a platform admin may call it (checked inside, via
-- auth.uid(), so the function is safe even though it runs as SECURITY
-- DEFINER and bypasses RLS). Grants nothing to non-admins.

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_admin boolean;
  v_target record;
  v_org uuid;
  v_orgs uuid[] := '{}';
  v_remaining int;
begin
  -- Authorization: caller must be a platform admin.
  select platform_admin into v_caller_admin from public.users where id = auth.uid();
  if not coalesce(v_caller_admin, false) then
    raise exception 'Not authorized';
  end if;

  -- Guards mirroring the app action (defense in depth — never trust UI).
  select id, platform_admin into v_target from public.users where id = p_user_id;
  if v_target is not null and v_target.platform_admin then
    raise exception 'Platform administrators cannot be deleted';
  end if;
  if v_target.id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  -- Capture the user's organizations BEFORE removing memberships.
  select array_agg(organization_id) into v_orgs
  from public.memberships
  where user_id = p_user_id and organization_id is not null;

  -- 1) User-owned rows (RESTRICT FKs otherwise block the users delete).
  delete from public.user_profiles where user_id = p_user_id;
  delete from public.trial_redemptions where user_id = p_user_id;
  delete from public.user_subscriptions where user_id = p_user_id;
  delete from public.memberships where user_id = p_user_id;
  delete from public.user_activity_events where user_id = p_user_id;

  -- 2) Wipe any organization that now has zero members (children first —
  --    every org FK is RESTRICT except feature_flags which is SET NULL).
  if v_orgs is not null then
    foreach v_org in array v_orgs loop
      select count(*) into v_remaining
      from public.memberships
      where organization_id = v_org and deleted_at is null;
      if v_remaining > 0 then
        continue; -- shared/team org: only the user's membership was removed
      end if;

      delete from public.document_extractions de
        using public.documents d
        where de.document_id = d.id and d.organization_id = v_org;
      delete from public.shared_links sl
        using public.scenarios s
        where sl.scenario_id = s.id and s.organization_id = v_org;
      delete from public.program_evaluations pe
        using public.scenarios s
        where pe.scenario_id = s.id and s.organization_id = v_org;
      delete from public.reports r
        using public.scenarios s
        where r.scenario_id = s.id and s.organization_id = v_org;
      delete from public.documents where organization_id = v_org;
      delete from public.rules r
        using public.programs p
        where r.program_id = p.id and p.organization_id = v_org;
      delete from public.guideline_versions gv
        using public.programs p
        where gv.program_id = p.id and p.organization_id = v_org;
      delete from public.ae_placements ap
        using public.ae_profiles a, public.lenders l
        where ap.ae_profile_id = a.id and a.lender_id = l.id and l.organization_id = v_org;
      delete from public.ae_profile_events ape
        using public.ae_profiles a, public.lenders l
        where ape.ae_profile_id = a.id and a.lender_id = l.id and l.organization_id = v_org;
      delete from public.outreach_sends os
        using public.outreach_contacts oc, public.ae_profiles a, public.lenders l
        where os.outreach_contact_id = oc.id and oc.ae_profile_id = a.id
          and a.lender_id = l.id and l.organization_id = v_org;
      delete from public.outreach_contacts oc
        using public.ae_profiles a, public.lenders l
        where oc.ae_profile_id = a.id and a.lender_id = l.id and l.organization_id = v_org;
      delete from public.ae_profiles a
        using public.lenders l
        where a.lender_id = l.id and l.organization_id = v_org;
      delete from public.programs where organization_id = v_org;
      delete from public.lenders where organization_id = v_org;
      delete from public.scenarios where organization_id = v_org;
      delete from public.ai_requests where organization_id = v_org;
      delete from public.audit_logs where organization_id = v_org;
      delete from public.organization_settings where organization_id = v_org;
      delete from public.org_invites where organization_id = v_org;
      delete from public.org_subscriptions where organization_id = v_org;

      -- Tables introduced by the parallel chatbot/intelligence line — they
      -- exist in the live DB; guarded so this function stays valid even if a
      -- future environment doesn't have them.
      if to_regclass('public.chat_feedback') is not null then
        delete from public.chat_feedback where organization_id = v_org;
      end if;
      if to_regclass('public.chat_unanswered_questions') is not null then
        delete from public.chat_unanswered_questions where organization_id = v_org;
      end if;
      if to_regclass('public.lender_flexibility_profiles') is not null then
        delete from public.lender_flexibility_profiles where organization_id = v_org;
      end if;

      delete from public.feature_flags where organization_id = v_org;
      delete from public.memberships where organization_id = v_org;
      delete from public.organizations where id = v_org;
    end loop;
  end if;

  -- 3) The user row itself (idempotent: tolerate a retry after a partial
  --    earlier run where the row was already removed).
  if v_target is not null then
    delete from public.users where id = p_user_id;
  end if;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

comment on function public.admin_delete_user(uuid) is
  'Platform-admin-only, atomic removal of a user and all of their data (profile, subscriptions, trial, memberships, activity, scenarios/documents and any now-empty personal organization). Live Stripe subscriptions and the auth.users sign-in account must be handled by the calling app action.';