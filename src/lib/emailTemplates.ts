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
