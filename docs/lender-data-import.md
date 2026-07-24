# Lender/program data import (admin-only)

Two ways to get real lender guideline data into the catalog, both gated to
`platform_admin` accounts only (see docs/membership.md for that flag).

## 1. CSV bulk import (`/admin/lenders`)

For quickly entering structured program data a human has already read off
a guideline PDF. Upload a CSV (template downloadable from that page,
`public/lender-program-import-template.csv`) — one row per program. The
lender is identified by name: the first row using a given name creates
the lender (with that row's `lender_tier`); every later row with the same
name (case-insensitive) reuses it.

Flow: choose file → **Validate** (server-side re-parses and validates
every row, shows a per-row error report and a preview of valid rows,
nothing is written yet) → **Import N valid rows** (creates lenders/
programs/guideline_versions). Guideline versions land as
`imported_pending_review` — verify against the source before relying on
them.

Validation (`src/domain/validation/programImportSchema.ts`) rejects: any
enum value outside the fixed lists (income doc types, loan purposes,
occupancies, property types, citizenship, vesting), non-numeric amounts,
FICO outside 300–850, LTV outside 0–100, and inconsistent `lender_tier`
values for the same lender name across rows.

## 2. PDF upload + AI extraction (`/admin/documents`)

For the actual lender-sent guideline/matrix PDFs. Admin uploads a PDF
against an existing or new lender; it's stored in the private
`lender-documents` Supabase Storage bucket (admin-only RLS — regular
users, even in the same organization, cannot read or list it). The
configured AI provider (`src/lib/ai/provider.ts`, `completeWithDocument()`)
reads the PDF directly (native PDF input, no separate text-extraction
step) and proposes an array of programs, strictly validated against
`src/domain/validation/programExtractionSchema.ts` — any field outside
the fixed enums, or that isn't finite/well-formed, is rejected outright
rather than silently accepted.

**Nothing goes live automatically.** Every proposed program sits in
`document_extractions.fields` (JSON) until an admin reviews it in the
"Pending review" list on `/admin/documents` — shown as an editable JSON
block per program — and either:
- **Approve & publish**: re-validates the (possibly edited) JSON, creates
  a real `Program` + `guideline_version` marked `human_verified` (an
  admin looked at it), or
- **Reject**: discards that one proposed program, no record created.

This mirrors the project's standing rule (docs/architecture.md,
CONTRIBUTING.md): AI-extracted content never auto-activates.

## Known limitation: single-organization catalog

Both import paths write into the **admin's own organization** — the
catalog is still seeded per-organization (see docs/membership.md), so
imported real data does not automatically become visible to users in
other organizations (each of whom has their own separate, self-seeded
demo catalog). Sharing one real catalog across every organization would
need a deeper architecture change, not covered by this import feature.
