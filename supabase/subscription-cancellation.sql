-- Self-serve subscription cancellation.
--
-- Regular users have no direct UPDATE grant on user_subscriptions (see
-- membership-rls.sql: writes are platform-admin only) — plan/discount
-- assignment must stay admin-controlled. But a user must still be able to
-- cancel their OWN subscription without admin intervention. This function
-- is the single, narrow exception: SECURITY DEFINER, callable by any
-- authenticated user, but it can only set canceled_at on the caller's own
-- row — it cannot touch plan_id, discount_id, or anyone else's row.

create or replace function public.cancel_own_subscription()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update user_subscriptions
  set canceled_at = now()
  where user_id = auth.uid()
    and plan_id is not null
    and canceled_at is null;
end;
$$;

grant execute on function public.cancel_own_subscription() to authenticated;
