-- NON-QM Nexus — Membership & pricing RLS.
--
-- Model: membership_plans are public pricing data (readable by anyone,
-- including anonymous visitors on the /pricing page); discounts and
-- user_subscriptions are per-user and admin-managed. platform_admin is a
-- separate, platform-wide admin flag on public.users — distinct from the
-- org-scoped memberships.role used elsewhere in this schema.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select platform_admin from users where id = auth.uid()), false);
$$;

alter table membership_plans   enable row level security;
alter table discounts          enable row level security;
alter table user_subscriptions enable row level security;

-- Plans: public pricing data. Anyone (including anon) may read active
-- plans; platform admins may read and manage everything.
create policy plans_select_public on membership_plans
  for select using (is_active = true or public.is_platform_admin());
create policy plans_admin_write on membership_plans
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Discounts: definitions are managed by platform admins only, but a user
-- must be able to read their OWN assigned discount (needed for the
-- embedded join in getEffectivePlan() to compute their effective price) —
-- otherwise RLS silently nulls out the embed and the discount never shows.
create policy discounts_select_own_or_admin on discounts
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from user_subscriptions us
      where us.discount_id = discounts.id and us.user_id = auth.uid()
    )
  );
create policy discounts_admin_write on discounts
  for insert with check (public.is_platform_admin());
create policy discounts_admin_update on discounts
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy discounts_admin_delete on discounts
  for delete using (public.is_platform_admin());

-- Subscriptions: a user reads their own row; platform admins read/manage
-- everyone's. Only platform admins may write (no self-serve changes yet).
create policy subscriptions_select_own on user_subscriptions
  for select using (user_id = auth.uid() or public.is_platform_admin());
create policy subscriptions_admin_write on user_subscriptions
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
