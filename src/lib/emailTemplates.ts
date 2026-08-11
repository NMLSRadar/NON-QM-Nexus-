export function subscriptionCanceledEmail(params: {
  planName: string;
  canceledAtIso: string;
}): { subject: string; html: string } {
  const canceledDate = new Date(params.canceledAtIso).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return {
    subject: `Your ${params.planName} subscription has been canceled`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Subscription canceled</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>This confirms your <strong>${params.planName}</strong> subscription has been canceled.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Plan</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">${params.planName}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Access ends</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">Immediately — ${canceledDate}</td>
          </tr>
        </table>
        <p style="font-size: 14px; color: #475569;">
          Your lender-comparison access beyond the free tier has already ended. If this wasn't you, or you'd like
          to reactivate, just reply to this email.
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">
          NON-QM Nexus — demonstration environment. This is an automated confirmation.
        </p>
      </div>
    `,
  };
}

export function subscriptionReactivatedEmail(params: {
  planName: string;
  monthlyPriceCents: number;
}): { subject: string; html: string } {
  const priceDollars = params.monthlyPriceCents / 100;
  const priceLabel = `$${priceDollars % 1 === 0 ? priceDollars : priceDollars.toFixed(2)}/month`;

  return {
    subject: `Your ${params.planName} subscription is active again`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Subscription reactivated</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>This confirms your <strong>${params.planName}</strong> subscription is active again.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Plan</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">${params.planName}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Price</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">${priceLabel}</td>
          </tr>
        </table>
        <p style="font-size: 14px; color: #475569;">
          Your lender-comparison access is restored immediately. If this wasn't you, reply to this email right away.
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">
          NON-QM Nexus — demonstration environment. This is an automated confirmation.
        </p>
      </div>
    `,
  };
}

const TRIAL_EMAIL_FOOTER = `
  <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">
    NON-QM Nexus — this is an automated email about your 14-day All Access trial.
  </p>
`;

/** Sent immediately after a real trial activates (spec Phase 7,
 * "Activation Email"). */
export function trialActivationEmail(params: { firstName: string | null; expiresAtIso: string; appUrl: string }): {
  subject: string;
  html: string;
} {
  const expiresDate = new Date(params.expiresAtIso).toLocaleDateString("en-US", { dateStyle: "long" });
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi,";
  return {
    subject: "Your 14-day Non-QM Nexus All Access trial is active",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Your trial is active</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>${greeting}</p>
        <p>Your 14-day All Access trial is live — full Tier 1, 2, and 3 lender guidelines, Voice Scenario, lender comparisons, and the AI Assistant, all unlocked.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Trial expires</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">${expiresDate}</td>
          </tr>
        </table>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.appUrl}/scenarios/voice" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Start a Voice Scenario</a>
        </p>
        <p style="font-size: 14px; color: #475569;">
          <strong>Voice Scenario</strong> lets you describe a borrower's file out loud — income documentation, citizenship, credit history — and the platform captures the vitals and asks only for what's missing.
        </p>
        <p style="font-size: 14px; color: #475569;">
          <strong>Lender comparisons</strong> rank every applicable program by real guideline eligibility, with a transparent "Why This Lender?" explanation for each match.
        </p>
        <p style="font-size: 14px; color: #475569;">
          No credit card is on file and you won't be automatically charged — you'll choose a plan only if you want to keep access after your trial ends.
        </p>
        ${TRIAL_EMAIL_FOOTER}
      </div>
    `,
  };
}

/** Sent ~7 days after activation (spec Phase 7, "Mid-Trial Email"). */
export function trialMidPointEmail(params: { firstName: string | null; daysRemaining: number; appUrl: string }): {
  subject: string;
  html: string;
} {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi,";
  return {
    subject: `${params.daysRemaining} days left in your Non-QM Nexus trial`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">You're halfway through your trial</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>${greeting}</p>
        <p>You have <strong>${params.daysRemaining} days</strong> remaining in your All Access trial. A couple of things worth trying if you haven't yet:</p>
        <ul style="font-size: 14px; color: #475569;">
          <li>Run a real scenario through <strong>Voice Scenario</strong> — just describe the file out loud.</li>
          <li>Pull up <strong>lender comparisons</strong> for a tricky file and see the "Why This Lender?" breakdown.</li>
        </ul>
        <p style="font-size: 14px; color: #475569;">
          We'd genuinely like your feedback — just reply to this email with anything that surprised you, good or bad.
        </p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.appUrl}/scenarios/voice" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Open Voice Scenario</a>
        </p>
        ${TRIAL_EMAIL_FOOTER}
      </div>
    `,
  };
}

