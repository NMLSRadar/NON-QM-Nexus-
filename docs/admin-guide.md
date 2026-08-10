# Administrator Guide

## Managing lenders and programs

Lenders and programs are org-scoped records. A program bundles: constraint configuration (doc types, purposes, occupancies, property types, states, citizenship, vesting, loan range, FICO/LTV matrix, DTI/DSCR limits, reserves, IO/PPP options) plus custom rules attached to a guideline version. Real, verified lender/program data is written and maintained via the same domain types (`programs.config` / `rules.definition`) as any sample record — the difference is only the `isSampleData` flag and human verification status, never a different code path; a full program builder UI is still designed-not-built (admin currently uses read views + one-off ingestion scripts for real data — see `docs/lender-data-import.md`).

## Guideline versioning workflow

1. Create a guideline version with label + effective date (optionally expiration).
2. Attach structured rules; link each to its source section/page.
3. Rules import in `draft` / `imported_pending_review` / `ai_extracted_pending_review` status — none of these ever evaluate.
4. Submit for review → a second person (underwriter/org admin) reviews → set `human_verified`.
5. **Publish gate:** a version cannot publish while its regression scenarios fail (see below).
6. Publishing a replacement version marks the old one `superseded`; rules past expiration deactivate automatically. Rollback = re-publishing the prior version.

## Rule testing / regression framework

Each verified program should carry a regression block in `tests/domain/matching.test.ts` (see the sample blocks) asserting: expected eligible/ineligible scenarios, expected max LTV, expected DTI/DSCR outcome, expected reserve requirement, expected warnings, expected citation. Run `npm test`. Treat a red regression as a publication blocker.

## Replacing sample data

All seeds live in `src/data/` and are flagged `isSampleData: true`, which drives the persistent "Demonstration program—not a real lender guideline." label. Replace them via the admin workflow with verified guidelines; never flip the flag without human verification of the underlying source.

## Organization administration

Org admins manage users and roles (memberships), organization settings, AI-integration authorization, lender visibility, data retention, and can read the org's audit log. Role capabilities are enforced by RLS policies (`supabase/rls-policies.sql`).

## AI Assistant admin tasks

### Lender posture profiles (flexibility)

`lender_flexibility_profiles` holds org-editable editorial metadata about
lenders: posture (`exception_based` / `moderate` / `rigid`), pricing tendency,
whether exceptions are considered and via what channel, and typical compensating
factors required. On first load the org sees the seed defaults
(`src/domain/lenderPosture.ts`); edit them to reflect this org's actual read on
each lender.

- Every row is labeled editorial and is **never** a guideline or a scoring
  input — it only powers the posture badge and exception guidance.
- **Review cadence:** keep `lastReviewedAt` current. Profiles older than 180
  days are flagged "possibly stale" and shown in the admin dashboard for review.
- Real lender names carry posture metadata only; their actual guidelines stay
  empty until a verified guideline version is loaded. A guideline question about
  a lender with no verified guidelines is answered "not in the library yet."

### Unanswered-questions queue (chatbot flywheel)

Every chatbot non-answer and every thumbs-down lands in
`chat_unanswered_questions` (org-scoped, with intent + normalized question for
dedup). Review this queue to find where the guideline or help library is missing
data, then fix the gap (load a guideline, add a help topic, or enable a
structured field). Resolving a row (`resolved_at` / `resolved_by`) marks the gap
closed. This is how the assistant's precision improves as the library grows.
