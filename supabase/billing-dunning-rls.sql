-- NON-QM Nexus — Billing & Retention policies + function (2026-08-16,
-- docs/billing-runbook.md).
--
-- Per the standing schema workflow (HANDOFF.md): table/column DDL lives in
-- the committed Prisma migration (20260816120000_add_billing_dunning_retention);
-- THIS file is only policies, the decline-counter function, and grants —
-- the repo-sanctioned contents of supabase/*.sql. Idempotent, safe to
-- re-apply.

-- 1. RLS on the event trail ------------------------------------------------
-- billing_payment_events is written ONLY by the Stripe webhook via the
-- service-role client (which bypasses RLS). Platform admins (the admin
-- Billing & Retention dashboard) may read all of it; members never see
-- billing events directly (their own subscription state serves them).
alter table billing_payment_events enable row level security;

create policy billing_events_admin_select on billing_payment_events
  for select using (public.is_platform_admin());

-- 2. Decline counter — atomic increment -----------------------------------
-- Stripe webhooks redeliver events until the endpoint acks them; a
-- read-modify-write of decline_count from the app could double-count under
-- redelivery or parallel deliveries. This function does the increment in
-- one statement, keyed by stripe_subscription_id, on either the personal
-- or the team table.
create or replace function public.increment_decline_count(p_table text, p_subscription_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_table = 'user_subscriptions' then
    update user_subscriptions
    set decline_count = decline_count + 1
    where stripe_subscription_id = p_subscription_id;
  elsif p_table = 'org_subscriptions' then
    update org_subscriptions
    set decline_count = decline_count + 1
    where stripe_subscription_id = p_subscription_id;
  end if;
end;
$$;

grant execute on function public.increment_decline_count(text, text) to service_role;
grant execute on function public.increment_decline_count(text, text) to authenticated;
grant execute on function public.increment_decline_count(text, text) to anon;