/** Sent ~48 hours before expiration (spec Phase 7, "Expiration Reminder"). */
export function trialExpirationReminderEmail(params: { firstName: string | null; expiresAtIso: string; appUrl: string }): {
  subject: string;
  html: string;
} {
  const expiresDate = new Date(params.expiresAtIso).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi,";
  return {
    subject: "Your Non-QM Nexus trial ends in 2 days",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Your trial ends soon</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>${greeting}</p>
        <p>Your All Access trial ends on <strong>${expiresDate}</strong>. After that, lender guidelines, Voice Scenario, and the AI Assistant will require a paid membership.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.appUrl}/pricing" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">View membership</a>
        </p>
        <p style="font-size: 14px; color: #475569;">
          Choose the membership on the pricing page to keep uninterrupted access — your saved scenarios carry over either way.
        </p>
        ${TRIAL_EMAIL_FOOTER}
      </div>
    `,
  };
}

/** Sent once the trial has actually expired (spec Phase 7, "Expiration Email"). */
export function trialExpiredEmail(params: { firstName: string | null; appUrl: string }): { subject: string; html: string } {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi,";
  return {
    subject: "Your Non-QM Nexus trial has ended",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Your trial has ended</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>${greeting}</p>
        <p>Your 14-day All Access trial has ended. Your account, and every scenario you saved during the trial, are still there — nothing was deleted.</p>
        <p style="font-size: 14px; color: #475569;">Select a membership tier to continue accessing lender guidelines, Voice Scenario analysis, lender rankings, and AI-powered recommendations.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.appUrl}/pricing" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Select a membership tier</a>
        </p>
        ${TRIAL_EMAIL_FOOTER}
      </div>
    `,
  };
}

// ---------------------------------------------------------------------
// AE Directory outreach templates (2026-07-30). Both are commercial email
// to a NON-USER (a lender's AE contact) — every send goes through
// src/lib/email/sendCommercial.ts, which enforces suppression and adds
// the List-Unsubscribe header; the templates themselves carry the
// one-click unsubscribe link and the business postal address per
// CAN-SPAM, using the real OWNER_POSTAL_ADDRESS env var — never an
// invented address.
// ---------------------------------------------------------------------

function commercialEmailFooter(unsubscribeUrl: string): string {
  const postalAddress = process.env.OWNER_POSTAL_ADDRESS;
  return `
    <p style="font-size: 11px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
      NON-QM Nexus${postalAddress ? ` — ${postalAddress}` : ""}<br />
      You're receiving this because your business contact information is listed as a lender Account Executive.
      <a href="${unsubscribeUrl}" style="color: #64748b;">Unsubscribe</a> at any time — one click, no account needed.
    </p>
  `;
}

/** "Your AE profile on NON-QM Nexus" — the free-directory invite. No
 * stats required; always safe to send regardless of activity. */
