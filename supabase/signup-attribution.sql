-- NON-QM Nexus — Signup Attribution (task 03, docs/tasks/03-signup-attribution.md).
--
-- Records which sales rep brought in which organization, captured at signup
-- time, admin-only, never visible to members. Data foundation for task 04's
-- Membership Management per-rep retention.
--
-- Conventions followed:
--   * Authoritative DDL here (applied with scripts/apply-sql.mjs); mirrored
--     into prisma/schema.prisma for Prisma client types.
--   * RLS admin-only via the repo's existing public.is_platform_admin()
--     helper (supabase/membership-rls.sql) — matches every other admin table.
--   * handle_new_user() is re-created below WITH attribution capture added.
--     All existing behavior (invite branch, fallback, observability) is
--     preserved verbatim; attribution is additive, runs in BOTH branches,
--     and any attribution error is logged to signup_trigger_errors and
--     swallowed so it can never break account creation.
--
-- Apply AFTER onboarding-trigger.sql + team-invite-signup.sql (it replaces
-- handle_new_user() wholesale).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Sales rep identity
-- ---------------------------------------------------------------------------
create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code text not null,               -- short shareable code, e.g. "bobby"
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_reps_code_unique unique (code),
  constraint sales_reps_user_unique unique (user_id)
);

-- ---------------------------------------------------------------------------
-- 2. Current attribution: ONE row per organization
--    status: confirmed | needs_review | unattributed
--    method: signup_link | invite | admin_manual
-- ---------------------------------------------------------------------------
create table if not exists public.organization_attribution (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attributed_to_user_id uuid references public.users(id),
  method text not null,
  status text not null default 'confirmed',
  conflict_detail text,
  first_captured_at timestamptz not null default now(),
  last_modified_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_attribution_org_unique unique (organization_id)
);

