-- Trial email tracking columns (spec Phase 7). One idempotency-tracking
-- timestamp per email type, so a scheduled sweep (see
-- src/app/api/cron/trial-emails/route.ts) never sends the same email
-- twice to the same trial user, and the activation email (sent
-- immediately, app-side, from the trial activation flow) can be recorded
-- the same way as the scheduled ones.
alter table public.trial_redemptions add column if not exists activation_email_sent_at timestamptz;
alter table public.trial_redemptions add column if not exists mid_trial_email_sent_at timestamptz;
alter table public.trial_redemptions add column if not exists expiration_reminder_sent_at timestamptz;
alter table public.trial_redemptions add column if not exists expiration_email_sent_at timestamptz;

-- Narrow SECURITY DEFINER RPC (same pattern as record_trial_login() in
-- trial-access.sql): regular users have no direct UPDATE grant on
-- trial_redemptions (admin-write-only, see that file's RLS policies) —
-- this lets the CALLER record that their OWN activation email was sent,
-- and nothing else (no other column, no other user's row).
create or replace function public.record_trial_activation_email_sent()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trial_redemptions
  set activation_email_sent_at = now(), updated_at = now()
  where user_id = auth.uid() and activation_email_sent_at is null;
end;
$$;

grant execute on function public.record_trial_activation_email_sent() to authenticated;
