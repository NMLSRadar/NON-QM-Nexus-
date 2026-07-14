-- NON-QM Navigator — Row-Level Security policies (Supabase / PostgreSQL).
--
-- Model: every tenant-owned table carries organization_id. A user's
-- organizations come from the memberships table, resolved from the Supabase
-- JWT (auth.uid()). RLS denies by default; each policy grants only rows in
-- an organization where the user holds an active membership.
--
-- Apply after running Prisma migrations. Service-role connections bypass RLS
-- (Supabase behavior); the application server must therefore always scope
-- queries by the session's organization and never accept a client-supplied
-- organization ID.

-- Helper: the set of organization IDs the current user belongs to.
create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from memberships
  where user_id = auth.uid()
    and deleted_at is null;
$$;

-- Helper: whether the user holds one of the given roles in the org.
create or replace function public.user_has_role(org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships
    where user_id = auth.uid()
      and organization_id = org
      and role = any(roles)
      and deleted_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere (deny by default).
-- ---------------------------------------------------------------------------
alter table organizations           enable row level security;
alter table organization_settings   enable row level security;
alter table users                   enable row level security;
alter table user_profiles           enable row level security;
alter table memberships             enable row level security;
alter table lenders                 enable row level security;
alter table programs                enable row level security;
alter table guideline_versions      enable row level security;
alter table rules                   enable row level security;
alter table scenarios               enable row level security;
alter table documents               enable row level security;
alter table document_extractions    enable row level security;
alter table program_evaluations     enable row level security;
alter table reports                 enable row level security;
alter table shared_links            enable row level security;
alter table audit_logs              enable row level security;
alter table ai_requests             enable row level security;
alter table feature_flags           enable row level security;

-- ---------------------------------------------------------------------------
-- Organizations: members can read their own orgs; only org admins update.
-- ---------------------------------------------------------------------------
create policy org_select on organizations
  for select using (id in (select user_org_ids()));

create policy org_update on organizations
  for update using (user_has_role(id, array['org_admin']));

-- ---------------------------------------------------------------------------
-- Users / profiles: a user sees and edits only their own row.
-- ---------------------------------------------------------------------------
create policy users_select on users
  for select using (id = auth.uid());

create policy users_update on users
  for update using (id = auth.uid());

create policy profiles_select on user_profiles
  for select using (user_id = auth.uid());

create policy profiles_upsert on user_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Memberships: visible to fellow org members; managed by org admins.
-- ---------------------------------------------------------------------------
create policy memberships_select on memberships
  for select using (organization_id in (select user_org_ids()));

create policy memberships_admin on memberships
  for all using (user_has_role(organization_id, array['org_admin']))
  with check (user_has_role(organization_id, array['org_admin']));

-- ---------------------------------------------------------------------------
-- Generic tenant tables: member read; role-restricted writes.
-- ---------------------------------------------------------------------------

-- Lenders/programs/guidelines/rules: underwriters and org admins manage.
create policy lenders_select on lenders
  for select using (organization_id in (select user_org_ids()));
create policy lenders_write on lenders
  for all using (user_has_role(organization_id, array['underwriter','org_admin']))
  with check (user_has_role(organization_id, array['underwriter','org_admin']));

create policy programs_select on programs
  for select using (organization_id in (select user_org_ids()));
create policy programs_write on programs
  for all using (user_has_role(organization_id, array['underwriter','org_admin']))
  with check (user_has_role(organization_id, array['underwriter','org_admin']));

create policy guideline_versions_select on guideline_versions
  for select using (organization_id in (select user_org_ids()));
create policy guideline_versions_write on guideline_versions
  for all using (user_has_role(organization_id, array['underwriter','org_admin']))
  with check (user_has_role(organization_id, array['underwriter','org_admin']));

create policy rules_select on rules
  for select using (organization_id in (select user_org_ids()));
create policy rules_write on rules
  for all using (user_has_role(organization_id, array['underwriter','org_admin']))
  with check (user_has_role(organization_id, array['underwriter','org_admin']));

-- Scenarios & children: any member may read; creators and elevated roles write.
create policy scenarios_select on scenarios
  for select using (organization_id in (select user_org_ids()));
create policy scenarios_insert on scenarios
  for insert with check (
    organization_id in (select user_org_ids()) and created_by = auth.uid()
  );
create policy scenarios_update on scenarios
  for update using (
    organization_id in (select user_org_ids())
    and (created_by = auth.uid()
         or user_has_role(organization_id, array['processor','underwriter','account_executive','org_admin']))
  );

create policy documents_select on documents
  for select using (organization_id in (select user_org_ids()));
create policy documents_write on documents
  for all using (organization_id in (select user_org_ids()))
  with check (organization_id in (select user_org_ids()) and uploaded_by = auth.uid());

create policy extractions_select on document_extractions
  for select using (organization_id in (select user_org_ids()));
create policy extractions_write on document_extractions
  for all using (organization_id in (select user_org_ids()))
  with check (organization_id in (select user_org_ids()));

create policy evaluations_select on program_evaluations
  for select using (organization_id in (select user_org_ids()));
create policy evaluations_insert on program_evaluations
  for insert with check (organization_id in (select user_org_ids()));

create policy reports_select on reports
  for select using (organization_id in (select user_org_ids()));
create policy reports_insert on reports
  for insert with check (organization_id in (select user_org_ids()) and generated_by = auth.uid());

create policy shared_links_select on shared_links
  for select using (organization_id in (select user_org_ids()));
create policy shared_links_write on shared_links
  for all using (organization_id in (select user_org_ids()))
  with check (organization_id in (select user_org_ids()) and created_by = auth.uid());

-- Audit logs: org admins read; inserts only via service role (no user policy).
create policy audit_select on audit_logs
  for select using (user_has_role(organization_id, array['org_admin']));

-- AI request audit: org admins read; the requesting user may read their own.
create policy ai_requests_select on ai_requests
  for select using (
    user_id = auth.uid() or user_has_role(organization_id, array['org_admin'])
  );

-- Feature flags: platform-wide rows (org null) readable by all authenticated
-- users; org rows readable by members.
create policy feature_flags_select on feature_flags
  for select using (
    organization_id is null or organization_id in (select user_org_ids())
  );
