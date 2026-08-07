# NON-QM Nexus Guideline Analysis — NQM Funding & Carrington Category Expansion

- **Lenders:** NQM Funding; Carrington Mortgage Services
- **Documents:** 7 one-page "Key FEATURES" program summaries and full underwriting matrices, uploaded 2026-08-07
- **Date reviewed:** August 7, 2026
- **Uploaded files:**
  - `481eca0d-10cd-4a1b-9ffd-e49993a8a90d.pdf` — NQM Funding, Non-QM 2nd Lien
  - `1ada4094-c22e-4879-b508-d9cf4925dd6f.pdf` — NQM Funding, DSCR Multi, Residential 5-8 Units, effective 05.15.26
  - `597124aa-c4a2-445a-842e-a7bff8049854.pdf` — NQM Funding, Flex Select ITIN
  - `33a6f1d6-ca44-4900-8e2f-dbeb5d142ed3.pdf` — NQM Funding, Flex Foreign National
  - `644c1cad-4525-48cc-83e5-9543917ce4b0.pdf` — NQM Funding, Flex Select (general Bank Statement/1099/Asset Utilization/WVOE/P&L)
  - `3b222b60-bb05-4002-a9a0-3fbd3aa9b354.pdf` — Carrington Prime Advantage Program Matrix
  - `3a993db6-92e6-4295-84db-09833eb9f82f.pdf` — Carrington Non-Agency Advantage Program Matrix

## Objective

Split each lender's catalog into distinct, correctly-tagged Program rows per
requested category — Bank Statements, P&L, Foreign National, ITIN, DSCR, DSCR
5-8 Units, and 2nd Lien — feeding the existing lender-matching engine
(baseChecks.ts/score.ts) and the Secondary Voice Vitals Expansion overlays
(mortgage lates category, gift funds, DSCR STR income, one-year
self-employment) already live in the platform.

## NQM Funding — changes

- **Updated** `Flex Supreme / Select Prime — Bank Statement / 1099 / P&L`
  with real headline figures from the Flex Select summary: $100K-$3.5M, max
  90% LTV / 660 min FICO / max 55% DTI, condo caps 85%/80% (warrantable/
  non-warrantable), gift funds allowed, added `wvoe_only` to its doc types.
- **Updated** `Foreign National Program` with the Flex Foreign National
  summary: $150K-$3M, 700 min score or foreign credit, 75% max LTV (Full/Alt
  Doc), 70% max LTV (DSCR), min DSCR 1.00 (1.15 for STR), cash-out caps,
  gift funds allowed, 0x30x12 housing history.
- **Updated** `ITIN Programs` with the Select ITIN summary: $125K-$2.5M, 85%
  max LTV / 660 min FICO / 50% max DTI, unlimited cash-out at <=60% LTV,
  gift funds allowed, 0x30x12 housing history.
- **Added** `DSCR Multi — 5-8 Unit Residential`: $100K-$3M (min loan amount
  not published on the one-pager — flagged `matrixConfirmationRequired`), min
  DSCR 1.00, max 75% LTV, 720 min FICO, max cash-out $1M, first-time
  investors allowed, foreign nationals eligible (700 FICO or foreign
  credit).
- **Added** `2nd Lien — Multi-Doc`: standalone/piggyback second lien, Full
  Doc/Bank Statement/1099/P&L+2mo/Asset Utilization/DSCR, max 85% CLTV, 700
  min FICO, max 50% DTI, min loan $50K, max loan $1M, max combined loan
  amount $4M, 0x30x12 housing history.

## Carrington Mortgage Services — changes

Prior catalog held only one program (`Flexible Advantage`, unchanged here).
Added five new programs from the two supplied matrices:

- **Prime Advantage — Full Doc / Alt Doc**: full loan-amount x FICO x
  occupancy x purpose LTV grid (`purposeLtvMatrix`, 26 rows) up to $4.0M
  loan amount, 660 min FICO baseline, second-home LTV capped at 80%
  purchase/R&T and 70% cash-out per the matrix footnote regardless of tier,
  condo caps 85%/80%.
- **Prime Advantage — ITIN**: distinct ITIN Maximum LTVs table, $100K-$2.0M,
  purchase & rate/term only (the ITIN table publishes no cash-out figures —
  flagged `matrixConfirmationRequired` for cash-out requests).
- **Non-Agency Advantage — Full Doc / Alt Doc**: full FICO tier (620-720+) x
  loan-amount-band grid, $150K-$4.0M, primary/second home only (no
  investment property documented on this product), non-warrantable
  condo/condotel capped at 75%.
- **Non-Agency Advantage — P&L + 2 Mo Bank Statements**: its own distinct
  3-row LTV grid (680/700/720 FICO), CPA-prepared P&L with 2 supporting
  months of bank statements, no borrower tax returns.
- **Non-Agency Advantage — Foreign National (Second Home)**: second-home-only,
  680 min FICO or foreign credit, $150K-$2.0M, 12-month reserves, $500K
  cash-in-hand cap, condo/condotel property caps.

## Oaktree Funding Corporation — no changes

No new Oaktree guideline document was supplied in this batch. Oaktree's
existing three programs (`Investor Advantage (DSCR)`, `Bank Statement
Program`, `Investor Advantage — Alt-Doc / Foreign National`) are left
untouched rather than inventing ITIN, DSCR 5-8 Unit, P&L, or 2nd Lien
figures with no source citation. Provide Oaktree's current guideline
matrices for those categories to extend it the same way.

## Method

All new/updated `Program` rows were written directly via
`scripts/ingest_nqmf_carrington_category_expansion_2026_08_07.mjs` (Supabase
service-role insert/update, same pattern as prior batch-ingest scripts).
Every numeric field traces to the cited PDF; where a document didn't state a
figure (e.g. minimum loan amount on a one-page summary, or ITIN cash-out),
`matrixConfirmationRequired`/`matrixConfirmationNotes` is set rather than a
guessed number. `giftFundsAllowed`, `strIncomeEligible`,
`maxMortgageLatesCategory`, and `minSelfEmploymentMonths` were populated
wherever the source document made a real, citable statement, so the existing
Secondary Voice Vitals matching/scoring logic (baseChecks.ts/score.ts) picks
them up automatically — no matching-engine code changes were needed.
