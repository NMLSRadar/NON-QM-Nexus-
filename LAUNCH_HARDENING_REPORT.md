# NON-QM Nexus — Launch Hardening Pass — Report for Review

Repo: `NMLSRadar/NON-QM-Nexus-`, branch `main`.
5 sections, 5 commits, all pushed and deployed to production (nonqmnexus.com / Vercel).
Standing rules honored: no secrets in code/commits, schema untouched (no migrations this pass), all existing tests stayed green throughout, deployed and verified live at the end.

Commit range: `a0e3cb1` (pre-pass HEAD) → `8ba3117` (final).

```
8ba3117 Copy integrity: derive pricing lender count live from the verified-lender quarantine query; correct landing copy claiming pricing is a ranking factor
6edafac Wire SUPPORT_EMAIL into footer, terms, and privacy contact lines
eb97a94 Add SEO plumbing: robots.ts, sitemap.ts, per-page metadata (canonical, OG, noindex on auth pages) + tests
0b6aa7d Add Reply-To (SUPPORT_EMAIL) to transactional email and scripts/check-email-dns.mjs SPF/DKIM/DMARC checker
3d20f3b Add Sentry error monitoring (client/server/edge) with PII-scrubbing beforeSend and admin test-error probe
```

---

## Section 1 — Sentry error monitoring (`3d20f3b`)

**Files added:** `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/lib/sentry-privacy.ts`, `src/app/admin/system-health/page.tsx`, `src/app/api/admin/sentry-test-error/route.ts`
**Files modified:** `next.config.mjs`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/admin/layout.tsx`, `package.json`/`package-lock.json` (added `@sentry/nextjs@10.69.0`)

- Client, server, and edge Sentry inits, gated on `process.env.SENTRY_DSN` — each config is a no-op (skips `Sentry.init` entirely) when the env var is unset, so nothing breaks or attempts a network call before the DSN is configured.
- Single env var (`SENTRY_DSN`, server-side only). `next.config.mjs` derives `NEXT_PUBLIC_SENTRY_DSN` from it automatically (`env: { NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN || "" }`) so the client bundle gets it too — the owner only ever sets one variable, not two. A DSN is not a secret (it can only submit events, never read data back).
- `src/instrumentation.ts` loads the right config by `NEXT_RUNTIME` (`nodejs` vs `edge`) and exports `onRequestError = Sentry.captureRequestError` so server-side errors (route handlers, server components, server actions) are captured too, not just client exceptions.
- `error.tsx` / `global-error.tsx` both now call `Sentry.captureException(error)` in their existing `useEffect`, alongside the existing `console.error`.
- **Privacy guard** (`src/lib/sentry-privacy.ts`, shared by all three configs' `beforeSend`):
  - `event.request` is rebuilt from scratch (only `url`/`method`/a redacted headers set) — **never spread the original object** — so `request.data` (body) and `request.cookies` are dropped entirely, and `cookie`/`authorization` headers are stripped from what's left.
  - `event.user` is always set to `undefined` — no email or other identity ever leaves the process.
  - `event.extra`, `event.contexts`, and each breadcrumb's `data` are deep-scrubbed by a key-name-matching regex (`DENY_KEY_PATTERN`) that redacts anything shaped like `email|ssn|password|...|income|fico|credit|...|borrower|vitals|scenario|payload|loanamount|propertyvalue|reserves|asset|bankstatement|address` (case-insensitive), regardless of shape/nesting.
  - `sendDefaultPii: false` set explicitly in every config, as an independent second guard so the SDK never auto-attaches IP/cookies/headers before `beforeSend` even runs.
  - A comment block at the top of `sentry-privacy.ts` explains this is a compliance requirement (NON-QM Nexus intake carries real borrower financial data), not a style preference.
- **Permanent probe**: `GET /api/admin/sentry-test-error` — gated by `requirePlatformAdmin()`, then deliberately `throw`s. New `/admin/system-health` admin page (added to the admin nav) explains the setup and links to the probe; it's meant to be re-run any time to confirm delivery, not a one-off.
- `next.config.mjs` also wraps the config with `withSentryConfig` (silent build logs, `telemetry: false`, source-map upload only attempted if `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` are set — all optional, none required).

**What to check:** `src/lib/sentry-privacy.ts`'s scrub logic (especially the regex denylist — is it broad enough for this schema's actual field names?), and that `onRequestError` in `instrumentation.ts` is the correct/current Sentry Next.js API for v10.

---

## Section 2 — Email auth (`0b6aa7d`)

**Files modified:** `src/lib/email.ts`, `package.json`
**Files added:** `scripts/check-email-dns.mjs`

- `sendTransactionalEmail` (the single choke point every email in the app goes through, including `sendCommercialEmail`) now reads `process.env.SUPPORT_EMAIL` and — if set — adds `reply_to: SUPPORT_EMAIL` to the Resend API payload. Omitted (not a failure) if unset.
- New `scripts/check-email-dns.mjs` (also `npm run check:email-dns`): resolves SPF (`v=spf1` TXT at the domain root), DKIM (`resend._domainkey.<domain>` — tries CNAME first, falls back to TXT; selector overridable via `RESEND_DKIM_SELECTOR`), and DMARC (`v=DMARC1` TXT at `_dmarc.<domain>`) — prints PASS/MISSING per record plus an overall verdict. Domain defaults to `nonqmnexus.com`, overridable via `EMAIL_DOMAIN` or a CLI arg.

**Live output just now** (`node scripts/check-email-dns.mjs`):
```
Email DNS health check for domain: nonqmnexus.com
(DKIM selector: resend)

