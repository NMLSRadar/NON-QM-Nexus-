-- DB-level defaults for the new membership tables, same reasoning as
-- supabase/id-defaults.sql and updated-at-defaults.sql: Prisma's
-- @default(uuid()) / @updatedAt only apply client-side.

alter table membership_plans   alter column id set default gen_random_uuid();
alter table discounts          alter column id set default gen_random_uuid();
alter table user_subscriptions alter column id set default gen_random_uuid();

alter table membership_plans   alter column updated_at set default now();
alter table user_subscriptions alter column updated_at set default now();
