# NON-QM Nexus

An original, configurable, AI-assisted **NON-QM scenario analysis and lender-matching decision-support platform** for mortgage professionals (brokers, loan officers, account executives, processors, underwriters).

> **⚠️ Security warning:** Real borrower PII (names, SSNs, account numbers, or any consumer PII) must not be entered until the security-readiness checklist in [`docs/security.md`](docs/security.md) is signed off and the application has passed a formal security and compliance review. Scenario intake identifies a borrower only by an anonymized `borrowerReference` field — never a real name or PII.

> **⚠️ Verified-lender data only:** Lender/program/guideline data is either real, independently verified eligibility data, or explicitly flagged sample/demo data that is excluded from every lender count, comparison, and match result the app surfaces — see [`docs/sample-data-disclaimer.md`](docs/sample-data-disclaimer.md) for the quarantine model. Every result still carries the disclaimer: *Preliminary scenario analysis only — not a loan approval, commitment to lend, or guarantee of eligibility.*

## What it does

Enter a borrower/property scenario once and receive, per configured program:

- Eligible / conditional / manual-review / ineligible classification with the **controlling rules** for each result
- Deterministic calculations with full traces: **LTV, CLTV, DTI, DSCR, bank-statement income, P&L income, asset-depletion income, reserves**
- A transparent **match score** with a per-factor breakdown ("why this ranking")
- **Restructuring options** ("how to make this work") that re-run the real engine on honest structural changes
- A rule-generated **document needs list**
- Guideline citations, version labels, effective dates, and verification status on every result
- **Voice scenario intake** — dictate the full scenario; deterministic extraction + slot-filling captures the required vitals, asks for exactly what's missing, and auto-runs ranked lender matching (best option first)
- JSON export per scenario (`/api/scenarios/:id/analysis`)

## Core principle

**Deterministic software rules compute eligibility. AI only explains.**

- The calculation engine (`src/domain/calc`) uses decimal-safe arithmetic (decimal.js) — no floating-point money math.
- The rules engine (`src/domain/rules`) evaluates versioned, human-verified, nested AND/OR rules with ternary logic (missing inputs → manual review, never a silent pass).
- The AI layer (`src/lib/ai`) receives finished deterministic results as input, cannot alter them, treats document/scenario text as untrusted data, and validates structured outputs with Zod. AI-extracted rules can never activate without human review.

## Current state (live, production database)

This is a live, working application backed by a real Supabase Postgres database — not an in-memory demo.

