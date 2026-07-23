# FINALIZE — From In-Memory Demo to Deployed (Supabase + Vercel)

**Operator:** a coding agent (e.g. Claude Code) or developer on a machine with
network access, Node ≥ 20, and a Supabase account. The environment that
authored this repo had no network egress, so nothing below has been executed —
this runbook is the precise plan, written against the repo's actual seams.
A paste-ready agent kickoff prompt is in Appendix A.

**What "finalize" means here:** the app currently runs entirely on an
in-memory repository (`src/lib/store.ts`) with a hardcoded demo org and no
authentication. `prisma/schema.prisma` and `supabase/rls-policies.sql` are the
*designs* for the real thing. This runbook builds the integration layer they
describe. It is the largest remaining milestone (product spec §25 items 1, 2,
13–16, 20).

## Ground rules

- Secrets live in `.env.local` and CI/Vercel secret stores only — never in
  commits, chats, or logs. `SUPABASE_SERVICE_ROLE_KEY` is server-only and
  bypasses RLS (the RLS file documents this): the server must always scope
  queries by the session's organization and must never accept a
  client-supplied organization ID.
- The 103 existing tests are the safety net. They must pass before Phase 1 and
  stay green through every phase. `InMemoryRepository` is kept forever as the
  test double — do not delete it when the database repository lands.
- Offline verification used shims for vitest/decimal.js/zod; the Phase 0 run
  with real dependencies is the authoritative confirmation.

## Phase 0 — Baseline with real dependencies (gate)

```bash
npm ci
npx vitest run          # expect 103 passing (calc 29, rules 17, matching 22, voice 19, scenarios 16)
npm run lint
npm run typecheck
npm run build
npm run seed:check      # prints the pinned 12-scenario status table
```

Fix any real-dependency drift before proceeding. The React surfaces (including
`/scenarios/voice`) were authored but never rendered — run `npm run dev`, click
through every page, and fix first-render nits now.

## Phase 1 — Supabase project and environment

Create a dev Supabase project. Copy `.env.example` → `.env.local` and fill:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server-only), `DATABASE_URL` (use the *direct*
connection string for migrations; the pooled string for the app if needed).
Other keys (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, `AI_PROVIDER`) only when
enabling AI features.

## Phase 2 — Real database from the existing design

```bash
npm i -D prisma && npm i @prisma/client
npx prisma migrate dev --name init      # schema.prisma is the source of truth
psql "$DATABASE_URL" -f supabase/rls-policies.sql
```

