-- NON-QM Navigator — new-user onboarding trigger.
--
-- When a new user completes Supabase Auth sign-up (a row lands in
-- auth.users), this trigger provisions the minimum tenant scaffold so the
-- app has an organization to write scenarios into immediately:
--   1. mirror the auth user into public.users (id, email)
--   2. create a personal organization for them
--   3. make them org_admin of that organization via memberships
--
-- Runs as SECURITY DEFINER so it can write across tables regardless of RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into public.users (id, email, updated_at)
  values (new.id, new.email, now())
  on conflict (id) do nothing;

  insert into public.organizations (name, updated_at)
  values (coalesce(split_part(new.email, '@', 1), 'My') || '''s Organization', now())
  returning id into new_org_id;

  insert into public.memberships (organization_id, user_id, role, updated_at)
  values (new_org_id, new.id, 'org_admin', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
