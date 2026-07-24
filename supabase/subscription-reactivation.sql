-- Self-serve subscription reactivation — mirrors cancel_own_subscription()
-- in supabase/subscription-cancellation.sql: a narrow SECURITY DEFINER
-- exception to the admin-only write policy on user_subscriptions. Can only
-- clear canceled_at on the CALLER's own row, and only when there's a plan
-- to reactivate; never touches plan_id/discount_id or anyone else's row.

create or replace function public.reactivate_own_subscription()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update user_subscriptions
  set canceled_at = null
  where user_id = auth.uid()
    and plan_id is not null
    and canceled_at is not null;
end;
$$;

grant execute on function public.reactivate_own_subscription() to authenticated;
