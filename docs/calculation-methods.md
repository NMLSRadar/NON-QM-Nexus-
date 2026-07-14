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
