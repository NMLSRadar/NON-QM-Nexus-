// Beta Tester Feedback — the Day-3 / Day-5 automation sweep, extracted from
// the cron route so the exact same logic can be unit/integration tested with a
// fake sender (scripts/test-beta-feedback.ts) and run for real by the route.
import type { SupabaseClient } from "@supabase/supabase-js";
import { betaFeedbackDay3Email, betaFollowUpDay5Email } from "./emails";
import { ensureSurveyForRedemption } from "./service";

export interface SendParams {
  to: string;
  subject: string;
  html: string;
}
export type SendEmailFn = (p: SendParams) => Promise<{ ok: boolean; error?: string; id?: string }>;

export interface SweepResult {
  checked: number;
  surveysEnsured: number;
  day3Sent: number;
  day5Sent: number;
  failures: Array<{ redemptionId: string; type: string; error: string }>;
}

export interface SweepDeps {
  appUrl?: string;
  now?: number;
  sendEmail?: SendEmailFn;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * One sweep over every eligible trial redemption. Idempotent per email type
 * (marker columns + resend message id) so re-running the sweep — from a retry,
 * a double-invoked cron, or a manual run — never sends a duplicate email.
 *
 * Timing is ALWAYS from the original trial start date (activated_at, copied
 * into beta_tester_surveys.trial_started_at):
 *   Day 3 email:  activated_at + 3 days
 *   Day 5 follow: activated_at + 5 days (only if Day 3 already sent AND the
 *                 survey is not COMPLETED — completing removes the tester
 *                 from the follow-up queue; partial/open/sent-but-unopened
 *                 testers DO receive it, via the same token URL that resumes
 *                 their progress).
 */
export async function runBetaFeedbackSweep(
  supabase: SupabaseClient,
  deps: SweepDeps = {}
): Promise<SweepResult> {
  const appUrl = (deps.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com").replace(/\/$/, "");
  const now = deps.now ?? Date.now();
  const sendEmail: SendEmailFn = deps.sendEmail ?? (async (_p) => {
    // Default implementation: the real transactional sender is injected by the
    // route (email.ts is RSC-only, not importable from plain node tests).
    throw new Error("runBetaFeedbackSweep: no sendEmail provided outside the cron route");
  });

  const { data: redemptions, error: redemptionsError } = await supabase
    .from("trial_redemptions")
    .select("id, user_id, email, first_name, activated_at, revoked_at, converted_at")
    .order("activated_at", { ascending: true });
  if (redemptionsError) {
    throw new Error(`Failed to load trial redemptions: ${redemptionsError.message}`);
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
  const failures: SweepResult["failures"] = [];

  for (const r of eligible) {
    const survey = byUser.get(r.user_id) as Record<string, unknown> | undefined;
    if (!survey || typeof survey.token !== "string") continue;

    const activatedMs = new Date(r.activated_at as string).getTime();
    const surveyUrl = `${appUrl}/survey/${survey.token}`;
    const nowIso = new Date(now).toISOString();

    // DAY 3 — exactly 3 days after the trial began.
    if (
      !survey.day3_email_sent_at &&
      !survey.day3_email_id &&
      survey.status !== "COMPLETED" &&
      now - activatedMs >= 3 * DAY
    ) {
      const { subject, html } = betaFeedbackDay3Email({ firstName: (r.first_name as string | null) ?? null, surveyUrl });
      const result = await sendEmail({ to: r.email as string, subject, html });
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
      const result = await sendEmail({ to: r.email as string, subject, html });
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

  return { checked: eligible.length, surveysEnsured: ensured, day3Sent, day5Sent, failures };
}