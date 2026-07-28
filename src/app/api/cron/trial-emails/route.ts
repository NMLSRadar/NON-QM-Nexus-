import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { sendTransactionalEmail } from "@/lib/email";
import { trialMidPointEmail, trialExpirationReminderEmail, trialExpiredEmail } from "@/lib/emailTemplates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily sweep for the 3 scheduled trial email types (spec Phase 7):
 *   - Mid-Trial Email: ~7 days after activation
 *   - Expiration Reminder: ~48 hours before expiration
 *   - Expiration Email: once the trial has actually expired
 * (The 4th type, the Activation Email, is sent immediately, app-side, from
 * the trial activation flow — see src/app/trial/[slug]/activate/actions.ts
 * — not from this cron, since it's a single real-time event, not a
 * scheduled sweep.)
 *
 * Each of the 3 checks here is idempotent via its own *_sent_at tracking
 * column on trial_redemptions (see supabase/trial-email-tracking.sql) — a
 * user is never emailed twice for the same milestone even if this job
 * runs more than once, retries, or a prior run partially failed.
 *
 * Runs on Vercel Cron per vercel.json's schedule. Auth: requires
 * `Authorization: Bearer <CRON_SECRET>` — same secret, same pattern, as
 * the existing check-citations/recheck-guidelines cron jobs.
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
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const { data: redemptions, error } = await supabase
    .from("trial_redemptions")
    .select("id, user_id, email, first_name, activated_at, expires_at, revoked_at, converted_at, mid_trial_email_sent_at, expiration_reminder_sent_at, expiration_email_sent_at");
  if (error) {
    return Response.json({ error: `Failed to load trial redemptions: ${error.message}` }, { status: 500 });
  }

  let midTrialSent = 0;
  let reminderSent = 0;
  let expiredSent = 0;
  const failures: Array<{ redemptionId: string; type: string; error: string }> = [];

  for (const r of redemptions ?? []) {
    // Never email a revoked or already-converted trial — those states have
    // their own, distinct meaning and don't need trial-lifecycle nudges.
    if (r.revoked_at || r.converted_at) continue;

    const activatedAtMs = new Date(r.activated_at).getTime();
    const expiresAtMs = new Date(r.expires_at).getTime();
    const isExpired = expiresAtMs <= now;

    // Mid-Trial Email: ~7 days after activation, only while still active.
    if (!r.mid_trial_email_sent_at && !isExpired && now - activatedAtMs >= 7 * DAY_MS) {
      const daysRemaining = Math.max(0, Math.ceil((expiresAtMs - now) / DAY_MS));
      const { subject, html } = trialMidPointEmail({ firstName: r.first_name, daysRemaining, appUrl });
      const result = await sendTransactionalEmail({ to: r.email, subject, html });
      if (result.ok) {
        await supabase.from("trial_redemptions").update({ mid_trial_email_sent_at: new Date().toISOString() }).eq("id", r.id);
        midTrialSent++;
      } else {
        failures.push({ redemptionId: r.id, type: "mid_trial", error: result.error ?? "unknown" });
      }
    }

    // Expiration Reminder: ~48 hours before expiration, only while still active.
    if (!r.expiration_reminder_sent_at && !isExpired && expiresAtMs - now <= 48 * 60 * 60 * 1000) {
      const { subject, html } = trialExpirationReminderEmail({ firstName: r.first_name, expiresAtIso: r.expires_at, appUrl });
      const result = await sendTransactionalEmail({ to: r.email, subject, html });
      if (result.ok) {
        await supabase.from("trial_redemptions").update({ expiration_reminder_sent_at: new Date().toISOString() }).eq("id", r.id);
        reminderSent++;
      } else {
        failures.push({ redemptionId: r.id, type: "expiration_reminder", error: result.error ?? "unknown" });
      }
    }

    // Expiration Email: once actually expired.
    if (!r.expiration_email_sent_at && isExpired) {
      const { subject, html } = trialExpiredEmail({ firstName: r.first_name, appUrl });
      const result = await sendTransactionalEmail({ to: r.email, subject, html });
      if (result.ok) {
        await supabase.from("trial_redemptions").update({ expiration_email_sent_at: new Date().toISOString() }).eq("id", r.id);
        expiredSent++;
      } else {
        failures.push({ redemptionId: r.id, type: "expiration", error: result.error ?? "unknown" });
      }
    }
  }

  return Response.json({
    checked: (redemptions ?? []).length,
    midTrialSent,
    reminderSent,
    expiredSent,
    failures,
  });
}