Alignment checks before applying the RLS file: confirm the generated table
names match what the policies reference (notably `memberships`,
`organization_id` columns, `deleted_at` soft-delete columns, and the
`user_org_ids()` helper's assumptions), and that **every tenant-owned table**
appears in the policy file. Adjust either side deliberately; record the
decision in `docs/database.md`.

## Phase 3 — Authentication (spec §25 #1–2)

```bash
npm i @supabase/supabase-js @supabase/ssr
```

Build: browser + server Supabase clients (`src/lib/supabase/`), session
middleware, `/login` and `/signup` pages, and a signup completion step that
creates the `users` row, an organization, and an active membership (a
transactional server action is simplest; a DB trigger is the alternative —
skeleton in Appendix B). Then replace the stub: `getCurrentOrganizationId()`
in `src/lib/store.ts` currently returns `"org_demo"` — move it to
`src/lib/auth/session.ts`, resolve it from the Supabase session → membership
lookup, and re-export from `store.ts` so call sites don't churn. Unauthed
users get redirected to `/login`.

## Phase 4 — Database-backed repository

Implement `PrismaRepository` satisfying the existing seam (this exact
interface, `src/lib/store.ts`):

```ts
interface Repository {
  getCatalog(organizationId: string): Promise<ProgramCatalog>;
  listScenarios(organizationId: string): Promise<Scenario[]>;
  getScenario(organizationId: string, id: string): Promise<Scenario | null>;
  saveScenario(scenario: Scenario): Promise<Scenario>;
  listLenders(organizationId: string): Promise<Lender[]>;
  listPrograms(organizationId: string): Promise<Program[]>;
  listRules(organizationId: string): Promise<Rule[]>;
}
```

`getRepository()` selects by environment: `DATABASE_URL` present → Prisma;
otherwise in-memory (tests, offline demo). Every Prisma query filters by
`organizationId` even though RLS also enforces it — defense in depth, and
required anyway because service-role connections bypass RLS. Add
`src/lib/db/seed.ts` (`npm run db:seed`) loading `src/data/sample*` for the
demo org, guarded to refuse in production.

## Phase 5 — Cross-tenant proof (spec §25 #15–16)

Create two orgs with one user each; assert cross-access fails at three
levels: repository (Prisma returns nothing), route (scenario page 404s), and
raw RLS (anon-key client with user A's JWT selecting org B rows gets zero).
Add these as automated tests — this is the spec's own acceptance bar, not
optional hardening.

## Phase 6 — Deploy (spec §25 #20)

Vercel project with the same env vars (service-role key marked
server/encrypted); production Supabase project; `npx prisma migrate deploy` +
RLS file against it; smoke the deployed app including `/scenarios/voice`
(microphone requires HTTPS — Vercel provides it). Update
`docs/deployment.md` with what actually happened, not what was planned.

## Phase 7 — Billing & discounts (NEW scope, added after the original spec)

Monetization is not in the product spec and nothing for it exists in the
codebase. Build only after Phases 1–4: billing attaches to real, persisted
organizations behind real auth.

- **Processor:** Stripe (Checkout + Billing). Card data never touches this
  app — PCI scope stays with Stripe. (Paddle or Lemon Squeezy are
  merchant-of-record alternatives if you'd rather not handle sales tax.)
- **Model:** subscription per organization. Add `stripe_customer_id` (and
  optionally `stripe_subscription_id`) to organizations, plus an entitlement
  record: plan, status, current_period_end, source (`stripe` | `comped`).
- **Webhooks are the single writer of entitlement state:** a route handler
  verifying `STRIPE_WEBHOOK_SECRET`, handling `checkout.session.completed`,
  `customer.subscription.updated` / `.deleted`, and `invoice.payment_failed`.
- **Gating:** a server-side check that the session's organization holds an
  active entitlement (demo/sample-data mode may remain free).
- **Discounts — the 25% / 50% cases:** Stripe Coupons + Promotion Codes
  (percent_off, expiry, max redemptions, per-customer limits), granted from an
  admin screen or shared as codes.
- **100% off / special circumstances:** prefer a `comped` entitlement set by a
  platform admin over $0 invoices — no card required, instantly reversible —
  and write who/why to audit_logs (spec §19's audit ethos applies). Stripe
  100%-off coupons also work where invoice history is desired.
- **Controls:** only privileged roles can grant discounts or comps; every
  grant and revocation is an audit event.
- **Env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (placeholders in `.env.example`).
- **Tests:** webhook signature rejection, entitlement gating on and off,
  comped access, discount application.

Decision needed from the product owner before wiring: the pricing model —
flat per organization, per seat, or usage-based (e.g. scenarios analyzed per
month) — since it determines the Stripe objects to create.

## Definition of done

All 20 acceptance criteria in `docs/product-spec` §25 terms: the open items
entering this runbook are **1, 2** (auth/orgs/roles), **13, 14** (admin
builders + rule testing UI), **15, 16** (document privacy + RLS proof),
**20** (deployed per docs), and **12** is partial (report exists as text/HTML;
PDF generation still open). Items 3–11 and 17–19 are done and pinned by the
103-test suite — keep them green. Billing (Phase 7) sits outside §25 as added
scope: done when checkout, webhook-driven entitlements, discount codes, and
comped access all pass their tests.

---

## Appendix A — Claude Code kickoff prompt

> Read FINALIZE.md at the repo root and execute it phase by phase, in order.
> Do not skip Phase 0; do not proceed past a failing gate. Keep all 103
> existing tests green after every phase, and add the Phase 5 cross-tenant
> tests to the suite. Ask me for Supabase credentials when you reach Phase 1 —
> I will put them in .env.local myself; never echo them. When a design
> decision is needed (schema vs RLS naming, trigger vs server action), state
> the tradeoff in one paragraph, pick one, and record it in docs/. Commit at
> the end of each phase with a descriptive message.

## Appendix B — Reference: signup trigger skeleton (adapt names first)

From the sibling `non-qm-navigator` handoff package; column/table names must
be adapted to this repo's generated schema before use. The server-action
approach in Phase 3 is preferred; this exists for teams that want the DB to
own it.

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  insert into users (id, email) values (new.id, new.email);
  insert into organizations (name) values (coalesce(new.raw_user_meta_data->>'org_name', 'My Organization'))
    returning id into new_org;
  insert into memberships (user_id, organization_id, role, status)
    values (new.id, new_org, 'org_admin', 'active');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```
