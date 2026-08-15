import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy — NON-QM Nexus",
  description: "How NON-QM Nexus collects, uses, and protects your data as an underwriting-assistance and research platform.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate max-w-3xl mx-auto py-8 prose-headings:font-semibold prose-a:text-brand-600">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-slate-500">Last updated: July 24, 2026</p>

      <p>
        This Privacy Policy explains what information NON-QM Nexus (&quot;we,&quot; &quot;us&quot;) collects when
        you use our Service, how we use it, and the choices you have.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> the email address and password you use to sign up (your password is
          never stored in plain text — authentication is handled by our database provider, Supabase, using
          industry-standard hashing).
        </li>
        <li>
          <strong>Scenario data:</strong> the borrower/loan scenario details you enter (e.g. FICO range, loan
          amount, property type, income documentation type) to get lender/program matches. This is used to power
          the matching feature and is stored under your organization&apos;s account.
        </li>
        <li>
          <strong>Membership/subscription data:</strong> which plan tier you&apos;re on, assigned by our admin team
          (or, in the future, chosen via self-serve checkout).
        </li>
        <li>
          <strong>Uploaded documents:</strong> if you (as an admin) upload a lender guideline PDF, the file and any
          AI-extracted data derived from it are stored to support the review workflow.
        </li>
        <li>
          <strong>Usage/technical data:</strong> standard web request logs (IP address, browser type, timestamps)
          collected by our hosting provider for security and reliability purposes.
        </li>
      </ul>
      <p>We do not collect Social Security numbers, full loan applications, or other consumer PII through this Service — it is a professional decision-support tool, not a consumer loan application portal.</p>

      <h2>2. How We Use Information</h2>
      <ul>
        <li>To operate the Service — authenticate you, save your scenarios, and show you the lender data your membership tier includes;</li>
        <li>To send transactional email — password resets, account/subscription confirmations, and (for admins) automated alerts when a monitored lender guideline changes;</li>
        <li>To improve and secure the Service — diagnosing bugs, preventing abuse, and enforcing our Terms of Service;</li>
        <li>To extract structured guideline data from lender documents you or we upload, using AI models, always subject to human review before anything becomes part of the live database.</li>
      </ul>
      <p>We do not sell your personal information. We do not use your scenario data to train third-party AI models.</p>

      <h2>3. Third-Party Service Providers</h2>
      <p>We rely on the following providers to operate the Service, each of which processes data on our behalf under their own security and privacy commitments:</p>
      <ul>
        <li><strong>Stripe</strong> — payment processing and subscription billing. Payment card data is transmitted directly to Stripe and never touches our servers; Stripe is a PCI-DSS Level 1 certified processor.</li>
        <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
        <li><strong>Vercel</strong> — application hosting.</li>
        <li><strong>Resend</strong> — transactional email delivery (password resets, confirmations, alerts).</li>
        <li><strong>Sentry</strong> — error and crash monitoring. Diagnostic data (stack traces, device/browser metadata) is scrubbed of personal identifiers on-device before transmission.</li>
        <li><strong>OpenAI / Anthropic</strong> — AI-based extraction of structured data from lender guideline documents (admin-uploaded documents only).</li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>
        We retain your account and scenario data for as long as your account is active. If you cancel your
        subscription, your account and scenario history are retained (so you can resume later) unless you
        specifically request deletion. Lender guideline documents and their extraction history are retained for
        audit and change-tracking purposes (see our automated guideline-monitoring feature) even after a program is
        updated or superseded.
      </p>

      <h2>5. Your Rights and Choices</h2>
      <ul>
        <li>
          <strong>Access / export:</strong> you can request a copy of your account and scenario data by emailing{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </li>
        <li>
          <strong>Correction:</strong> you can update your own account details at any time from your account
          settings.
        </li>
        <li>
          <strong>Deletion:</strong> you can request deletion of your account and associated personal data at any
          time by emailing <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We will process deletion
          requests within a reasonable time, subject to any records we are legally required to retain.
        </li>
        <li>
          <strong>Marketing email:</strong> transactional emails (password resets, subscription confirmations,
          guideline-change alerts) are necessary to the Service and cannot be opted out of while your account is
          active. Separately, business contact outreach to lender Account Executives (see Section 10 below) is
          commercial email you can unsubscribe from at any time with one click, no account required.
        </li>
      </ul>

      <h2>6. Security</h2>
      <p>
        We use row-level security in our database so that one organization&apos;s data is never visible to another,
        restrict lender/program data uploads to platform administrators only, and use HTTPS/TLS for all traffic to
        the Service. No system is 100% secure, and we cannot guarantee absolute security of information transmitted
        to the Service.
      </p>

      <h2>7. Children&apos;s Privacy</h2>
      <p>The Service is intended for licensed mortgage professionals and is not directed to children under 18. We do not knowingly collect information from children.</p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be reflected by an updated
        &quot;Last updated&quot; date above.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about this Privacy Policy, or to make a data access/deletion request:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>10. AE Directory &amp; Business Contact Outreach</h2>
      <p>
        The Service maintains a directory of lender Account Executive (AE) business contact information — name,
        title, business email, business phone, licensed states, and NMLS ID where applicable. Sources for this
        information include: the AE&apos;s own free-form claim of their listing, admin-entered records compiled
        from a lender&apos;s own public wholesale/website materials, and, in limited cases, business contact
        information sourced from third-party business-contact research for the purpose of inviting an AE to claim
        their free listing.
      </p>
      <ul>
        <li>
          <strong>Directory visibility:</strong> a non-hidden AE profile&apos;s name, title, licensed states, and
          contact methods are visible to any user browsing the corresponding lender&apos;s page. We record
          aggregate, anonymous view/click counts on AE profiles (never who viewed or clicked) to power the AE&apos;s
          own stats dashboard.
        </li>
        <li>
          <strong>Sponsored placement:</strong> an AE may pay a flat monthly subscription for featured placement.
          This is advertising placement only — it never influences, and has zero effect on, any lender or program
          matching, eligibility determination, or ranking shown to a broker.
        </li>
        <li>
          <strong>Commercial email to AE contacts:</strong> we may email a lender AE contact (whether or not they
          have created an account) inviting them to claim their free directory listing, or, once claimed, sharing
          their own real usage statistics and the option of paid featured placement. Every such email includes a
          working one-click unsubscribe link and our business postal address, consistent with the CAN-SPAM Act.
          An unsubscribed address is permanently suppressed from all future commercial email from us.
        </li>
        <li>
          <strong>Removal on request:</strong> any AE (or someone acting on their behalf) may request removal of
          their business contact information from the directory, or correction of any inaccurate detail, at any
          time by emailing <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or clicking the
          unsubscribe link in any email we&apos;ve sent them.
        </li>
      </ul>

      <p className="text-xs text-slate-400">
        This policy is a working draft appropriate for the Service&apos;s current scope (no consumer PII, no live
        payment processing). It should be reviewed by a licensed attorney — and updated — before real payment
        processing, consumer-facing data collection, or operation in jurisdictions with specific privacy statutes
        (e.g. CCPA, GDPR) is enabled.
      </p>
    </article>
  );
}
