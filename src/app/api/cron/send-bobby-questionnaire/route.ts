import { randomBytes } from "node:crypto";
import { betaFeedbackDay3Email } from "@/lib/beta-feedback/emails";
import { sendTransactionalEmail } from "@/lib/email";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECIPIENT = "bobby@nonqmnexus.com";
const WINDOW_END_MS = Date.parse("2026-08-18T21:45:00.000Z");
const IDEMPOTENCY_KEY = "nonqm-beta-questionnaire-bobby-2026-08-18-v1";

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (Date.now() > WINDOW_END_MS) {
    return Response.json({ error: "This one-time questionnaire window is closed" }, { status: 410 });
  }

  const supabase = createServiceRoleClient();
  const directLookup = await supabase
    .from("users")
    .select("id")
    .ilike("email", RECIPIENT)
    .maybeSingle();
  if (directLookup.error) {
    console.error("bobby questionnaire failed", { stage: "user_lookup", error: directLookup.error.message });
    return Response.json({ ok: false, error: directLookup.error.message }, { status: 500 });
  }

  let user = directLookup.data;
  if (!user) {
    const ownerLookup = await supabase
      .from("users")
      .select("id")
      .eq("platform_admin", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ownerLookup.error || !ownerLookup.data) {
      const error = ownerLookup.error?.message ?? "The NON-QM Nexus platform-owner account was not found";
      console.error("bobby questionnaire failed", { stage: "owner_lookup", error });
      return Response.json({ ok: false, error }, { status: 404 });
    }
    user = ownerLookup.data;
  }

  const { data: existing, error: existingError } = await supabase
    .from("beta_tester_surveys")
    .select("id, token")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) {
    console.error("bobby questionnaire failed", { stage: "survey_lookup", error: existingError.message });
    return Response.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  const token = existing?.token ?? randomBytes(32).toString("hex");
  if (existing) {
    const { error } = await supabase
      .from("beta_tester_surveys")
      .update({
        status: "NOT_SENT",
        responses: {},
        completion_percentage: 0,
        opened_at: null,
        started_at: null,
        last_answered_at: null,
        completed_at: null,
        day3_email_sent_at: null,
        day3_email_id: null,
        day5_follow_up_sent_at: null,
        day5_email_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from("beta_tester_surveys").insert({
      user_id: user.id,
      trial_redemption_id: null,
      trial_started_at: new Date().toISOString(),
      status: "NOT_SENT",
      token,
    });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com").replace(/\/$/, "");
  const surveyUrl = `${appUrl}/survey/${token}`;
  const email = betaFeedbackDay3Email({ firstName: "Bobby", surveyUrl });
  const send = await sendTransactionalEmail({
    to: RECIPIENT,
    subject: email.subject,
    html: email.html,
    idempotencyKey: IDEMPOTENCY_KEY,
  });
  if (!send.ok) {
    console.error("bobby questionnaire failed", { stage: "email", error: send.error });
    return Response.json({ ok: false, error: send.error }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  const { error: markerError } = await supabase
    .from("beta_tester_surveys")
    .update({
      status: "SENT",
      day3_email_sent_at: sentAt,
      day3_email_id: send.id ?? null,
      updated_at: sentAt,
    })
    .eq("user_id", user.id);
  if (markerError) {
    console.error("bobby questionnaire marker failed", { providerMessageId: send.id, error: markerError.message });
    return Response.json({ ok: true, sent: true, markerRecorded: false, providerMessageId: send.id }, { status: 207 });
  }

  console.info("bobby questionnaire accepted", {
    recipient: RECIPIENT,
    sentAt,
    providerMessageId: send.id ?? null,
    surveyUrl,
  });
  return Response.json({ ok: true, recipient: RECIPIENT, sentAt, providerMessageId: send.id ?? null });
}
