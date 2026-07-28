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
        <p>Your All Access trial ends on <strong>${expiresDate}</strong>. After that, lender guidelines, Voice Scenario, and the AI Assistant will require a paid membership tier.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.appUrl}/pricing" style="background: #0f172a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">View membership tiers</a>
        </p>
        <p style="font-size: 14px; color: #475569;">
          Choose Essential, Professional, or Enterprise on the pricing page to keep uninterrupted access — your saved scenarios carry over either way.
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
