-- NON-QM Nexus — Team Membership (org subscriptions & seats): core schema
-- additions on top of prisma/schema.prisma's OrgSubscription / OrgInvite /
-- Membership.coveredByOrgPlan. Apply AFTER `prisma db push` (which creates
-- the tables/columns) and AFTER re-running id-defaults.sql /
-- updated-at-defaults.sql / membership-defaults.sql /
-- team-membership-defaults.sql per HANDOFF.md's "known operational gotcha".
--
-- Run this BEFORE team-invite-signup.sql (that file's handle_new_user()
-- replacement depends on org_subscriptions/org_invites existing and RLS
-- being enabled here first, though the function itself runs as
-- SECURITY DEFINER so it bypasses RLS regardless).

-- ---------------------------------------------------------------------------
-- At most one ACTIVE org_subscription per organization. A canceled row is
-- kept for history when a new one starts (e.g. re-subscribe after a lapse),
-- so this can't be a plain table-level unique(organization_id) — Prisma's
-- schema language has no partial-index syntax, hence this lives in raw SQL
-- (see OrgSubscription's doc comment in prisma/schema.prisma).
-- ---------------------------------------------------------------------------
create unique index if not exists org_subscriptions_one_active_per_org
  on org_subscriptions (organization_id)
  where status = 'active';

create index if not exists org_invites_org_idx on org_invites (organization_id);
create index if not exists org_invites_email_idx on org_invites (lower(email));

-- ---------------------------------------------------------------------------
-- RLS: org members read their own org's subscription + invites; writes go
-- through service-role server actions only (same "no user write policy"
-- pattern as audit_logs in rls-policies.sql) — every mutation is performed
-- by an org_admin-gated server action using createServiceRoleClient(), with
-- audit_logs entries for comped writes (see docs/team-membership.md).
-- ---------------------------------------------------------------------------
alter table org_subscriptions enable row level security;
alter table org_invites       enable row level security;

create policy org_subscriptions_select on org_subscriptions
  for select using (
    organization_id in (select user_org_ids()) or public.is_platform_admin()
  );

create policy org_invites_select on org_invites
  for select using (
    organization_id in (select user_org_ids()) or public.is_platform_admin()
  );
