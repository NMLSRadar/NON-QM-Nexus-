-- Lock down catalog writes to platform admins only.
--
-- AUDIT FINDING: the original policies in rls-policies.sql (written
-- before platform_admin / the admin-only import features existed) grant
-- lenders/programs/guideline_versions/rules WRITE access to any user with
-- org-level role 'underwriter' or 'org_admin' in their OWN organization.
-- Every regular sign-up is auto-granted 'org_admin' of their own personal
-- org by the onboarding trigger (see onboarding-trigger.sql) — so, in
-- practice, EVERY regular user could write directly to these tables via
-- the API, completely bypassing the admin-only CSV/PDF-import UI and
-- server actions. Confirmed empirically: a plain signed-up test user
-- successfully inserted a row into `lenders` with no admin flag at all.
--
-- Fix: writes require public.is_platform_admin() instead. Reads are
-- unchanged (still any org member, via user_org_ids()).
--
-- This requires the demo-catalog self-seeding on a new org's first
-- getCatalog() call (src/lib/repository/supabaseRepository.ts) to run
-- through the service-role client instead of the requesting user's own
-- client — done in the same change that introduced this lockdown.

drop policy if exists lenders_write on lenders;
drop policy if exists programs_write on programs;
drop policy if exists guideline_versions_write on guideline_versions;
drop policy if exists rules_write on rules;

create policy lenders_write on lenders
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy programs_write on programs
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy guideline_versions_write on guideline_versions
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy rules_write on rules
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());
