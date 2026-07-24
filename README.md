# NON-QM Nexus

An original, configurable, AI-assisted **NON-QM scenario analysis and lender-matching decision-support platform** for mortgage professionals (brokers, loan officers, account executives, processors, underwriters).

> **⚠️ Security warning:** This repository is an MVP/demonstration build. **Do not enter real borrower data** (names, SSNs, account numbers, or any consumer PII) until the production-readiness work in [`docs/security.md`](docs/security.md) is complete and the application has passed a formal security and compliance review.

> **⚠️ Sample data:** Every lender, program, guideline, and rule in this build is **fictional demonstration data** — see [`docs/sample-data-disclaimer.md`](docs/sample-data-disclaimer.md). Nothing here represents a real lender's guidelines.

## What it does

Enter a borrower/property scenario once and receive, per configured program:

- Eligible / conditional / manual-review / ineligible classification with the **controlling rules** for each result
- Deterministic calculations with full traces: **LTV, CLTV, DTI, DSCR, bank-statement income, P&L income, asset-depletion income, reserves**
- A transparent **match score** with a per-factor breakdown ("why this ranking")
- **Restructuring options** ("how to make this work") that re-run the real engine on honest structural changes
- A rule-generated **document needs list**
- Guideline citations, version labels, effective dates, and verification status on every result
- **Voice scenario intake** — dictate the full scenario; deterministic extraction + slot-filling captures 8 vitals, asks for exactly what's missing, and auto-runs ranked lender matching (best option first)
- JSON export per scenario (`/api/scenarios/:id/analysis`)

Every result carries the disclaimer: *Preliminary scenario analysis only — not a loan approval, commitment to lend, or guarantee of eligibility.*

## Core principle

**Deterministic software rules compute eligibility. AI only explains.**

- The calculation engine (`src/domain/calc`) uses decimal-safe arithmetic (decimal.js) — no floating-point money math.
- The rules engine (`src/domain/rules`) evaluates versioned, human-verified, nested AND/OR rules with ternary logic (missing inputs → manual review, never a silent pass).
- The AI layer (`src/lib/ai`) receives finished deterministic results as input, cannot alter them, treats document/scenario text as untrusted data, and validates structured outputs with Zod. AI-extracted rules can never activate without human review.

## Technology stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React Server Components) + TypeScript (strict) |
| Styling | Tailwind CSS |
| Domain logic | Pure TypeScript domain layer (`src/domain`) — framework-free, fully unit-tested |
| Validation | Zod (shared client/server schemas) |
| Money math | decimal.js |
| Database (production path) | PostgreSQL via Supabase + Prisma (`prisma/schema.prisma`), RLS policies (`supabase/rls-policies.sql`) |
| Auth (production path) | Supabase Auth |
| AI | Provider-agnostic adapter (Anthropic / OpenAI) via env config |
| Tests | Vitest (68 domain tests) |
| CI | GitHub Actions (lint, typecheck, test, build) |
| Deploy | Vercel-compatible; Dockerfile for self-hosting |

The demo app runs on an in-memory repository seeded with sample data so the entire workflow is exercisable with zero external services. The `Repository` interface in `src/lib/store.ts` is the swap point for the Prisma/Supabase implementation.

## Local setup

```bash
# Node.js >= 20 required
npm install
cp .env.example .env.local   # optional for the demo; required for AI/Supabase features
npm run dev                  # http://localhost:3000
```

No database is needed for the demo — sample data loads automatically and is clearly labeled.

### Database setup (production path)

1. Create a Supabase project; put its Postgres URL in `DATABASE_URL`.
2. `npx prisma migrate dev` to create the schema.
3. Apply `supabase/rls-policies.sql` in the Supabase SQL editor.
4. Implement/enable the Prisma repository behind `Repository` (see `docs/architecture.md`).

### Environment variables

See [`.env.example`](.env.example). Never commit real secrets. API keys are server-side only and are never exposed to the browser.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm start          # run production build
npm test           # unit + regression tests (Vitest)
npm run typecheck  # strict TypeScript
npm run lint       # ESLint
```

## Documentation

- [`docs/product-requirements.md`](docs/product-requirements.md) — product scope and acceptance criteria
- [`docs/architecture.md`](docs/architecture.md) — architecture, ERD, decisions, folder structure
- [`docs/database.md`](docs/database.md) — schema and multi-tenancy model
- [`docs/rules-engine.md`](docs/rules-engine.md) — rule format, operators, lifecycle
- [`docs/calculation-methods.md`](docs/calculation-methods.md) — every formula, with configuration points
- [`docs/security.md`](docs/security.md) — controls implemented + production-readiness checklist
- [`docs/ai-safety.md`](docs/ai-safety.md) — AI boundaries and prompt-injection defenses
- [`docs/deployment.md`](docs/deployment.md) — Vercel / Docker deployment
- [`docs/admin-guide.md`](docs/admin-guide.md) / [`docs/user-guide.md`](docs/user-guide.md)
- [`docs/sample-data-disclaimer.md`](docs/sample-data-disclaimer.md)

## Known MVP limitations

- Authentication, organizations, and roles are modeled (Prisma schema + RLS SQL as design documents) but the demo runs as a single demo organization without login; Prisma tooling itself is not wired (no prisma dependency or migrations), so persistence is in-memory.
- Voice intake's speech capture uses the browser Web Speech API (Chrome/Edge/Safari; other browsers type instead); extraction heuristics target US-English mortgage phrasing. The optional AI-assisted extractor (`src/lib/ai/extractScenario.ts`) is off until a provider is configured, and its output always requires user confirmation.
- Document upload/extraction, PDF report rendering, shared links, and the admin program builder are designed (schema, interfaces, docs) but not yet wired into the UI.
- The AI explanation layer is implemented behind adapters but disabled until API keys and org authorization are configured.
- No pricing integration — ranking never implies pricing.
- Sample guidelines are fictional; replace via the guideline workflow before any real use.

## Compliance posture

This platform is an underwriting-assistance and research tool. It does **not** issue loan approvals, credit decisions, commitments to lend, or adverse-action decisions. It collects no protected-class information, and its ranking uses only configured, transparent underwriting factors. No compliance certification (SOC 2, GLBA, CCPA, etc.) is claimed. See `docs/security.md`.
