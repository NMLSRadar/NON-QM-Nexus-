// Custom transactional email via Resend's HTTP API — separate from
// Supabase Auth's built-in email sender (signup confirmation, password
// reset), which is rate-limited and only fires for those specific auth
// events. Anything else the app needs to email a user about (like a
// subscription-cancellation confirmation) goes through here instead.
import "server-only";

const RESEND_API_URL = "https://api.resend.com/emails";
// Resend's shared test domain — works immediately with no DNS setup.
// Swap to a verified custom domain address once one is configured.
const FROM_ADDRESS = "NON-QM Nexus <onboarding@resend.dev>";

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendTransactionalEmail: RESEND_API_KEY is not set — email not sent.");
    return { ok: false, error: "Email is not configured." };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("sendTransactionalEmail failed:", res.status, body);
      return { ok: false, error: `Email provider returned ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    console.error("sendTransactionalEmail threw:", err);
    return { ok: false, error: "Failed to reach email provider." };
  }
}