export function claimInviteEmail(params: {
  recipientName: string;
  lenderName: string;
  claimUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "Your AE profile on NON-QM Nexus",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Your AE profile on NON-QM Nexus</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>Hi ${params.recipientName},</p>
        <p>
          ${params.lenderName} is live on NON-QM Nexus, a platform brokers use to compare Non-QM lender guidelines and find the
          right program for a scenario. A profile with your name is ready for you to claim — it's free, and takes under a minute.
        </p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.claimUrl}" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Claim your free profile</a>
        </p>
        <p style="font-size: 14px; color: #475569;">
          Once claimed, brokers browsing ${params.lenderName} on the platform can reach you directly by phone or email.
        </p>
        ${commercialEmailFooter(params.unsubscribeUrl)}
      </div>
    `,
  };
}

/** "Brokers looked for you {count} times last month on NON-QM Nexus" —
 * leads with the AE's REAL numbers. Returns null (never renders) when
 * every metric is genuinely zero — the caller must fall back to
 * claimInviteEmail, per the "never fabricate metrics" rule. */
export function statsPitchEmail(params: {
  recipientName: string;
  lenderName: string;
  stats: { views: number; phoneClicks: number; emailClicks: number; lenderScenarioMatches: number };
  subscribeUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } | null {
  const { views, phoneClicks, emailClicks, lenderScenarioMatches } = params.stats;
  const totalActivity = views + phoneClicks + emailClicks + lenderScenarioMatches;
  if (totalActivity === 0) return null;

  const contactActions = phoneClicks + emailClicks;

  return {
    subject: `Brokers looked for you ${totalActivity} times last month on NON-QM Nexus`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Brokers looked for you last month</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>Hi ${params.recipientName},</p>
        <p>
          Your AE profile got <strong>${views} profile view${views === 1 ? "" : "s"}</strong> last month, and
          <strong>${lenderScenarioMatches} scenario${lenderScenarioMatches === 1 ? "" : "s"}</strong> matched ${params.lenderName}'s
          programs${contactActions > 0 ? `, with ${contactActions} broker${contactActions === 1 ? "" : "s"} contacting you directly` : ""}.
        </p>
        <p style="font-size: 14px; color: #475569;">
          Featured Placement puts your profile first in ${params.lenderName}'s AE list with a "Sponsored" badge, surfaces you in a
          dedicated contact card on matching scenario results, and unlocks full stats — a flat monthly subscription for placement,
          never tied to leads or referrals.
        </p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.subscribeUrl}" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">See Featured Placement</a>
        </p>
        ${commercialEmailFooter(params.unsubscribeUrl)}
      </div>
    `,
  };
}

/** Sent when an org_admin invites someone to join their team (Team
 * Membership spec, 2026-07-30) — tokenized accept link, expiry stated
 * plainly since the raw token only ever exists in this email. */
export function orgInviteEmail(params: {
  organizationName: string;
  role: string;
  inviterEmail: string;
  acceptUrl: string;
  expiresAtIso: string;
}): { subject: string; html: string } {
  const expiresDate = new Date(params.expiresAtIso).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const roleLabel = params.role.replace(/_/g, " ");

  return {
    subject: `${params.inviterEmail} invited you to join ${params.organizationName} on NON-QM Nexus`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">You've been invited to a team</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p><strong>${params.inviterEmail}</strong> invited you to join <strong>${params.organizationName}</strong> as a <strong>${roleLabel}</strong> — your seat is covered by their team subscription, no billing setup needed on your end.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.acceptUrl}" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Accept invitation</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">This link expires on ${expiresDate}. If you weren't expecting this invitation, you can safely ignore this email.</p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">
          NON-QM Nexus — this is an automated invitation email.
        </p>
      </div>
    `,
  };
}

// ---------------------------------------------------------------------
// Bulk Membership (2026-07-31, docs/bulk-membership.md) — internal ops
// notification for a new inbound quote request, plus the two customer-
// facing emails an admin action triggers once a deal is set up.
// ---------------------------------------------------------------------

/** Internal-only — sent to the ops/notify inbox when a new Bulk Membership
 * request lands (never sent to the requester). */
export function bulkMembershipRequestNotifyEmail(params: {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  seatCountRequested: number;
  notes: string | null;
  appUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `New Bulk Membership request — ${params.companyName} (${params.seatCountRequested} seats)`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">New Bulk Membership request</h1>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 0; color: #64748b;">Company</td><td style="text-align: right; font-weight: 600;">${params.companyName}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Contact</td><td style="text-align: right;">${params.contactName} — ${params.contactEmail}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Phone</td><td style="text-align: right;">${params.contactPhone ?? "—"}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Seats requested</td><td style="text-align: right; font-weight: 600;">${params.seatCountRequested}</td></tr>
        </table>
        ${params.notes ? `<p style="font-size: 13px; color: #475569;"><strong>Notes:</strong> ${params.notes}</p>` : ""}
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.appUrl}/admin/bulk-memberships" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Review in admin</a>
        </p>
      </div>
    `,
  };
}

/** Sent to the customer contact once ops has negotiated card-billed
 * pricing and generated a Stripe Checkout link for their seat count. */
