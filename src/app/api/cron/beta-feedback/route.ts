import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { sendTransactionalEmail } from "@/lib/email";
import { runBetaFeedbackSweep } from "@/lib/beta-feedback/sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Beta Tester Feedback automation — Day 3 email + Day 5 follow-up.
 *
 * AUTOMATION LOGIC (hard rule from the spec): BOTH emails are timed from the
 * ORIGINAL trial start date (trial_redemptions.activated_at, copied into
 * beta_tester_surveys.trial_started_at). The Day 5 follow-up is NEVER
 * "5 days after the first email" — it is Day 5 of the original trial:
 *   - Day 3 email:   now - activated_at  >= 3 days
 *   - Day 5 follow:  now - activated_at  >= 5 days  (and Day 3 already sent)
 *
 * IDEMPOTENCY / no duplicate emails: each email type has its own marker
 * columns (day3_email_sent_at + day3_email_id, day5_follow_up_sent_at +
 * day5_email_id). A run only sends when those are still null, so if this
 * scheduled process runs more than once, retries, or a prior run partially
 * failed, a tester is never emailed the same milestone twice. The resend
 * message id (not just a timestamp) is stored as a belt-and-braces key.
 *
 * DAY 5 follow-up is skipped for anyone already COMPLETED — completing the
 * survey at any point removes them from the follow-up queue. Partially
 * completed / opened-but-not-submitted / sent-but-not-opened users DO get the
 * follow-up, and it points at the same token URL, which resumes their
 * partially-completed questionnaire rather than restarting it.
 *
 * Also serves as the survey-row backfill: any redemption without a survey row
 * gets one (trial_started_at = activated_at) so testers already mid-trial
 * when this shipped are covered.
 *
 * Runs on Vercel Cron per vercel.json. Auth: Bearer <CRON_SECRET>, same as
 * the other cron jobs. Manual: curl -H "Authorization: Bearer $CRON_SECRET"
 * {APP_URL}/api/cron/beta-feedback
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

  try {
    const supabase = createServiceRoleClient();
    const result = await runBetaFeedbackSweep(supabase, { sendEmail: sendTransactionalEmail });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Sweep failed" }, { status: 500 });
  }
}