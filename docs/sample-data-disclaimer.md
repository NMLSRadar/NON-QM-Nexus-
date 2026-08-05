# Sample-Data Disclaimer & Quarantine Model

**As of 2026-08-05, this platform runs on real, independently-verified NON-QM lender eligibility data** — currently 42 real lenders' programs, with real guideline citations, version labels, effective dates, and verification status. This is no longer a fictional-only demo build.

## The quarantine model

Any lender/program/guideline record that is placeholder, invented, or otherwise not yet human-verified is explicitly flagged `isSampleData: true` on the `Lender` row (`prisma/schema.prisma`), and:

- The UI displays a persistent label on any such record: *"Demonstration program—not a real lender guideline."*
- **Every lender count, comparison, and match result the app surfaces excludes sample/demo rows** — the same verified-only query (`getVerifiedLenderIds` / `getVerifiedLenderCount` in `src/lib/repository/supabaseRepository.ts`) is reused everywhere a lender count or catalog is shown (pricing page, matching engine, admin dashboards), so there is exactly one definition of "verified" anywhere in the app and sample data can never leak into a real count or a real borrower-facing match result.
- Sample scenarios (when used for demos/development/testing) use anonymized fictional borrower references (e.g. `B-1001…`) and contain no real personal information — consistent with the platform-wide rule that borrower identity in intake is always an anonymized `borrowerReference`, never a real name or PII (see `docs/security.md`).

## What "verified" means

A lender record is verified when its guidelines have been sourced from the lender's own published rate sheets / guideline matrices / underwriting guides, entered with citation links and effective dates, and reviewed by a human before being marked non-sample. Administrators add/replace verified guidelines through the guideline-versioning workflow (`docs/admin-guide.md`); analysis run against a still-flagged sample record is suitable only for demos, development, and testing, and is visibly labeled as such.

Every result, real or sample, still carries the platform-wide disclaimer: *Preliminary scenario analysis only — not a loan approval, commitment to lend, or guarantee of eligibility.*
