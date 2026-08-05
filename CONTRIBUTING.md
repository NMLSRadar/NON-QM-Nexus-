# Contributing

## Ground rules

- **Strict TypeScript; no `any`.** CI enforces `tsc --noEmit` and ESLint.
- **Business logic lives in `src/domain`** — pure, framework-free, decimal-safe. React components stay presentational; server actions validate and delegate.
- Never trust client-supplied organization IDs; tenant scope always comes from the server session.
- Validate every server input with the shared Zod schemas.
- No mock data outside development/test; all fictional records must be flagged `isSampleData` and labeled in the UI.
- AI prompts live in version-controlled source; provider-specific code stays behind `AiProvider`.
- Don't swallow exceptions; don't expose stack traces to users; error messages must not leak secrets.
- **Schema changes are modeled in `prisma/schema.prisma` and shipped as a committed migration in `prisma/migrations/`** (`prisma migrate dev --create-only` to author, `prisma migrate deploy` to apply) — never a raw hand-run `db push --accept-data-loss` against a live database, and never raw SQL for table/column definitions (`supabase/*.sql` stays for policies, triggers, functions, and seeds only). One schema-writer at a time — confirm no other session is mutating the database before any schema step. See `docs/incident-2026-07-30-schema-drift.md` for why, and `HANDOFF.md`'s "Schema workflow" section for the full rule.
- **Billing stays in Stripe TEST MODE** until the live-mode cutover checklist in `HANDOFF.md` is executed by the owner — never commit or hardcode live Stripe keys.
- Don't commit ad-hoc report/analysis files to the repo (incident write-ups, review reports, one-off audits) — those are delivered to the owner as chat text/files, not repo artifacts. Durable process/architecture documentation belongs in `docs/`.

## Workflow

```bash
npm install
npm run dev
# before pushing:
npm run lint && npm run typecheck && npm test && npm run build
```

## Tests

Vitest, three layers:
- `tests/domain/*` — pure unit tests for the calculation engine, rules engine, and scenario matching (no I/O).
- `tests/e2e/*` — component/interaction tests (voice intake, admin flows, billing UI states).
- `tests/integration/*` — run against the LIVE Supabase database (self-skip if `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` aren't set). Run `REQUIRE_INTEGRATION=1 npm test` to fail the whole run if every integration test was silently skipped.

- Every calculation change needs unit tests (`tests/domain/calc.test.ts`).
- Every rules-engine change needs operator/ternary coverage (`tests/domain/rules.test.ts`).
- New or changed programs need a scenario regression block (`tests/domain/matching.test.ts`) — expected statuses, controlling rules, and restructuring unlocks. A guideline version must not publish with red regressions.

## Commit style

Descriptive, imperative subject lines scoped to the change (e.g. `rules: add between-operator bounds check`). Keep migrations reversible where practical.
