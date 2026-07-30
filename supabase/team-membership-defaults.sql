-- DB-level defaults for the new team-membership tables, same reasoning as
-- supabase/id-defaults.sql / updated-at-defaults.sql / membership-defaults.sql:
-- Prisma's @default(uuid()) / @updatedAt only apply client-side, so raw SQL
-- writes (this project's own onboarding trigger, invite-acceptance RPCs)
-- would otherwise violate not-null constraints. Re-run this (along with the
-- other *-defaults.sql files) after every `prisma db push` — see HANDOFF.md's
-- "known operational gotcha".

alter table org_subscriptions alter column id set default gen_random_uuid();
alter table org_invites       alter column id set default gen_random_uuid();

alter table org_subscriptions alter column updated_at set default now();
