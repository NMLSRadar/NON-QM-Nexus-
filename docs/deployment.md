# Deployment

## Vercel (recommended for the frontend)

1. Import the repository into Vercel.
2. Framework preset: Next.js. Build command `npm run build`, install `npm ci`.
3. Set environment variables from `.env.example` (Production + Preview). Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SHARED_LINK_SECRET`) must **not** be prefixed `NEXT_PUBLIC_`.
4. Deploy. Verify `/api/health` returns `{"status":"ok"}`.

## Supabase (production data path)

1. Create a project; copy the Postgres connection string to `DATABASE_URL`.
2. `npx prisma migrate deploy`
3. Apply `supabase/rls-policies.sql` via the SQL editor.
4. Configure Auth (email + MFA policy) and Storage buckets (private, signed URLs).

## Docker (self-hosting)

```bash
docker build -t non-qm-navigator .
docker run -p 3000:3000 --env-file .env.local non-qm-navigator
```

## CI

`.github/workflows/ci.yml` runs lint → typecheck → tests → build on every push and PR. Keep it green; the branch is not deployable otherwise.

## Post-deploy checklist

- [ ] `/api/health` responds
- [ ] Demo-data banner visible (until real guidelines are loaded)
- [ ] Error monitoring (Sentry DSN) wired and scrubbing PII
- [ ] Complete `docs/security.md` production checklist before real borrower data
