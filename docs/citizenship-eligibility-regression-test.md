# Regression test: no empty `citizenshipEligible` arrays

**File:** `tests/integration/noEmptyCitizenshipEligible.test.ts`
**Added:** 2026-07-29, after a real production bug (see "Background" below).

## What it checks

The test connects directly to the live Supabase catalog (using the
service-role key, bypassing tier/verification filtering) and asserts one
invariant across the **entire** platform catalog:

> No active, non-sample `Program` row may have an empty
> `citizenshipEligible` array.

Every real lender program is eligible for at least one citizenship class
(U.S. citizen, permanent resident, non-permanent resident, ITIN, or
foreign national) — an empty array is never a legitimate guideline state.
It only ever happens when a bulk edit accidentally strips the field, so
the test treats it as a hard failure and prints every offending
lender/program name and its row ID.

A second, narrower check in the same file pins down the specific bug that
motivated this test: it confirms `LoanStream Mortgage` and `LendSure
Mortgage Corp.` are recognized as two distinct real lenders, and that
LoanStream's own `ITIN` program still carries `itin` in its
`citizenshipEligible` array.

## How often it runs

This is a **`tests/integration/*`** test, run as part of the normal
Vitest suite (`npm test`) — it is not on a separate schedule or cron.
Concretely:

- **Locally / in this working session** — every time `npm test` (or a
  targeted `npx vitest run tests/integration/...`) is run with real
  Supabase credentials available (`.env.local` present), this test
  executes against the live database.
- **In GitHub Actions CI** (`.github/workflows/ci.yml`) — the same `npm
  test` step runs on every push to any branch and every pull request.
  However, CI has no `SUPABASE_SERVICE_ROLE_KEY` configured today, so the
  test's `describe.skipIf(!hasCredentials)` guard causes it to be
  **skipped** there rather than failing — it does not yet run
  automatically in CI. (See "Gap / follow-up" below.)

There is no dedicated recurring schedule (e.g. an hourly cron) — it is a
pass/fail gate evaluated whenever the test suite runs, not a monitor that
polls the database on its own.

## How an alert is triggered

There is no separate alerting channel (no Slack/email/webhook). The
"alert" is the test suite itself:

1. If the invariant is violated, the test throws with a message listing
   every offending lender name, program name, and program ID, e.g.:
   `Found 5 active program(s) with an EMPTY citizenshipEligible array — this is never a legitimate state...`
2. That failure fails the Vitest run (`npm test` exits non-zero).
3. Wherever that run happens, standard failure surfacing applies:
   - **Locally**, the assistant/developer sees the failing test in the
     terminal output before any deploy proceeds.
   - **In CI**, a failing step would mark the GitHub Actions run red on
     the commit/PR (once the service-role key gap below is closed).

In short: this is a **build-gate**, not a live production monitor. It
guarantees that the moment anyone runs the full test suite against the
real database, a stripped `citizenshipEligible` array is caught and
named explicitly before it ships — it does not by itself watch the
production database in real time between test runs.

## Gap / follow-up (not yet done)

CI does not currently have `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` configured as repository secrets, so this
test (and the other `tests/integration/*` live-database tests) skip
silently in GitHub Actions today and only actually run when a developer
executes the suite locally with `.env.local` present. To make this a
true CI-enforced gate — and to get real-time production alerting rather
than only a build-time gate — two follow-ups would close the gap:

- Add the Supabase service-role credentials as GitHub Actions secrets so
  this test (and its siblings) run and can fail CI on every push/PR.
- Optionally, add a scheduled GitHub Actions workflow (e.g. hourly/daily
  `cron:`) that runs just this test against production independent of
  code pushes, wired to a notification step (Slack webhook, email, etc.)
  on failure — for continuous monitoring rather than only at commit time.

## Background: the bug this test guards against

A prior bulk-edit script
(`scripts/itin_lender_restriction_2026_07_29.mjs`) removed `itin` from
`citizenshipEligible` for every lender **not** on its own hardcoded
7-name allowlist. That allowlist wasn't cross-checked against the
catalog's actual verified ITIN programs, so it wiped 5 real programs down
to an empty array — most notably LoanStream Mortgage's real, sourced ITIN
program, deleted purely because the script's allowlist named the
unrelated "LendSure Mortgage Corp." instead. The fix
(`scripts/fix_itin_citizenship_stripped_2026_07_29.mjs`) restored the
correct values; this test is the permanent guard against the same failure
mode recurring from any future bulk-edit script.
