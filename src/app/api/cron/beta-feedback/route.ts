import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { sendTransactionalEmail } from "@/lib/email";
import { betaFeedbackDay3Email, betaFollowUpDay5Email } from "@/lib/beta-feedback/emails";
import { ensureSurveyForRedemption } from "@/lib/beta-feedback/service";

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

  const supabase = createServiceRoleClient();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com").replace(/\/$/, "");
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const { data: redemptions, error: redemptionsError } = await supabase
    .from("trial_redemptions")
    .select("id, user_id, email, first_name, activated_at, revoked_at, converted_at")
    .order("activated_at", { ascending: true });
  if (redemptionsError) {
    return Response.json({ error: `Failed to load trial redemptions: ${redemptionsError.message}` }, { status: 500 });
  }

  // Eligible = any tester who started a trial and was not admin-revoked.
  // Converted / expired users still count: their feedback on the trial
  // experience is exactly what we want.
  const eligible = (redemptions ?? []).filter((r) => !r.revoked_at);
  const userIds = eligible.map((r) => r.user_id);
  const emptyUuid = "00000000-0000-0000-0000-000000000000";

  const { data: existingSurveys } = await supabase
    .from("beta_tester_surveys")
    .select("*")
    .in("user_id", userIds.length ? userIds : [emptyUuid]);

  const byUser = new Map<string, Record<string, unknown>>();
  for (const s of existingSurveys ?? []) byUser.set(s.user_id as string, s);

  // Backfill survey rows (idempotent per user_id) — also records the exact
  // trial start date for any tester who activated before this shipped.
  let ensured = 0;
  for (const r of eligible) {
    if (byUser.has(r.user_id)) continue;
    const created = await ensureSurveyForRedemption(supabase, r);
    byUser.set(r.user_id, created as unknown as Record<string, unknown>);
    ensured += 1;
  }

  let day3Sent = 0;
  let day5Sent = 0;
  const failures: Array<{ redemptionId: string; type: string; error: string }> = [];

  for (const r of eligible) {
    const survey = byUser.get(r.user_id) as Record<string, unknown> | undefined;
    if (!survey || typeof survey.token !== "string") continue;

    const activatedMs = new Date(r.activated_at as string).getTime();
    const surveyUrl = `${appUrl}/survey/${survey.token}`;
    const nowIso = new Date().toISOString();

    // DAY 3 — exactly 3 days after the trial began.
    if (
      !survey.day3_email_sent_at &&
      !survey.day3_email_id &&
      survey.status !== "COMPLETED" &&
      now - activatedMs >= 3 * DAY
    ) {
      const { subject, html } = betaFeedbackDay3Email({ firstName: (r.first_name as string | null) ?? null, surveyUrl });
      const result = await sendTransactionalEmail({ to: r.email as string, subject, html });
      if (result.ok) {
        const { error } = await supabase
          .from("beta_tester_surveys")
          .update({
            day3_email_sent_at: nowIso,
            day3_email_id: result.id ?? null,
            status: "SENT",
            updated_at: nowIso,
          })
          .eq("token", survey.token);
        if (!error) day3Sent += 1;
        else failures.push({ redemptionId: r.id as string, type: "day3_marker", error: error.message });
      } else {
        failures.push({ redemptionId: r.id as string, type: "day3", error: result.error ?? "unknown" });
      }
    }

    // DAY 5 follow-up — Day 5 of the ORIGINAL trial, only if Day 3 went out
    // and the survey was not completed in the meantime.
    if (
      survey.day3_email_sent_at &&
      !survey.day5_follow_up_sent_at &&
      !survey.day5_email_id &&
      survey.status !== "COMPLETED" &&
      now - activatedMs >= 5 * DAY
    ) {
      const { subject, html } = betaFollowUpDay5Email({ firstName: (r.first_name as string | null) ?? null, surveyUrl });
      const result = await sendTransactionalEmail({ to: r.email as string, subject, html });
      if (result.ok) {
        const { error } = await supabase
          .from("beta_tester_surveys")
          .update({
            day5_follow_up_sent_at: nowIso,
            day5_email_id: result.id ?? null,
            status: "FOLLOW_UP_SENT",
            updated_at: nowIso,
          })
          .eq("token", survey.token);
        if (!error) day5Sent += 1;
        else failures.push({ redemptionId: r.id as string, type: "day5_marker", error: error.message });
      } else {
        failures.push({ redemptionId: r.id as string, type: "day5", error: result.error ?? "unknown" });
      }
    }
  }

  return Response.json({
    checked: eligible.length,
    surveysEnsured: ensured,
    day3Sent,
    day5Sent,
    failures,
  });
}