// Custom transactional email via Resend's HTTP API — separate from
// Supabase Auth's built-in email sender (signup confirmation, password
// reset), which is rate-limited and only fires for those specific auth
// events. Anything else the app needs to email a user about (like a
// subscription-cancellation confirmation) goes through here instead.
import "server-only";

const RESEND_API_URL = "https://api.resend.com/emails";
// Verified sending domain (nonqmnexus.com) — SPF/DKIM confirmed and a
// real test send succeeded. Can now reach any real inbox, not just the
// Resend account's own address like the onboarding@resend.dev test
// domain could.
const FROM_ADDRESS = "NON-QM Nexus <noreply@nonqmnexus.com>";

export interface SendEmailResult {
  ok: boolean;
  error?: string;
  /** Resend's message id, present on a successful send — used by callers as
   * an idempotency key (e.g. the beta-feedback cron stores it and never
   * re-sends the same email type once it's present). */
  id?: string;
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  /** Optional provider-level idempotency key. Reusing the same key prevents
   * duplicate sends when an automated trigger is retried. */
  idempotencyKey?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendTransactionalEmail: RESEND_API_KEY is not set — email not sent.");
    return { ok: false, error: "Email is not configured." };
  }

  // Every transactional send Reply-To's to the support inbox (SUPPORT_EMAIL)
  // instead of the noreply@ sender above, so a customer who hits "reply" on
  // any automated email reaches a real, monitored inbox rather than
  // bouncing or vanishing. Sent whenever the env var is set; silently
  // omitted (not a hard failure) if it isn't, so email keeps working before
  // the owner configures it.
  const replyTo = process.env.SUPPORT_EMAIL || undefined;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(params.headers ? { headers: params.headers } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("sendTransactionalEmail failed:", res.status, body);
      return { ok: false, error: `Email provider returned ${res.status}` };
    }

    // Resend responds { id: "...", from, to, ... } on success — capture the
    // message id for idempotency-aware callers. Best-effort: if the body
    // isn't parseable we still treat the send as ok.
    let id: string | undefined;
    try {
      const json = (await res.json()) as { id?: string };
      if (json?.id) id = json.id;
    } catch {
      // ignore — some providers return an empty 200 body
    }

    return { ok: true, id };
  } catch (err) {
    console.error("sendTransactionalEmail threw:", err);
    return { ok: false, error: "Failed to reach email provider." };
  }
}
