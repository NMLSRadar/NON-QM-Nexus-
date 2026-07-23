-- Give every updated_at column a DB-level default of now(). Prisma's
-- @updatedAt only manages this at the application layer, so raw SQL inserts
-- (triggers, manual fixes, other tools) would otherwise violate the
-- not-null constraint. This does not change Prisma's own update behavior.

alter table feature_flags        alter column updated_at set default now();
alter table guideline_versions   alter column updated_at set default now();
alter table lenders              alter column updated_at set default now();
alter table memberships          alter column updated_at set default now();
alter table organization_settings alter column updated_at set default now();
alter table organizations        alter column updated_at set default now();
alter table programs             alter column updated_at set default now();
alter table rules                alter column updated_at set default now();
alter table scenarios             alter column updated_at set default now();
alter table user_profiles        alter column updated_at set default now();
alter table users                alter column updated_at set default now();
