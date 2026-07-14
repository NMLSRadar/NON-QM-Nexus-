# Contributing

## Ground rules

- **Strict TypeScript; no `any`.** CI enforces `tsc --noEmit` and ESLint.
- **Business logic lives in `src/domain`** — pure, framework-free, decimal-safe. React components stay presentational; server actions validate and delegate.
- Never trust client-supplied organization IDs; tenant scope always comes from the server session.
- Validate every server input with the shared Zod schemas.
- No mock data outside development/test; all fictional records must be flagged `isSampleData` and labeled in the UI.
- AI prompts live in version-controlled source; provider-specific code stays behind `AiProvider`.
- Don't swallow exceptions; don't expose stack traces to users; error messages must not leak secrets.

## Workflow

```bash
npm install
npm run dev
# before pushing:
npm run lint && npm run typecheck && npm test && npm run build
```

## Tests

- Every calculation change needs unit tests (`tests/domain/calc.test.ts`).
- Every rules-engine change needs operator/ternary coverage (`tests/domain/rules.test.ts`).
- New or changed programs need a scenario regression block (`tests/domain/matching.test.ts`) — expected statuses, controlling rules, and restructuring unlocks. A guideline version must not publish with red regressions.

## Commit style

Descriptive, imperative subject lines scoped to the change (e.g. `rules: add between-operator bounds check`). Keep migrations reversible where practical.
