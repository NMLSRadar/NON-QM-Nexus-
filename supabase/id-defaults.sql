-- Give every uuid primary key a DB-level default via gen_random_uuid().
-- Prisma's @default(uuid()) only generates ids client-side (in the Prisma
-- Client), so raw SQL inserts (triggers, other tools) would otherwise
-- violate the not-null constraint. Prisma Client's own generated ids still
-- take precedence when it supplies one explicitly.
-- Note: public.users.id intentionally has NO default — it always mirrors
-- auth.users.id (set explicitly by the onboarding trigger).

alter table ai_requests           alter column id set default gen_random_uuid();
alter table audit_logs            alter column id set default gen_random_uuid();
alter table document_extractions  alter column id set default gen_random_uuid();
alter table documents              alter column id set default gen_random_uuid();
alter table feature_flags         alter column id set default gen_random_uuid();
alter table guideline_versions    alter column id set default gen_random_uuid();
alter table lenders               alter column id set default gen_random_uuid();
alter table memberships           alter column id set default gen_random_uuid();
alter table organization_settings alter column id set default gen_random_uuid();
alter table organizations         alter column id set default gen_random_uuid();
alter table program_evaluations   alter column id set default gen_random_uuid();
alter table programs              alter column id set default gen_random_uuid();
alter table reports                alter column id set default gen_random_uuid();
alter table rules                 alter column id set default gen_random_uuid();
alter table scenarios             alter column id set default gen_random_uuid();
alter table shared_links          alter column id set default gen_random_uuid();