-- ---------------------------------------------------------------------------
-- 3. Raw capture log (append-mostly; dedup of identical captures in the
--    resolver). The conflict review in task 04 reads this trail.
-- ---------------------------------------------------------------------------
create table if not exists public.attribution_captures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rep_code text,
  rep_user_id uuid references public.users(id),
  method text not null,
  source text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists attribution_captures_org_idx on public.attribution_captures (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. Reassignment audit: every admin change with a mandatory reason
-- ---------------------------------------------------------------------------
create table if not exists public.attribution_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_user_id uuid references public.users(id),
  to_user_id uuid references public.users(id),
  reason text not null,
  changed_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists attribution_changes_org_idx on public.attribution_changes (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. RLS — admin-only on every attribution table. Zero rows for members.
-- ---------------------------------------------------------------------------
alter table public.sales_reps enable row level security;
alter table public.organization_attribution enable row level security;
alter table public.attribution_captures enable row level security;
alter table public.attribution_changes enable row level security;

drop policy if exists sales_reps_admin on public.sales_reps;
create policy sales_reps_admin on public.sales_reps
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists organization_attribution_admin on public.organization_attribution;
create policy organization_attribution_admin on public.organization_attribution
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists attribution_captures_admin on public.attribution_captures;
create policy attribution_captures_admin on public.attribution_captures
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists attribution_changes_admin on public.attribution_changes;
create policy attribution_changes_admin on public.attribution_changes
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. Resolver — the single writer of attribution state.
--    Called by handle_new_user() on every signup, and by admin code for
--    reassignment (method 'admin_manual' / source 'admin_ui').
--
--    Semantics:
--     * A ref code that resolves to an ACTIVE sales rep is the rep.
--     * WITHOUT a ref but with a p_invite_rep_user_id, that user is the rep
--       IFF they are an active sales rep (invite created by a rep).
--     * Unlike a ref, an invite rep applies ONLY to invite-branch signups.
--     * First capture wins. A later capture with a DIFFERENT rep never
--       overwrites: it flips status to needs_review and records both sides.
--     * A repeated identical capture is a no-op (one capture row).
--     * Unknown/no rep => row inserted (status 'unattributed') or the
--       existing row left intact.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_attribution_for_signup(
  p_organization_id uuid,
  p_ref text default null,
  p_method text default 'signup_link',
  p_source text default null,
  p_invite_rep_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep_user_id uuid;
  v_rep_code text;
  v_existing record;
  v_conflict_detail text;
  v_status text;
begin
  if p_organization_id is null then
    return;
  end if;

  v_rep_code := nullif(trim(p_ref), '');
  v_rep_user_id := null;

  if v_rep_code is not null then
    select user_id into v_rep_user_id
      from public.sales_reps
      where lower(code) = lower(v_rep_code) and is_active = true
      limit 1;
  end if;

  if v_rep_user_id is null and p_invite_rep_user_id is not null then
    -- Invite path: rep = the (active) rep who created the invite.
    select id into v_rep_user_id
      from public.users u
      where u.id = p_invite_rep_user_id
        and exists (select 1 from public.sales_reps sr where sr.user_id = u.id and sr.is_active = true);
  end if;

  -- Capture log (dedupe identical captures: same org, method, rep).
  insert into public.attribution_captures (organization_id, rep_code, rep_user_id, method, source, resolved)
  select p_organization_id, v_rep_code, v_rep_user_id, p_method, p_source, v_rep_user_id is not null
  where not exists (
    select 1 from public.attribution_captures ac
    where ac.organization_id = p_organization_id
      and ac.method = p_method
      and ac.rep_user_id is not distinct from v_rep_user_id
      and ac.rep_code is not distinct from v_rep_code
  );

  select attributed_to_user_id, conflict_detail into v_existing
    from public.organization_attribution
    where organization_id = p_organization_id;

  if v_existing.attributed_to_user_id is not null and v_rep_user_id is not null and v_existing.attributed_to_user_id <> v_rep_user_id then
    -- Different rep captured for an already-attributed org: never overwrite;
    -- surface it as a conflict for the admin review (task 04 reads this).
    v_conflict_detail := 'Existing rep ' || v_existing.attributed_to_user_id::text || ' vs captured ' || v_rep_user_id::text || ' via ' || p_method;
    update public.organization_attribution
      set status = 'needs_review',
          conflict_detail = v_conflict_detail,
          updated_at = now()
      where organization_id = p_organization_id;
    return;
  end if;

  if not found then
    v_status := case when v_rep_user_id is null then 'unattributed' else 'confirmed' end;
    insert into public.organization_attribution (organization_id, attributed_to_user_id, method, status, first_captured_at, updated_at)
    values (p_organization_id, v_rep_user_id, p_method, v_status, now(), now());
  else
    -- Existing row: adopt the rep if it was unattributed, else no-op
    -- (already attributed with a matching rep, or needs_review kept as-is).
    if v_existing.attributed_to_user_id is null and v_rep_user_id is not null then
      update public.organization_attribution
        set attributed_to_user_id = v_rep_user_id,
            method = p_method,
            status = 'confirmed',
            conflict_detail = null,
            updated_at = now()
        where organization_id = p_organization_id;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. handle_new_user() — re-created with attribution capture appended in
--    BOTH branches. Everything below except the resolve_attribution calls
--    (and the ref metadata read) is verbatim from team-invite-signup.sql.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  raw_token text;
  v_token_hash text;
  invite record;
  active_seat_count int;
  covered_count int;
  will_be_covered boolean;
  raw_ref text;
begin
  raw_token := new.raw_user_meta_data ->> 'invite_token';
  raw_ref := new.raw_user_meta_data ->> 'ref';

  if raw_token is not null and length(raw_token) > 0 then
   begin
    v_token_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

    select oi.id, oi.organization_id, oi.role, oi.expires_at, oi.accepted_at, oi.revoked_at, oi.email, oi.invited_by
      into invite
      from org_invites oi
      where oi.token_hash = v_token_hash;

    if found
      and invite.accepted_at is null
      and invite.revoked_at is null
      and invite.expires_at > now()
      and lower(invite.email) = lower(new.email)
    then
      insert into public.users (id, email, updated_at)
      values (new.id, new.email, now())
      on conflict (id) do nothing;

      select os.seat_count into active_seat_count
        from org_subscriptions os
        where os.organization_id = invite.organization_id and os.status = 'active'
        limit 1;

      if active_seat_count is not null then
        select count(*) into covered_count
          from memberships m
          where m.organization_id = invite.organization_id
            and m.covered_by_org_plan = true
            and m.deleted_at is null;
      end if;

      will_be_covered := active_seat_count is not null and coalesce(covered_count, 0) < active_seat_count;

      insert into public.memberships (organization_id, user_id, role, covered_by_org_plan, updated_at)
      values (invite.organization_id, new.id, invite.role, will_be_covered, now());

      update org_invites set accepted_at = now() where id = invite.id;

      -- Task-03 attribution: invite branch. A ref code on the signup link
      -- wins (matching semantics); otherwise the rep who created the invite.
      begin
        perform public.resolve_attribution_for_signup(
          invite.organization_id,
          raw_ref,
          case when raw_ref is not null  and length(raw_ref) > 0 then 'signup_link' else 'invite' end,
          'invite:' || invite.id,
          invite.invited_by
        );
      exception when others then
        raise warning 'handle_new_user attribution failed (invite branch): % (SQLSTATE %)', sqlerrm, sqlstate;
        insert into public.signup_trigger_errors (id, sqlstate, message, email_domain_only)
        values (gen_random_uuid(), sqlstate, 'attribution: ' || sqlerrm, split_part(new.email, '@', 2));
      end;

      -- Invited signup: membership created in the inviting org, organization auto-creation skipped.
      return new;
    end if;
   exception when others then
    raise warning 'handle_new_user invite branch failed: % (SQLSTATE %)', sqlerrm, sqlstate;
    insert into public.signup_trigger_errors (id, sqlstate, message, email_domain_only)
    values (gen_random_uuid(), sqlstate, sqlerrm, split_part(new.email, '@', 2));
   end;
  end if;

  -- Normal signup (no invite token, or an invalid one) — original behavior.
  insert into public.users (id, email, updated_at)
  values (new.id, new.email, now())
  on conflict (id) do nothing;

  insert into public.organizations (name, updated_at)
  values (coalesce(split_part(new.email, '@', 1), 'My') || '''s Organization', now())
  returning id into new_org_id;

  insert into public.memberships (organization_id, user_id, role, updated_at)
  values (new_org_id, new.id, 'org_admin', now());

  -- Task-03 attribution: normal branch — rep code on the signup link.
  begin
    perform public.resolve_attribution_for_signup(new_org_id, raw_ref, 'signup_link', 'signup');
  exception when others then
    raise warning 'signup attribution failed: % (SQLSTATE %)', sqlerrm, sqlstate;
    insert into public.signup_trigger_errors (id, sqlstate, message, email_domain_only)
    values (gen_random_uuid(), sqlstate, 'attribution: ' || sqlerrm, split_part(new.email, '@', 2));
  end;

  return new;
end;
$$;

-- Trigger unchanged (still on_auth_user_created -> handle_new_user);
-- re-declaring is harmless and keeps this file self-contained / re-runnable.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

COMMIT;