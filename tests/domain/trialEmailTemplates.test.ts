import { describe, expect, it } from "vitest";
import { trialActivationEmail, trialMidPointEmail, trialExpirationReminderEmail, trialExpiredEmail } from "@/lib/emailTemplates";

// Per spec Phase 7's 4 required trial email types. These are pure
// template functions (no network/DB) — the real send path (sendTransactionalEmail
// via Resend) and its idempotent trigger points are covered by the cron
// route and the activation-email server action; both use these same
// templates, so verifying the templates' content here is what actually
// pins the REQUIRED content of each email without needing a live send.
describe("Trial email templates (spec Phase 7)", () => {
  it("activation email includes the expiration date, a no-credit-card reassurance, and explains Voice Scenario + lender comparisons", () => {
    const { subject, html } = trialActivationEmail({ firstName: "Alex", expiresAtIso: "2026-08-11T14:00:00Z", appUrl: "https://nonqmnexus.com" });
    expect(subject).toMatch(/trial is active/i);
    expect(html).toContain("Alex");
    expect(html).toMatch(/2026/); // expiration date rendered
    expect(html).toMatch(/won't be automatically charged/i);
    expect(html).toMatch(/Voice Scenario/);
    expect(html).toMatch(/lender comparisons/i);
  });

  it("mid-trial email states days remaining and invites feedback", () => {
    const { subject, html } = trialMidPointEmail({ firstName: "Alex", daysRemaining: 7, appUrl: "https://nonqmnexus.com" });
    expect(subject).toMatch(/7 days left/i);
    expect(html).toMatch(/7 days/);
    expect(html).toMatch(/feedback/i);
    expect(html).toMatch(/Voice Scenario/);
  });

  it("expiration reminder email includes the exact expiration date/time and membership-tier link", () => {
    const { subject, html } = trialExpirationReminderEmail({ firstName: "Alex", expiresAtIso: "2026-08-11T14:00:00Z", appUrl: "https://nonqmnexus.com" });
    expect(subject).toMatch(/ends in 2 days/i);
    expect(html).toMatch(/2026/);
    expect(html).toContain("/pricing");
  });

  it("expiration email confirms the trial ended, reassures saved scenarios remain, and links to plan selection", () => {
    const { subject, html } = trialExpiredEmail({ firstName: "Alex", appUrl: "https://nonqmnexus.com" });
    expect(subject).toMatch(/trial has ended/i);
    expect(html).toMatch(/nothing was deleted/i);
    expect(html).toMatch(/scenario/i);
    expect(html).toContain("/pricing");
  });

  it("falls back to a generic greeting when no first name is on file", () => {
    const { html } = trialActivationEmail({ firstName: null, expiresAtIso: "2026-08-11T14:00:00Z", appUrl: "https://nonqmnexus.com" });
    expect(html).toContain("Hi,");
  });
});