- **Auth & multi-tenancy:** Supabase Auth (email/password), every tenant-owned table carries `organization_id`, and Postgres Row-Level Security (`supabase/rls-policies.sql` + related policy files) enforces tenant isolation at the database layer, not just in application code.
- **Real lender data with a quarantine model:** verified, real lender eligibility data lives alongside explicitly-flagged sample/demo rows (`Lender.isSampleData`); every lender count, comparison, and pricing-page claim is derived live from the same verified-only query (`getVerifiedLenderCount`) so sample data can never leak into a real count or match result.
- **Schema & migrations:** `prisma/schema.prisma` is the single source of truth for every table, shipped as committed migrations in `prisma/migrations/` (see `docs/incident-2026-07-30-schema-drift.md` for why this is now mandatory, and `HANDOFF.md`'s "Schema workflow" section for the standing rule).
- **Teams:** organization subscriptions, per-seat billing, invites with expiry/revocation, and comped (no-Stripe) org plans.
- **14-day trials:** self-serve trial campaigns with activation, extension, revocation, conversion, and automated status emails on a cron sweep.
- **AE Directory:** an account-executive contact directory with claim/verification flow; monetized placement is built but disabled (`AE_MONETIZATION_ENABLED=false`) until pricing is finalized.
- **Billing:** Stripe integration, currently in **test mode only** — real test-mode Products/Prices for all three plans plus per-seat team pricing, checkout, the customer portal, and webhook-driven subscription/seat lifecycle are all wired and verified end-to-end against the live database. Production has no live Stripe keys yet (see the launch checklist below).
- **Monitoring:** a scheduled cron re-verifies guideline citation links on a rolling basis; Sentry is wired for server-side error tracking.

## Technology stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React Server Components) + TypeScript (strict) |
| Styling | Tailwind CSS |
| Domain logic | Pure TypeScript domain layer (`src/domain`) — framework-free, fully unit-tested |
| Validation | Zod (shared client/server schemas) |
| Money math | decimal.js |
| Database | PostgreSQL via Supabase, accessed through Prisma (`prisma/schema.prisma`, `prisma/migrations/`) for schema, and the Supabase JS client for RLS-scoped reads/writes at runtime |
| Auth | Supabase Auth |
| Billing | Stripe (test mode) |
| Error tracking | Sentry |
| AI | Provider-agnostic adapter (Anthropic / OpenAI) via env config |
| Tests | Vitest — 100 test files, 2,751 tests (unit, domain, e2e, and live-database integration) |
| CI | GitHub Actions (lint, typecheck, test, build) |
| Deploy | Vercel |

## Local setup

```bash
# Node.js >= 20 required
npm install
cp .env.example .env.local   # fill in Supabase + (optionally) Stripe test-mode / AI keys
npx prisma generate
npm run dev                  # http://localhost:3000
```

A working Supabase project (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) is required — there is no in-memory/offline mode.

### Database setup

1. Create a Supabase project; put its Postgres connection string in `DATABASE_URL`.
2. `npx prisma migrate deploy` to apply every committed migration in `prisma/migrations/`.
3. Apply the SQL in `supabase/*.sql` (RLS policies, triggers/functions, one-time defaults) in the Supabase SQL editor or via `node scripts/apply-sql.mjs <file>` — see each file's header comment for ordering.
4. Any NEW schema change from here on is modeled in `prisma/schema.prisma` and shipped as a committed migration (`prisma migrate dev --create-only` to author, `prisma migrate deploy` to apply) — never a hand-run `db push --accept-data-loss` against a live database. See `HANDOFF.md`'s "Schema workflow" section.

### Environment variables

See [`.env.example`](.env.example). Never commit real secrets. API keys are server-side only and are never exposed to the browser.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm start          # run production build
npm test           # full test suite (Vitest)
REQUIRE_INTEGRATION=1 npm test   # also fails the run if every live-database integration test was silently skipped
npm run typecheck  # strict TypeScript
npm run lint       # ESLint
```

## Documentation

- [`docs/product-requirements.md`](docs/product-requirements.md) — product scope and acceptance criteria
- [`docs/architecture.md`](docs/architecture.md) — architecture, ERD, decisions, folder structure
- [`docs/database.md`](docs/database.md) — schema and multi-tenancy model
- [`docs/rules-engine.md`](docs/rules-engine.md) — rule format, operators, lifecycle
- [`docs/calculation-methods.md`](docs/calculation-methods.md) — every formula, with configuration points
- [`docs/security.md`](docs/security.md) — controls implemented + the borrower-PII readiness checklist
- [`docs/ai-safety.md`](docs/ai-safety.md) — AI boundaries and prompt-injection defenses
- [`docs/deployment.md`](docs/deployment.md) — Vercel deployment
- [`docs/admin-guide.md`](docs/admin-guide.md) / [`docs/user-guide.md`](docs/user-guide.md)
- [`docs/sample-data-disclaimer.md`](docs/sample-data-disclaimer.md) — the verified/sample lender-data quarantine model
- [`docs/team-membership.md`](docs/team-membership.md) — org subscriptions, seats, invites
- [`docs/incident-2026-07-30-schema-drift.md`](docs/incident-2026-07-30-schema-drift.md) — the schema-drift incident and why the migration workflow is now mandatory
- `HANDOFF.md` — full engineering handoff: features, standing rules, env-var inventory

## Remaining known gaps

- Voice intake's speech capture uses the browser Web Speech API (Chrome/Edge/Safari; other browsers type instead); Apple WebKit further restricts it in standalone-PWA mode. Extraction heuristics target US-English mortgage phrasing.
- Stripe billing is live in test mode only; production has no live Stripe keys yet — see the live-mode cutover checklist in the launch handoff before enabling real payments.
- AE Directory monetized placement is built but intentionally disabled (`AE_MONETIZATION_ENABLED=false`) pending final pricing.
- No compliance certification (SOC 2, GLBA, CCPA, etc.) is claimed.

## Compliance posture

This platform is an underwriting-assistance and research tool. It does **not** issue loan approvals, credit decisions, commitments to lend, or adverse-action decisions. It collects no protected-class information, and its ranking uses only configured, transparent underwriting factors. No compliance certification (SOC 2, GLBA, CCPA, etc.) is claimed. Real borrower PII must not be entered until the `docs/security.md` readiness checklist is signed off. See `docs/security.md`.
