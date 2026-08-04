import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service — NON-QM Nexus",
  description:
    "The terms governing your use of NON-QM Nexus, an underwriting-assistance and research tool for Non-QM scenario analysis.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <article className="prose prose-slate max-w-3xl mx-auto py-8 prose-headings:font-semibold prose-a:text-brand-600">
      <h1>Terms of Service</h1>
      <p className="text-sm text-slate-500">Last updated: July 24, 2026</p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of NON-QM Nexus (the
        &quot;Service&quot;), operated by NMLS Radar (&quot;we,&quot; &quot;us,&quot; or &quot;the
        Company&quot;)<sup>[1]</sup>. By creating an account or otherwise using the Service, you agree to be bound
        by these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. What the Service Is — and Is Not</h2>
      <p>
        NON-QM Nexus is a research and decision-support tool for mortgage professionals evaluating Non-QM
        (non-qualified-mortgage) lending scenarios against publicly available lender program guidelines. It helps
        you compare programs, estimate eligibility, and organize scenario data.
      </p>
      <p><strong>NON-QM Nexus is not:</strong></p>
      <ul>
        <li>A lender. We do not originate, underwrite, approve, fund, or service any loan.</li>
        <li>
          A guarantee of loan approval, pricing, or eligibility. Every match, score, or eligibility indicator the
          Service produces is an estimate based on our understanding of publicly available guideline documents at
          the time they were reviewed, which may be incomplete, out of date, or superseded by the lender&apos;s own
          overlays, exceptions, or unpublished policies.
        </li>
        <li>Legal, tax, financial, or compliance advice. Consult a qualified professional for those.</li>
      </ul>
      <p>
        You are solely responsible for independently verifying any guideline, rate, or eligibility criterion with
        the lender directly before relying on it in any real transaction.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate information when creating an account and keep your credentials confidential. You
        are responsible for all activity under your account. Notify us immediately at{" "}
        <a href="mailto:legal@nonqmnexus.com">legal@nonqmnexus.com</a> if you suspect unauthorized access.
      </p>

      <h2>3. Subscriptions and Billing</h2>
      <p>
        Access to certain lender/program data is gated by membership tier (Essential, Professional, Enterprise).
        Subscriptions are currently assigned and managed by our team; where self-serve payment is enabled in the
        future, separate billing terms (including refund and cancellation policy) will be presented at checkout
        and incorporated into these Terms. You may cancel your own subscription at any time from your account
        settings; cancellation takes effect at the end of the then-current billing period unless stated otherwise.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service to originate, market, or represent loan terms to consumers as guaranteed or lender-confirmed;</li>
        <li>Attempt to access another organization&apos;s data, bypass access controls, or circumvent membership tiers;</li>
        <li>Scrape, resell, or redistribute the Service&apos;s lender/program database in bulk without our written consent;</li>
        <li>Upload content you do not have the right to upload, or that infringes a third party&apos;s rights;</li>
        <li>Use the Service in a way that violates applicable law, including mortgage-lending or consumer-protection regulations in your jurisdiction.</li>
      </ul>

      <h2>5. AI-Assisted Features</h2>
      <p>
        Some features (such as document-guideline extraction) use AI models to read lender documents and propose
        structured data. AI-extracted proposals are never treated as final — they require human admin review and
        approval before becoming part of the live lender/program database, and remain subject to the accuracy
        limitations described in Section 1.
      </p>

      <h2>6. Intellectual Property</h2>
      <p>
        We own the Service, its software, design, and our own compiled/organized presentation of lender guideline
        data. Underlying lender guidelines remain the property of their respective lenders; we reference and cite
        them for comparison purposes. You retain ownership of the scenario data you input.
      </p>

      <h2>7. Disclaimers and Limitation of Liability</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND,
        EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF ACCURACY, MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
        NON-INFRINGEMENT. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL,
        CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS ARISING FROM A LOAN DECISION, PRICING DECISION, OR
        ELIGIBILITY DETERMINATION MADE IN RELIANCE ON INFORMATION FROM THE SERVICE, INCLUDING INFORMATION THAT
        TURNS OUT TO BE OUTDATED OR INCOMPLETE RELATIVE TO A LENDER&apos;S ACTUAL CURRENT GUIDELINES.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate your access if you violate these Terms. You may stop using the Service and
        request account deletion at any time by contacting <a href="mailto:legal@nonqmnexus.com">legal@nonqmnexus.com</a>.
      </p>

      <h2>9. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be reflected by an updated &quot;Last
        updated&quot; date above; continued use of the Service after a change constitutes acceptance.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        <em>
          [Placeholder — to be finalized once the operating entity is formed: these Terms will be governed by the
          laws of the U.S. state in which the entity is domiciled, without regard to conflict-of-law principles.
          This section, and these Terms generally, should be reviewed by a licensed attorney before being relied on
          as final and binding, particularly given the mortgage-industry compliance context.]
        </em>
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:legal@nonqmnexus.com">legal@nonqmnexus.com</a>.
      </p>

      <p className="text-xs text-slate-400">
        [1] Operated under the NON-QM Nexus / NMLS Radar name pending formation of a dedicated legal entity; this
        line will be updated with the formal entity name once formed.
      </p>
    </article>
  );
}
