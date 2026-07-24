-- ROOT-CAUSE FIX: every regular user's Lenders page showing empty /
-- "No lenders are configured for this organization yet." was NOT a
-- deploy or caching issue — it's that lenders/programs/guideline_versions
-- are organization-scoped tables, every new signup gets its own brand
-- new, empty organization, and the entire real 30-lender catalog has
-- only ever lived in ONE organization (the platform admin's real org,
-- bfe87b1c-86e7-4186-b1c4-ecc25d0e4420). NON-QM Nexus's actual product
-- model is a SINGLE platform-curated lender catalog shared by every
-- subscriber (gated by subscription TIER, never by which org a user
-- happens to belong to) — not a per-brokerage private lender list.
--
-- Writes are already fully locked to platform admins only
-- (lender-catalog-write-lockdown.sql) — there is no meaningful
-- "cross-tenant leakage" risk in opening reads of this specific catalog
-- data, since it's sourced from PUBLICLY published lender guideline
-- pages in the first place, not customer-private data. Scenarios,
-- subscriptions, and user data remain fully org/user-scoped as before —
-- this migration touches ONLY the shared catalog tables.
--
-- Fix: any authenticated user may SELECT rows belonging to the ONE
-- canonical platform-catalog organization (or their own org's rows too,
-- preserving room for a future genuinely separate tenant catalog; or via
-- the existing platform-admin override) — not literally every org in
-- the database, so a stray test-run organization's throwaway fixture
-- rows are never exposed platform-wide.

drop policy if exists lenders_select on lenders;
drop policy if exists programs_select on programs;
drop policy if exists guideline_versions_select on guideline_versions;
drop policy if exists rules_select on rules;

create policy lenders_select on lenders
  for select using (
    organization_id in (select user_org_ids())
    or organization_id = 'bfe87b1c-86e7-4186-b1c4-ecc25d0e4420'
    or public.is_platform_admin()
  );

create policy programs_select on programs
  for select using (
    organization_id in (select user_org_ids())
    or organization_id = 'bfe87b1c-86e7-4186-b1c4-ecc25d0e4420'
    or public.is_platform_admin()
  );

create policy guideline_versions_select on guideline_versions
  for select using (
    organization_id in (select user_org_ids())
    or organization_id = 'bfe87b1c-86e7-4186-b1c4-ecc25d0e4420'
    or public.is_platform_admin()
  );

create policy rules_select on rules
  for select using (
    organization_id in (select user_org_ids())
    or organization_id = 'bfe87b1c-86e7-4186-b1c4-ecc25d0e4420'
    or public.is_platform_admin()
  );
