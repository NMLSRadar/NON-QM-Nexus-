"use server";

// Manual "send the Day-3 questionnaire email now" for a beta tester — the
// owner-side counterpart to the automated Day-3 cron. Uses the tester's real
// secure survey link, records the same idempotency markers
// (day3_email_sent_at + day3_email_id) as the cron, so the scheduled run can
// never double-send to a tester who was already emailed manually.

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { sendTransactionalEmail } from "@/lib/email";
import { betaFeedbackDay3Email } from "@/lib/beta-feedback/emails";
import { ensureSurveyForRedemption } from "@/lib/beta-feedback/service";

export interface SendSurveyNowResult {
  ok: boolean;
  error?: string;
  already?: boolean;
  message?: string;
}

export async function sendDay3SurveyEmailNow(opts: {
  surveyId?: string;
  email?: string;
}): Promise<SendSurveyNowResult> {
  const { supabase } = await requirePlatformAdmin();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com").replace(/\/$/, "");

  let survey: Record<string, unknown> | null = null;
  let redemption: { email: string; first_name: string | null } | null = null;

  if (opts.surveyId) {
    const { data } = await supabase
      .from("beta_tester_surveys")
      .select("id, user_id, token, status, day3_email_sent_at, day3_email_id")
      .eq("id", opts.surveyId)
      .maybeSingle();
    survey = data ?? null;
    if (!survey) return { ok: false, error: "Survey record not found." };
    const { data: rd } = await supabase
      .from("trial_redemptions")
      .select("email, first_name")
      .eq("user_id", survey.user_id)
      .maybeSingle();
    redemption = rd ?? null;
  } else if (opts.email) {
    const email = opts.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
    const { data: rd } = await supabase
      .from("trial_redemptions")
      .select("id, user_id, email, first_name, activated_at")
      .ilike("normalized_email", email)
      .maybeSingle();
    if (!rd) {
      return {
        ok: false,
        error: `No trial found for ${email}. Invite them first via “Invite a beta tester” in Trial Access Management — once they have a trial, you can send the questionnaire email instantly.`,
      };
    }
    redemption = { email: rd.email as string, first_name: (rd.first_name as string | null) ?? null };
    const { data: s } = await supabase.from("beta_tester_surveys").select("*").eq("user_id", rd.user_id).maybeSingle();
    if (!s) {
      try {
        survey = (await ensureSurveyForRedemption(supabase, {
          id: rd.id as string,
          user_id: rd.user_id as string,
          activated_at: rd.activated_at as string,
        })) as unknown as Record<string, unknown>;
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not create the survey record for this tester.",
        };
      }
    } else {
      survey = s;
    }
  } else {
    return { ok: false, error: "Provide a survey id or an email." };
  }

  if (!survey || !redemption) return { ok: false, error: "Could not resolve the tester." };

  // Idempotency: never email twice, even if the button is clicked again.
  if (survey.day3_email_sent_at || survey.day3_email_id) {
    return { ok: true, already: true, message: "The Day 3 email was already sent for this tester." };
  }

  const token = typeof survey.token === "string" ? survey.token : "";
  if (!token) return { ok: false, error: "Survey link missing." };

  const { subject, html } = betaFeedbackDay3Email({ firstName: redemption.first_name, surveyUrl: `${appUrl}/survey/${token}` });
  const result = await sendTransactionalEmail({ to: redemption.email, subject, html });
  if (!result.ok) {
    return { ok: false, error: `The email wasn't sent: ${result.error ?? "unknown"}` };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { day3_email_sent_at: now, day3_email_id: result.id ?? null, updated_at: now };
  if (survey.status === "NOT_SENT") patch.status = "SENT";
  const { error } = await supabase.from("beta_tester_surveys").update(patch).eq("id", survey.id);
  if (error) return { ok: false, error: `Email sent but could not record it: ${error.message}` };

  revalidatePath("/admin/trials");
  return { ok: true, message: `Sent to ${redemption.email} — the questionnaire link is in their inbox.` };
}