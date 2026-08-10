// Beta Tester Feedback emails — Day 3 (initial questionnaire) and Day 5
// (follow-up). Both match the app's dark-gold transactional style used by the
// other trial emails (trialInviteEmail etc.). The survey link is the same
// secure token URL in both, so a follow-up click resumes where they left off.
import { SITE_NAME } from "@/lib/seo";

const goldThemedWrapper = (inner: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:24px 12px;">
    <tr><td align="center">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#e5e7eb;background:#0d0d0f;border:1px solid #b88a2b;border-radius:16px;padding:28px;">
        ${inner}
      </div>
    </td></tr>
  </table>`;

const goldButton = (label: string, href: string) => `
  <p style="margin:28px 0;text-align:center;">
    <a href="${href}" style="background:#d4af52;color:#080808;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:8px;font-size:14px;display:inline-block;">${label}</a>
  </p>`;

/** Day 3 — first feedback request, 3 days after the trial started. */
export function betaFeedbackDay3Email(params: { firstName: string | null; surveyUrl: string }): { subject: string; html: string } {
  const name = params.firstName?.trim() ? params.firstName.trim() : "there";
  return {
    subject: "How's your NON-QM Nexus experience so far?",
    html: goldThemedWrapper(`
      <p style="margin:0 0 8px;color:#d7b45b;font-size:12px;letter-spacing:.12em;text-transform:uppercase">${SITE_NAME}</p>
      <h1 style="margin:0 0 16px;color:#fff;font-size:21px;line-height:1.3">How's your NON-QM Nexus experience so far?</h1>
      <p style="color:#d1d5db;line-height:1.6;font-size:14px">Hi ${name},</p>
      <p style="color:#d1d5db;line-height:1.6;font-size:14px">
        You've had a few days to explore NON-QM Nexus, and I'd really appreciate your feedback.
        We're currently improving the platform based directly on feedback from our beta testers, so your input is extremely valuable.
      </p>
      <p style="color:#d1d5db;line-height:1.6;font-size:14px">The survey should only take a couple of minutes.</p>
      ${goldButton("SHARE MY FEEDBACK", params.surveyUrl)}
      <p style="color:#9ca3af;font-size:13px;line-height:1.5">
        We're especially interested in how accurate the Voice Scenario and AI Assistant have been, how easy the platform is to use,
        and whether you believe NON-QM Nexus could help you in your day-to-day business.
      </p>
      <p style="color:#d1d5db;line-height:1.6;font-size:14px">Thank you again for helping us build a better platform for mortgage professionals.</p>
      <p style="color:#9ca3af;font-size:13px;line-height:1.5">— The ${SITE_NAME} Team</p>
      <p style="color:#6b7280;font-size:12px;line-height:1.5;margin-top:20px">Your progress is saved automatically &mdash; you can finish in multiple sittings.</p>
    `),
  };
}

/** Day 5 — follow-up, only when the survey hasn't been completed. The link is
 * the same token URL, which resumes the partially-completed questionnaire. */
export function betaFollowUpDay5Email(params: { firstName: string | null; surveyUrl: string }): { subject: string; html: string } {
  const name = params.firstName?.trim() ? params.firstName.trim() : "there";
  return {
    subject: "Quick follow-up — we'd love your feedback",
    html: goldThemedWrapper(`
      <p style="margin:0 0 8px;color:#d7b45b;font-size:12px;letter-spacing:.12em;text-transform:uppercase">${SITE_NAME}</p>
      <h1 style="margin:0 0 16px;color:#fff;font-size:21px;line-height:1.3">Quick follow-up &mdash; we'd love your feedback</h1>
      <p style="color:#d1d5db;line-height:1.6;font-size:14px">Hi ${name},</p>
      <p style="color:#d1d5db;line-height:1.6;font-size:14px">
        Just a quick follow-up regarding your NON-QM Nexus beta experience.
        If you haven't had a chance to finish the feedback survey yet, we'd really appreciate a couple of minutes of your time.
      </p>
      <p style="color:#d1d5db;line-height:1.6;font-size:14px">Your feedback is directly helping us improve the accuracy, usability, and overall experience of NON-QM Nexus before the official launch.</p>
      ${goldButton("COMPLETE MY FEEDBACK", params.surveyUrl)}
      <p style="color:#9ca3af;font-size:13px;line-height:1.5">If you already started the questionnaire, this button returns you to where you left off rather than restarting.</p>
      <p style="color:#d1d5db;line-height:1.6;font-size:14px">Thank you again for being one of our beta testers.</p>
      <p style="color:#9ca3af;font-size:13px;line-height:1.5">— The ${SITE_NAME} Team</p>
    `),
  };
}