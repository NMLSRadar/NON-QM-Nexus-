# Calculation Methods

All calculations live in `src/domain/calc`, use decimal.js (never raw floating point for money), and return a `CalcResult` containing the value, the formula string, every input consumed, and any caution notes. Nothing is hidden: the UI renders the trace under "How was this calculated?".

## LTV (`ltv.ts`)

```
LTV = requested loan amount ÷ applicable property value × 100
```

Purchase basis is configurable: `lower_of_price_or_value` (default), `appraised_value`, or `purchase_price`. Refinances always use estimated/appraised value.

## CLTV (`ltv.ts`)

```
CLTV = (requested loan + subordinate/retained liens) ÷ applicable property value × 100
```

## DTI (`dti.ts`)

```
DTI = (proposed housing payment + other monthly liabilities) ÷ qualifying monthly income × 100
```

Income comes from the scenario's resolved documentation method — DTI never re-derives it. Null when income is absent or zero (e.g. DSCR programs). All included obligations are listed in the trace.

## Bank-statement income (`bankStatement.ts`)

```
income = eligible monthly deposits × ownership% × (1 − expense factor)
```

- Ownership applies to business statements by default (configurable).
- If no expense factor is supplied, a conservative 50% default applies and the result is flagged — the engine never silently invents an optimistic factor.
- Program-level overrides supported (`expenseFactorOverridePercent`, `applyOwnership`).
- Cash/ATM deposits, declining trends, multiple accounts, and co-mingling produce notes feeding program-specific manual-review rules.

## P&L income (`pnl.ts`)

```
income = net business income × ownership% ÷ covered months
```

Net income is taken directly or derived as `gross − expenses`. Flags: >10% variance to bank deposits, borrower-prepared P&L, missing supporting statements, missing obvious expense categories.

## DSCR (`dscr.ts`)

```
DSCR = qualifying monthly rent ÷ qualifying monthly housing expense
```

Configurable per program:
- Rent basis: `lower_of_lease_or_market` (default), `higher_of_lease_or_market`, `market_only`, `lease_only`
- Denominator: `PITIA` (P&I + taxes/12 + hazard/12 + flood/12 + HOA) or `ITIA` (interest-only payment substituted) for eligible IO structures

Short-term-rental income and sub-1.00 results are flagged.

## Asset-depletion income (`assetDepletion.ts`)

```
eligible = (liquid + brokerage + stocks/bonds) × eligible%
         + retirement × vested% × (1 − retirement haircut)
         + real-estate equity (if configured)
net      = eligible − down payment − closing costs − reserves   (as configured)
income   = net ÷ divisor months
```

Net eligible floors at zero. Borrowers under 59½ with retirement assets are flagged. Double-counting protection: when `assetsAlsoUsedToClose` is set, deductions are expected.

## Reserves (`reserves.ts`)

```
reserves (months) = (liquid + retirement × (1 − haircut) + other eligible) ÷ monthly housing payment
```

Default retirement haircut 30% (configurable).

## Derived maximum LTV (`matching/baseChecks.ts`)

Programs may define an LTV matrix (`minFico`, optional occupancy, `maxLtv`, optional max loan). The engine picks the highest-FICO band the borrower qualifies for and takes the **most restrictive** of matrix cap and base cap. Custom rules can restrict further (e.g. cash-out caps).

## Rounding policy

- Percentages: 2–3 decimal places, ROUND_HALF_UP
- Currency: 2 decimal places, ROUND_HALF_UP
- DSCR: 3 decimal places
- Division by zero always yields `null` (shown as "—"), never Infinity/NaN

## Compensating factors (`compensatingFactors/`) — 2026-08-10

Deterministic file-strength assessment (no LLM in scoring; describes file strength, never approval likelihood). Each factor is measured against the program's own limits and tiered `none / slight / moderate / strong / very_strong`:

| Factor | Formula | Tiers |
|---|---|---|
| LTV cushion | `maxAllowableLTV − requestedLTV` (points) | 1–4 slight · 5–9 moderate · 10+ strong |
| Reserves surplus | `actual ÷ required` months | >1x slight · ≥1.5x moderate · ≥2x strong · ≥4x **or** 12+ months at ≥1.5x very strong |
| DTI cushion | `maxDTI − calculatedDTI` (points) | 1–2 slight · 3–7 moderate · 8+ strong |
| FICO cushion | `actualFICO − minFICO` | 5–19 slight · 20–39 moderate · 40+ strong |
| Housing history | lates in lookback | 0x30x24 strong · 0x30x12 moderate · any late none |
| Credit depth | 4 qualitative flags rolled into one tier | all clean strong; any bad flag none |
| Seasoning surplus | months beyond program minimum | 1–5 slight · 6–11 moderate · 12+ strong |
| Residual income | income − obligations ($/month) | org-configurable tiers (defaults $2.5k/$5k/$10k) |
| Tenure | months beyond program minimum | 12–23 slight · 24+ moderate |
| Payment shock | proposed ÷ current payment | ≤1.0x strong · ≤1.25x moderate · ≤1.5x slight |

**Weights** (`weights.ts`, documented constant): reserves 3.0 > LTV cushion 2.5 > housing history / credit depth / DTI 2.0 > FICO / seasoning / residual / payment shock 1.5 > tenure 1.0. Overall strength = Σ weight×tier-value ÷ **Σ all weights** — undocumented factors contribute zero to the numerator but stay in the denominator, so **unknown data never scores favorably**. Thresholds: ≥0.5 strong, ≥0.3 moderate, ≥0.15 developing, else weak.
