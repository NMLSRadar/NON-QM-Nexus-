# Lender posture (flexibility profiles) — what this layer is and is not

## What it is

`lender_flexibility_profiles` is **experiential/editorial metadata about real
companies** — how flexible a lender is, whether it has a working exception
process, and its pricing tendency. It answers the two questions guidelines
can't: *"who will actually do this / who gives exceptions"* and *"why is this
lender's rate better."* Both are answered from market experience, not a rate
sheet or guideline matrix.

Every row is:
- **Org-scoped** and RLS-protected (one org's read on a lender is not another's).
- **Org-editable and org-overridable** — the seeded values are defaults, not facts.
- Tagged `source: 'org_editorial'`, `isVerified: false` by default, with a
  `lastReviewedAt` date and a staleness window (default 180 days).
- Labeled in every surface: *"Internal guidance based on market experience —
  not a lender guideline or commitment."*

## What it is explicitly NOT

- **Not guideline data.** It is stored in its own table, never rendered inside a
  guideline citation block, never surfaced in the source panel as a guideline.
- **Never a scoring input.** Posture **cannot** change a match status, a match
  score, or any eligibility determination. It is a display badge and an optional
  user sort preference only. This is enforced by construction — the matching
  engine never reads these tables.
- **Not licensing for guideline claims.** A guideline question about a real
  lender with no verified guidelines loaded is answered "no verified guidelines
  in the library yet," never inferred from posture.
- **No pricing figures.** `pricingTendency` is directional language only
  (tighter guidelines generally correlate with better pricing). No rate, point,
  or price figure is ever quoted or modeled.

## How it's maintained

Admins edit posture profiles in the admin UI (per-org). Real lender names carry
posture metadata only — their actual guidelines stay empty until an admin loads
a verified guideline version. Aliases (e.g. "Greenbox" / "GBX" / "HomeXpress")
are normalized so fuzzy matching resolves to one record.

**Review cadence:** profiles should be reviewed at least every 180 days. A
profile whose `lastReviewedAt` is older than the staleness window is flagged
"possibly stale" and prompts an admin review; stale profiles are surfaced in the
admin dashboard.

## Why it can't touch eligibility scoring

Eligibility and match score come from rules against the guideline catalog only.
Mixing editorial posture into scoring would (a) let an org's opinion silently
reorder or flip eligibility, and (b) conflate "reputationally flexible" with
"actually eligible." The chatbot's posture answers always carry condition
language — exceptions require compensating factors and are never guaranteed —
and the exception-Readiness UI lists posture as "which lenders will consider an
exception," never as an approval signal.

## Seed values

- **exception_based** (flag known for a real exception process): Greenbox Loans,
  Forward Lending, Acra Lending, LoanStream Mortgage, Orion Lending, Cale
  Mortgage, Champions Funding, ClearEdge Lending, FundLoans, HomeXpress
  Mortgage, NQM Funding.
- **rigid** (tighter guidelines, typically better priced): Logan Finance, Angel
  Oak Mortgage Solutions, UWM, Newfi, NewRez, Verus Mortgage Capital, JMAC
  Lending, PennyMac, Deephaven Mortgage, First National Bank of America.

These are org-editable defaults (`source: 'org_editorial'`, `isVerified: false`),
stored in `src/domain/lenderPosture.ts` and seeded on first load.