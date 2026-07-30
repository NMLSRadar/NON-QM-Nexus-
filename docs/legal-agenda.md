# Legal Agenda — items requiring attorney/owner sign-off

This is a running list of legal items that need real (non-AI) review
before a feature goes fully live. Items are added when a feature that
needs review ships; they are removed once the owner confirms the review
happened.

## AE Directory, Sponsored Placement & Outreach System (added 2026-07-30)

1. **RESPA Section 8 attorney review of the flat-fee advertising model —
   REQUIRED before `AE_MONETIZATION_ENABLED` is ever flipped to `true`.**
   The current design is intentionally conservative (a single flat
   monthly Stripe subscription for advertising placement only; zero
   pricing tied to leads, clicks, referrals, or closed loans; sponsorship
   has no effect on lender/program matching, eligibility, or ranking —
   enforced in code by `tests/domain/aeSponsorshipIsolation.test.ts`,
   which fails the build if the matching engine ever imports anything
   from the AE system). A real estate/mortgage compliance attorney should
   still confirm this flat-fee-for-advertising-placement structure is
   compliant in every state the platform operates in before real money
   changes hands — state-level mini-RESPA / anti-inducement statutes can
   be stricter than the federal baseline.
2. **CAN-SPAM postal-address confirmation.** `OWNER_POSTAL_ADDRESS` is
   currently set from an address the owner provided directly in chat
   (13598 Herron Street, Sylmar, CA 91342) and is rendered in the footer
   of every commercial email (`claimInviteEmail`, `statsPitchEmail` in
   `src/lib/emailTemplates.ts`). Confirm this is the correct, current
   business address to use for CAN-SPAM purposes (a registered business
   address, PO box, or commercial mail-receiving agency address are all
   acceptable under CAN-SPAM) before the outreach system is used at any
   meaningful volume.
3. **Outreach contact sourcing.** `outreach_contacts.source_note`
   captures where each prospect's contact information came from — before
   scaling outreach volume, confirm with counsel that the sourcing
   methods actually used (lender's own public wholesale materials,
   self-submitted claims, and any third-party business-contact research)
   are appropriate for unsolicited commercial email under CAN-SPAM (which
   generally permits it, unlike GDPR/CASL-style opt-in regimes — relevant
   if outreach ever extends to non-U.S. AEs).

## Prior outstanding item (unrelated to this feature)

- LLC formation — referenced by the Terms of Service governing-law
  placeholder; update that section once formed (name + state). See
  `HANDOFF.md`.
