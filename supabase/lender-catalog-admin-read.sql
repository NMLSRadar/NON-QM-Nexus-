-- Adjacent finding from the admin-upload audit: /admin/lenders and
-- /admin/documents both claim platform admins see lenders/programs
-- "across every organization", but the original lenders_select /
-- programs_select / guideline_versions_select / rules_select policies
-- only ever granted a user their OWN organization's rows — there was no
-- admin-wide override. Never a security hole (it under-grants, it never
-- over-grants to non-admins), but it means the admin catalog pages
-- silently only work correctly when the admin's own org happens to hold
-- all the data. Add platform-admin-wide read access alongside the
-- existing org-scoped read.

drop policy if exists lenders_select on lenders;
drop policy if exists programs_select on programs;
drop policy if exists guideline_versions_select on guideline_versions;
drop policy if exists rules_select on rules;

create policy lenders_select on lenders
  for select using (organization_id in (select user_org_ids()) or public.is_platform_admin());

create policy programs_select on programs
  for select using (organization_id in (select user_org_ids()) or public.is_platform_admin());

create policy guideline_versions_select on guideline_versions
  for select using (organization_id in (select user_org_ids()) or public.is_platform_admin());

create policy rules_select on rules
  for select using (organization_id in (select user_org_ids()) or public.is_platform_admin());
