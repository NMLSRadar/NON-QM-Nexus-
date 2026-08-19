import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { sendTransactionalEmail } from "@/lib/email";
import { paymentDeclinedEmail } from "@/lib/emailTemplates";
import { PLANS } from "@/config/pricing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily dunning sweep (2026-08-16, docs/billing-runbook.md) — sends the
 * declined-payment follow-up to every member whose card payment is failing
 * (stripe_status past_due / unpaid / incomplete because invoice.payment_failed
 * has fired and the subscription is not yet canceled), ONCE per calendar day,
 * every day, until they recover or the subscription actually cancels.
 *
 * Idempotency: last_dunning_email_sent_at on user_subscriptions (set by this
 * job on success) means a member is never emailed twice for the same day even
 * if the job runs again, retries, or overlaps — same pattern as the
 * trial-emails cron's *_sent_at tracking columns. Recovery is handled by the
 * webhook: invoice.payment_succeeded flips stripe_status back to active and
 * clears decline_count, which removes the row from this job's candidate set;
 * customer.subscription.deleted removes subscriptions that Stripe actually
 * canceled.
 *
 * Runs on Vercel Cron per vercel.json. Auth: requires
 * `Authorization: Bearer <CRON_SECRET>` — same secret, same pattern, as the
 * existing check-citations / recheck-guidelines / trial-emails cron jobs.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const dayStartIso = new Date();
  dayStartIso.setUTCHours(0, 0, 0, 0);

  // Personal subscriptions currently in dunning: past_due / unpaid /
  // incomplete, not yet canceled, never emailed today. Only rows with a
  // failed attempt on record (decline count > 0 or last failure stamped)
  // qualify — a comped row with stripe_status null must not be emailed.
  const DUNNING_STATUSES = ["past_due", "unpaid", "incomplete", "incomplete_expired"];
  const { data: rows, error } = await supabase
    .from("user_subscriptions")
    .select(
      "stripe_subscription_id, user_id, plan_id, decline_count, last_payment_failed_at, next_payment_attempt_at, last_dunning_email_sent_at, dunning_email_count, user:users!inner(email, profile:user_profiles(display_name)), plan:membership_plans(name, monthly_price_cents)"
    )
    .in("stripe_status", DUNNING_STATUSES)
    .is("canceled_at", null)
    .or(`decline_count.gt.0,last_payment_failed_at.not.is.null`)
    .lte("last_payment_failed_at", new Date().toISOString());

  if (error) {
    return Response.json({ error: `Failed to load dunning candidates: ${error.message}` }, { status: 500 });
  }

  let emailed = 0;
  let alreadyToday = 0;
  const failures: Array<{ subscriptionId: string; error: string }> = [];

  for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
    const userRow = Array.isArray(row.user) ? row.user[0] : row.user;
    const planRow = Array.isArray(row.plan) ? row.plan[0] : row.plan;
    const subscriptionId = row.stripe_subscription_id as string;

    // Never re-email a member already sent to today.
    if (row.last_dunning_email_sent_at && new Date(row.last_dunning_email_sent_at as string) >= dayStartIso) {
      alreadyToday++;
      continue;
    }

    const email = ((userRow as { email?: string } | null)?.email ?? "").toLowerCase();
    if (!email) {
      failures.push({ subscriptionId, error: "No user email" });
      continue;
    }
    // A user-level suppression (one-click unsubscribe) always wins — same
    // respect for the global suppression table as every other send path.
    const { data: suppressed } = await supabase.from("email_suppressions").select("email").ilike("email", email).maybeSingle();
    if (suppressed) {
      alreadyToday++;
      continue;
    }

    const planName = ((planRow as { name?: string } | null)?.name) ?? "Membership";
    const amountDueCents = ((planRow as { monthly_price_cents?: number | null } | null)?.monthly_price_cents) ?? PLANS.monthly.amountCents;
    const attemptNumber = Math.max(1, (row.decline_count as number | null) ?? 1);
    const displayName = ((userRow as { profile?: { display_name?: string | null } | { display_name?: string | null }[] } | null)?.profile as
      | { display_name?: string | null }
      | { display_name?: string | null }[]
      | undefined) ?? null;
    const firstName = Array.isArray(displayName) ? (displayName[0]?.display_name ?? null) : (displayName?.display_name ?? null);

    const { subject, html } = paymentDeclinedEmail({
      firstName,
      planName,
      amountDueCents,
      attemptNumber,
      nextRetryAtIso: row.next_payment_attempt_at as string | null,
      appUrl,
    });

    const result = await sendTransactionalEmail({ to: email, subject, html });
    if (result.ok) {
      await supabase
        .from("user_subscriptions")
        .update({
          last_dunning_email_sent_at: new Date().toISOString(),
          dunning_email_count: ((row.dunning_email_count as number | null) ?? 0) + 1,
        })
        .eq("stripe_subscription_id", subscriptionId);
      emailed++;
    } else {
      failures.push({ subscriptionId, error: result.error ?? "email failed" });
    }
  }

  return Response.json({
    checked: (rows ?? []).length,
    emailed,
    alreadyToday,
    failures,
  });
}