# Audit: admin-only upload access (CSV import + PDF upload)

**Date:** 2026-07-24
**Result:** One real gap found and fixed, one adjacent gap found and fixed,
everything else confirmed correctly locked down. Verified empirically at
every layer, not just by code review.

## What was audited

Every layer between a request and the database for the two upload
features (`/admin/lenders` CSV import, `/admin/documents` PDF upload +
AI extraction):

1. Middleware (`src/middleware.ts`)
2. Route/layout guards (`src/app/admin/layout.tsx`, every page under `/admin/*`)
3. Server actions (every action file under `src/app/admin/lenders/`, `src/app/admin/documents/`)
4. UI navigation (header "Admin" link, admin sub-nav)
5. Database RLS policies — the layer that matters most, since it's the
   last line of defense if any of the above were ever bypassed

## Finding 1 (real gap, fixed): catalog writes were not actually admin-only

The original `lenders_write` / `programs_write` / `guideline_versions_write`
/ `rules_write` RLS policies (written before `platform_admin` existed)
granted write access to any user with org-level role `underwriter` or
`org_admin` **in their own organization**. The onboarding trigger
auto-grants every new sign-up `org_admin` of their own personal
organization. Net effect: **every regular user could insert/update/delete
lenders, programs, guideline_versions, and rules directly via the
Supabase client** — completely bypassing the admin-only UI and server
actions built for this feature.

Confirmed empirically before fixing: a freshly signed-up test account
(no admin flag) successfully inserted a row into `lenders` with a single
API call.

**Fix:** `supabase/lender-catalog-write-lockdown.sql` — all four write
policies now require `public.is_platform_admin()` instead.

**Side effect this required fixing:** the demo-catalog self-seeding that
runs on a new organization's first `getCatalog()` call
(`src/lib/repository/supabaseRepository.ts`) used to write through the
requesting user's own (now-blocked) client. It now runs through a
service-role client (`src/lib/repository/serviceRoleClient.ts`) instead —
a system operation, not a user action, scoped to the organization id the
server already resolved from the caller's own session (never
client-supplied). Verified this still works for a brand-new regular user
(5 lenders / 11 programs / 30 rules seeded correctly), and that it does
**not** reopen the write gap (the seeding code is the only caller of that
service-role path, not something a request can reach directly).

## Finding 2 (adjacent, not a security hole, fixed): admin-wide reads were never actually granted

`/admin/lenders` and `/admin/documents` both present themselves as
showing lenders "across every organization," but `lenders_select` /
`programs_select` / etc. only ever granted a user their own
organization's rows — there was no platform-admin-wide override. This
never let a non-admin see more than they should (it under-granted, never
over-granted), but it meant the admin catalog pages would have silently
only shown the admin's own organization's data once more than one
organization had real lenders in it.

**Fix:** `supabase/lender-catalog-admin-read.sql` — added
`or public.is_platform_admin()` to the four select policies. Verified: an
admin can now read a lender that belongs to a completely different
organization; a regular user still cannot.

## Confirmed correct (no changes needed)

- **Middleware**: `/admin` is in `PROTECTED_PREFIXES` — an unauthenticated
  request is redirected to `/login` before ever reaching a page.
- **Layout guard**: `src/app/admin/layout.tsx` calls `requirePlatformAdmin()`,
  which every route under `/admin/*` inherits (Next.js layout nesting) —
  a signed-in non-admin is redirected to `/`. Verified live in the browser
  earlier in this project (non-admin hitting `/admin` → silently
  redirected; admin → real content rendered).
- **Every server action** under `src/app/admin/lenders/` and
  `src/app/admin/documents/` calls `requirePlatformAdmin()` as its first
  line — confirmed by search, no exceptions.
- **UI navigation**: the "Admin" header link
  (`src/components/admin-nav-link.tsx`) only renders when
  `platform_admin` is true; searched the entire `src/app` tree for any
  `type="file"` upload input outside `/admin/lenders` and
  `/admin/documents` — none exist.
- **Storage bucket** (`lender-documents`): RLS restricts
  insert/select/delete to `public.is_platform_admin()`. Verified: a
  regular authenticated user AND an anonymous (unauthenticated) request
  both fail to upload; the admin succeeds.
- **Lender-linked `documents` / `document_extractions` rows**: RLS
  restricts these specifically (distinct from scenario-attached borrower
  documents, which stay org-member-readable) to platform admins only —
  verified a regular user in the SAME organization as the admin still
  cannot see them.

## Test coverage added

`tests/integration/adminOnlyUploadAudit.test.ts` — 8 new tests against
the real database, as a standing regression guard: a regular `org_admin`
user cannot insert into `lenders` / `programs` / `guideline_versions` /
`rules`; neither can an anonymous request; a regular user cannot upload
to the `lender-documents` bucket (neither can anonymous); and self-seeding
still works via the service-role path. Combined with the fixes above, the
full suite is 139 tests, all passing.