[MISSING] SPF
          Lookup failed: ENODATA
[PASS   ] DKIM
          resend._domainkey.nonqmnexus.com TXT -> p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCa3SdD3MuSrU0ny3eaG0YACNb+ooVTak49Rly+OuJakbXFTwfjBHZEI8d2w0huCWtPbbYj6R6psh3IaVPUKcgsA0tk95oe0G61yXIZ/g/+AD6pg0gjg72Qyg+qlo5B4c6sdZJ3/y6hmxfQ/1AHC0YKiZDoWSEiL3hrGvmbrEbDnQIDAQAB
[MISSING] DMARC
          Lookup failed: ENOTFOUND

Overall: ATTENTION — one or more records missing
```
DKIM is confirmed live. **SPF and DMARC TXT records are missing at the domain's DNS provider** — this is a real, pre-existing gap the script surfaced, not something this pass could fix (it's a DNS-provider change, outside the repo). Worth flagging to the owner directly.

**What to check:** whether `reply_to` is the correct Resend API field name for the SDK/API version in use (I used the documented REST field), and whether the SPF/DMARC gap needs a follow-up ticket.

---

## Section 3 — SEO plumbing (`eb97a94`)

**Files added:** `src/app/robots.ts`, `src/app/sitemap.ts`, `src/lib/seo.ts`, `tests/domain/publicPageMetadata.test.ts`, `tests/domain/seoRobotsSitemap.test.ts`
**Files modified:** `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/pricing/page.tsx`, `src/app/document-checklists/page.tsx`, `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`

- `src/lib/seo.ts`: `SITE_URL` (`NEXT_PUBLIC_APP_URL` env fallback to `https://nonqmnexus.com` — matches the convention already used across the codebase for checkout/invite links), `SITE_NAME`, `OG_IMAGE_PATH` (`/logo.png`), and `pageMetadata({title, description, path, noindex?})` — one shared builder for canonical URL + OpenGraph, so every public page stays consistent.
- `robots.ts`: allows `/`, `/pricing`, `/document-checklists`, `/terms`, `/privacy`, `/login`, `/signup`; disallows `/scenarios`, `/account`, `/admin`, `/api`, `/ae`, `/trial`; references `sitemap.xml`.
- `sitemap.ts`: the 5 public content pages (login/signup excluded — they're allowed-for-crawl but noindexed and carry no unique content), each with a `lastModified` timestamp (current build time — **not per-page git history**, worth a second look if the spec wanted per-page last-modified dates).
- Every one of the 7 public pages now exports its own `Metadata` via `pageMetadata(...)`: unique title (≤60 chars, verified programmatically), unique description (≤155 chars), canonical URL, OpenGraph title/description/url/image. `/login` and `/signup` additionally pass `noindex: true`.
- Root `layout.tsx` gained `metadataBase: new URL(SITE_URL)` and a sitewide default `openGraph` block (fallback only — every public page's own metadata overrides it).
- Tests: `seoRobotsSitemap.test.ts` asserts the exact allow/disallow/sitemap lists; `publicPageMetadata.test.ts` imports all 7 page modules directly and asserts each has a non-default title within length limits, a description within length limits, noindex on login/signup, and title uniqueness across all 7.

**Live verification just now:**
```
/robots.txt  → correct 7-path allow list, 6-path disallow list, sitemap reference
/sitemap.xml → 5 entries (/, /pricing, /document-checklists, /terms, /privacy), each with lastmod
/pricing     → <title>Pricing — NON-QM Nexus Lender Matching Plans</title>, correct <meta name="description">, correct <link rel="canonical">
/            → correct og:title/og:description/og:url/og:site_name/og:image/og:type
/login, /signup → <meta name="robots" content="noindex, nofollow"/>
```

**What to check:** whether `sitemap.ts`'s `lastModified` (current build time on every request, since the page is `force-dynamic`) is acceptable, or whether it should be a fixed/git-derived date per page instead.

---

## Section 4 — Support inbox wiring (`6edafac`)

**Files added:** `src/lib/support.ts`, `tests/domain/supportEmailWiring.test.ts`
**Files modified:** `src/app/layout.tsx`, `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`

- `src/lib/support.ts`: `export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "legal@nonqmnexus.com"` — single source of truth, falls back to the pre-existing legal inbox so nothing breaks before the owner sets the real env var.
- Footer (`layout.tsx`) now renders `Support: <a href="mailto:...">...</a>` next to the Terms/Privacy links.
- `/terms` (3 occurrences) and `/privacy` (4 occurrences) had every hardcoded `legal@nonqmnexus.com` mailto replaced with `{SUPPORT_EMAIL}` — confirmed by grep that zero hardcoded instances remain in those two files.
- **Scope note:** `src/app/pricing/teams-panel.tsx` still has one hardcoded `mailto:legal@nonqmnexus.com?subject=Team%20pricing` — deliberately left alone since the spec scoped this section to "footer, terms, privacy" only. Flagging it here in case the owner wants it swept too.
- Test (`supportEmailWiring.test.ts`) asserts the fallback and override behavior of the constant itself (doesn't scrape rendered HTML).

**Live verification:** footer shows `Support: legal@nonqmnexus.com` (the fallback — `SUPPORT_EMAIL` isn't set in Vercel yet); `/terms` and `/privacy` contact lines confirmed live with the same address.

**What to check:** confirm the `teams-panel.tsx` scope decision, and whether `legal@nonqmnexus.com` is really the intended fallback (vs. failing loudly if `SUPPORT_EMAIL` is unset).

---

## Section 5 — Copy integrity (`8ba3117`)

**Files modified:** `src/app/pricing/page.tsx`, `src/app/pricing/pricing-plans.tsx`, `src/app/public-landing.tsx`, `src/lib/repository/supabaseRepository.ts`
**Files added:** `tests/domain/landingCopyPricingClaim.test.ts`, `tests/integration/pricingLenderCountPin.test.ts`

- **Lender count**: added `export async function getVerifiedLenderCount(supabase)` to `supabaseRepository.ts` — it instantiates `SupabaseRepository` and calls `this.listLenders(PLATFORM_CATALOG_ORGANIZATION_ID, MAX_TIER_LEVEL)`, i.e. **the exact same verified-only filtering path** (`getVerifiedLenderIds`) the "quarantine" logic (`listLenders`/`getCatalogForMatching`) already uses — not a reimplementation. `pricing/page.tsx` now awaits this and passes `verifiedLenderCount` into `<PricingPlans>`. `pricing-plans.tsx`'s `TIER_FEATURES` constant became a `tierFeatures(verifiedLenderCount)` function; the tier-3 bullet interpolates the live number instead of the hardcoded `38`. Tier 1/2 counts (10, 26) were left as-is — those are fixed per-tier catalog limits, not the "total verified" claim the spec called out.
- **Landing copy**: removed "pricing and technology are only ever secondary, transparent factors, never the deciding one" from the "Guideline-first ranking" card in `public-landing.tsx`; replaced with "Every lender program is checked against the exact scenario's guideline requirements — eligibility decides the ranking. Pricing is never a factor of any kind." — consistent with the existing hero copy ("not pricing, not popularity").
- Audited all 7 public pages for other stale hardcoded lender counts or pricing-as-factor claims (`grep` sweep) — none found beyond the two fixed above. Also checked Non-QM/NON-QM casing consistency across all public pages — confirmed intentional (NON-QM = brand name, Non-QM = loan-category adjective), not an inconsistency.
- Tests:
  - `landingCopyPricingClaim.test.ts` — asserts `public-landing.tsx` never matches `/secondary/i`, never matches specific bad phrasings (`secondary, transparent factor`, `pricing (is|are|and technology are) ... factor`), and does contain the corrected "pricing is never a factor" sentence.
  - `pricingLenderCountPin.test.ts` (integration, `describe.skipIf(!hasCredentials)`, same convention as the rest of `tests/integration/`) — calls `getVerifiedLenderCount(supabase)` and independently calls `new SupabaseRepository(supabase).listLenders(PLATFORM_CATALOG_ORGANIZATION_ID, MAX_TIER_LEVEL)` directly, asserting the counts match — pins that the helper doesn't silently diverge from the underlying query in a future refactor. **Skipped in this sandbox** (no live Supabase credentials available here) — only actually exercised in an environment with `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` set.

**Live verification just now:**
```
Pricing bullet: "Full access to all 40 currently verified Non-QM lenders in the platform"
  → 40, not the stale hardcoded 38 — confirms it's genuinely live-derived
Landing card:   "Pricing is never a factor of any kind" present
                "secondary, transparent factor" absent
```

**What to check:** the integration test (`pricingLenderCountPin.test.ts`) has never actually run against live data in this sandbox — worth running it for real once credentials are available, to make sure it passes against the actual production dataset (not just that the code compiles).

---

## Overall verification

- `tsc --noEmit`: clean after every commit.
- `npx vitest run` (full suite, run just now on the final commit): **63 test files passed, 35 skipped (98 total); 2616 tests passed, 130 skipped (2746 total)**. Skipped tests are exclusively `tests/integration/*` files gated by `describe.skipIf(!hasCredentials)` — same as before this pass (no new skips introduced beyond the one new integration test above, and no test that previously ran now skips).
- Deploy: pushed to `main` (`8ba3117`), Vercel auto-deploy confirmed live via `GET /api/version` returning the pushed commit SHA.
- Two env vars await your values in Vercel: **`SENTRY_DSN`** and **`SUPPORT_EMAIL`** (both degrade cleanly — nothing is broken while unset, they just show fallback behavior as documented above).

## Suggested things for Claude Code to double-check
1. `src/lib/sentry-privacy.ts`'s `DENY_KEY_PATTERN` regex — confirm it covers every actual sensitive field name used in this schema's scenario/vitals payloads (I inferred field names from context, not an exhaustive schema read).
2. `Sentry.captureRequestError` / `onRequestError` export shape in `src/instrumentation.ts` — confirm this matches `@sentry/nextjs@10.69.0`'s current documented API (I used the SDK's own type-checked exports, but a second look at the current docs wouldn't hurt).
3. `scripts/check-email-dns.mjs` surfaced a real gap: **SPF and DMARC TXT records are missing** for `nonqmnexus.com` at the DNS provider — this needs a DNS change outside the repo, flagging it here so it isn't missed.
4. `pricing/teams-panel.tsx` still has one hardcoded `legal@nonqmnexus.com` mailto — intentionally out of this pass's scope (spec said footer/terms/privacy only); confirm whether it should be swept too.
5. `sitemap.ts`'s `lastModified` is the current request time (page is `force-dynamic`), not a fixed/content-derived date — confirm that's acceptable for SEO purposes.
6. `tests/integration/pricingLenderCountPin.test.ts` has only been typechecked/compiled, never run against live data (no DB credentials in this sandbox) — run it for real once you have access.