export function bulkMembershipCheckoutLinkEmail(params: {
  companyName: string;
  seatCount: number;
  pricePerSeatCents: number;
  checkoutUrl: string;
}): { subject: string; html: string } {
  const priceLabel = formatCentsForEmail(params.pricePerSeatCents);
  return {
    subject: `Your NON-QM Nexus Bulk Membership for ${params.companyName} is ready`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Your Bulk Membership is ready</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>Your negotiated Bulk Membership for <strong>${params.companyName}</strong> is set up: <strong>${params.seatCount} seats</strong> at <strong>${priceLabel}/seat/month</strong>.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.checkoutUrl}" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Complete checkout</a>
        </p>
        <p style="font-size: 14px; color: #475569;">
          Once payment is confirmed, you'll be able to invite your entire team — up to ${params.seatCount} loan officers — in one bulk upload from your account's Team page.
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">NON-QM Nexus — this is an automated email about your Bulk Membership.</p>
      </div>
    `,
  };
}

/** Sent to the customer contact once ops has sent a NET-30 invoice for
 * their Bulk Membership. */
export function bulkMembershipInvoiceSentEmail(params: {
  companyName: string;
  seatCount: number;
  totalCents: number;
  invoiceUrl: string;
  dueDate: string;
}): { subject: string; html: string } {
  const totalLabel = formatCentsForEmail(params.totalCents);
  return {
    subject: `Your NON-QM Nexus Bulk Membership invoice for ${params.companyName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Your Bulk Membership invoice</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 0;">NON-QM Nexus</p>
        <p>An invoice for <strong>${params.companyName}</strong>'s Bulk Membership (${params.seatCount} seats, ${totalLabel} total) is ready, due ${params.dueDate}.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.invoiceUrl}" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">View & pay invoice</a>
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">NON-QM Nexus — this is an automated email about your Bulk Membership.</p>
      </div>
    `,
  };
}

/** Beta-invitation email (2026-08-10) — sent when a platform admin
 * hand-picks a loan officer for a trial campaign from the admin Trials
 * panel. The recipient does NOT need an account yet: the emailed link is a
 * plain app URL carrying an app-generated token (…?token=<raw>), validated
 * server-side on /trial/[slug]/invite-accept, where they either create
 * their account (choose a password) or sign in, and the trial starts
 * automatically either way. Chat-banned tools — rendered inline (no
 * external asset), matching the on-brand black/gold transactional style. */
export function trialInviteEmail(params: {
  campaignName: string;
  campaignSlug: string;
  trialDurationDays: number;
  requiresAccountCreation: boolean;
  link: string;
  inviterEmail: string;
}): { subject: string; html: string } {
  const roleLine = params.requiresAccountCreation
    ? "You’ve been invited to beta-test it. Use the link below to create your account — your trial starts automatically as soon as you do. No credit card, nothing to cancel."
    : "Your beta trial is ready. Use the link below to sign in — your trial starts automatically.";
  return {
    subject: `Beta invitation: ${params.trialDurationDays}-day NON-QM Nexus trial`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; color: #e5e7eb; background: #080808; border: 1px solid #b88a2b; border-radius: 16px; padding: 28px;">
        <p style="margin:0 0 8px;color:#d7b45b;font-size:12px;letter-spacing:.12em;text-transform:uppercase">NON-QM Nexus</p>
        <h1 style="margin:0 0 16px;color:#fff;font-size:22px;line-height:1.25">Your ${params.trialDurationDays}-day beta trial is ready</h1>
        <p style="color:#d1d5db;line-height:1.6;font-size:14px">
          <strong>${params.inviterEmail}</strong> invited you to beta-test <strong>${params.campaignName}</strong> on
          NON-QM Nexus — the platform for evaluating non-QM scenarios against live lender guidelines.
        </p>
        <p style="color:#d1d5db;line-height:1.6;font-size:14px">${roleLine}</p>
        <p style="margin:28px 0;text-align:center">
          <a href="${params.link}" style="background:#d4af52;color:#080808;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px;font-size:14px;display:inline-block">${params.requiresAccountCreation ? "Create your account" : "Sign in to start your trial"}</a>
        </p>
        <p style="color:#9ca3af;font-size:13px;line-height:1.5">
          Full access lasts ${params.trialDurationDays} days. No credit card is on file and you won’t be automatically
          charged — you’ll only choose a plan if you want to keep access after the trial ends.
        </p>
        <p style="color:#6b7280;font-size:12px;line-height:1.5;margin-top:20px">
          If you weren’t expecting this invitation, you can safely ignore this email. If you have questions, just reply to it.
        </p>
      </div>`,
  };
}

function formatCentsForEmail(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars % 1 === 0 ? dollars.toLocaleString("en-US") : dollars.toFixed(2)}`;
}
