import { describe, expect, it } from "vitest";
import { claimInviteEmail, statsPitchEmail } from "@/lib/emailTemplates";

const unsubscribeUrl = "https://nonqmnexus.com/api/email/unsubscribe?t=abc.def";

describe("claimInviteEmail", () => {
  it("renders with a truthful subject, postal address, and unsubscribe link — no stats required", () => {
    process.env.OWNER_POSTAL_ADDRESS = "13598 Herron Street Sylmar, CA 91342";
    const email = claimInviteEmail({
      recipientName: "Jane Doe",
      lenderName: "Acra Lending",
      claimUrl: "https://nonqmnexus.com/ae/claim",
      unsubscribeUrl,
    });
    expect(email.subject).toBe("Your AE profile on NON-QM Nexus");
    expect(email.html).toContain("Acra Lending");
    expect(email.html).toContain("13598 Herron Street Sylmar, CA 91342");
    expect(email.html).toContain(unsubscribeUrl);
  });
});

describe("statsPitchEmail", () => {
  it("refuses to render (returns null) when every metric is genuinely zero", () => {
    const email = statsPitchEmail({
      recipientName: "Jane Doe",
      lenderName: "Acra Lending",
      stats: { views: 0, phoneClicks: 0, emailClicks: 0, lenderScenarioMatches: 0 },
      subscribeUrl: "https://nonqmnexus.com/ae/subscribe",
      unsubscribeUrl,
    });
    expect(email).toBeNull();
  });

  it("renders with the recipient's REAL numbers leading the subject and body when activity is nonzero", () => {
    process.env.OWNER_POSTAL_ADDRESS = "13598 Herron Street Sylmar, CA 91342";
    const email = statsPitchEmail({
      recipientName: "Jane Doe",
      lenderName: "Acra Lending",
      stats: { views: 42, phoneClicks: 3, emailClicks: 5, lenderScenarioMatches: 17 },
      subscribeUrl: "https://nonqmnexus.com/ae/subscribe",
      unsubscribeUrl,
    });
    expect(email).not.toBeNull();
    expect(email!.subject).toBe("Brokers looked for you 67 times last month on NON-QM Nexus");
    expect(email!.html).toContain("42 profile views");
    expect(email!.html).toContain("17 scenarios");
    expect(email!.html).toContain("Acra Lending");
    expect(email!.html).toContain(unsubscribeUrl);
    expect(email!.html).toContain("13598 Herron Street Sylmar, CA 91342");
  });

  it("renders correctly with only nonzero views (no clicks, no matches) — never invents a zero-value claim", () => {
    const email = statsPitchEmail({
      recipientName: "Jane Doe",
      lenderName: "Acra Lending",
      stats: { views: 5, phoneClicks: 0, emailClicks: 0, lenderScenarioMatches: 0 },
      subscribeUrl: "https://nonqmnexus.com/ae/subscribe",
      unsubscribeUrl,
    });
    expect(email).not.toBeNull();
    expect(email!.subject).toBe("Brokers looked for you 5 times last month on NON-QM Nexus");
    expect(email!.html).not.toContain("brokers contacting you directly");
  });
});
