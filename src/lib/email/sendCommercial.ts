import "server-only";
import { sendTransactionalEmail, type SendEmailResult } from "@/lib/email";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { buildUnsubscribeUrl } from "./unsubscribeToken";

/**
 * The SINGLE send path for every commercial email in this app (outreach,
 * stats pitch, etc.) — suppression is enforced HERE, not per-template, per
 * the spec: any address in email_suppressions is refused before Resend is
 * ever called, regardless of which template or caller. Also attaches the
 * List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058) pointing at
 * the same one-click endpoint the template's own footer link uses.
 *
 * Transactional emails (subscription confirmations, password reset, etc.)
 * do NOT go through this function — they use sendTransactionalEmail
 * directly, since CAN-SPAM's commercial-email requirements (postal
 * address, unsubscribe) apply to commercial/marketing email, not
 * transactional account notices.
 */
export async function sendCommercialEmail(params: { to: string; subject: string; html: string }): Promise<SendEmailResult> {
  const normalizedTo = params.to.trim().toLowerCase();

  const service = createServiceRoleClient();
  const { data: suppressed } = await service.from("email_suppressions").select("email").ilike("email", normalizedTo).maybeSingle();
  if (suppressed) {
    return { ok: false, error: "Recipient has unsubscribed — email suppressed." };
  }

  const unsubscribeUrl = buildUnsubscribeUrl(normalizedTo);
  return sendTransactionalEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data } = await service.from("email_suppressions").select("email").ilike("email", email.trim().toLowerCase()).maybeSingle();
  return Boolean(data);
}
