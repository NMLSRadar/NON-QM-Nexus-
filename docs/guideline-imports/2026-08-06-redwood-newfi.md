# Redwood + NewFi Guideline Ingestion Report

Run: `redwood-newfi-2026-08-06-v1`  
Production date: 2026-08-06  
Repository commits: `bc5d29a`, `89c3bd6`, `9965a99`

## Result

- Documents reviewed: 14 PDFs.
- Lenders resolved: 2.
- Programs inserted and activated: 7.
- Current guideline versions marked `human_verified`: 7.
- Duplicate program identities detected after import: 0.
- Purpose-aware 1–4-unit matrix rows stored: 107.
- Dedicated 5–8-unit matrix rows stored: 2.
- Purpose-matrix regression tests: 5/5 passed.
- Production database assertions: 10/10 passed.

## Authority hierarchy

1. Current full underwriting guide controls.
2. Effective-dated change summary/bulletin controls a specifically changed field when later than the base text.
3. Quick-reference matrix is subordinate where it expressly says current guidelines supersede it.
4. Historical change-log statements are not current rules when a later operative body or bulletin reverses them.
5. Missing text is `not stated`, not automatic ineligibility.
6. Explicit `N/A` matrix cells are ineligible for that exact tier/purpose.

## Lender import summary — NewFi Lending

### Artemis DSCR

- Effective: 2026-04-27.
- Matrix rows: 12.
- Investment only; $100,000–$3,000,000; minimum published FICO 640; DSCR floor 0.80.
- Purchase/rate-term ceiling 80%; cash-out ceiling 75%, with amount/FICO/DSCR tiers preserved.
- Citizens, permanent residents and eligible non-permanent residents included.
- Foreign nationals expressly excluded; ITIN remains document-silent and was not marked eligible.
- STR, novice-investor, condo, geographic, reserve, mortgage-late and PPP overlays retained in program notes/config.

Human-review conflicts retained:

1. Novice reserves: stale matrix says 8 months; body/change summary says 6 months.
2. Florida limited review language conflicts with another Florida condo passage.
3. 4–5 year PPP text remains in portions of the guide although the 2026-04-27 summary removes those terms.
4. 401(k) reserve eligibility differs between current body and revision notes.
5. New-condo CPM/third-party-review language differs between body and change log.
6. Exact 65% cash-out boundary differs between body and historical summary.

### Hercules Non-QM

- Effective: 2026-04-27.
- Matrix rows: 27.
- Full Doc, Bank Statement, 1099, P&L Only and Asset Depletion.
- Primary, second home and investment; $100,000–$3,500,000.
- Minimum published FICO 660; up to 90% purchase; purpose-specific refinance caps retained.
- P&L Only is encoded without a tax-return delivery requirement. The P&L is the income document; preparer/CPA confirmation is limited to licensing and filing/preparer relationship.
- CPA P&L, CPA Gross Receipts and Asset Utilization 80% caps retained.

Human-review conflicts retained:

1. Florida condo caps vary by occupancy and review path.
2. Ownership-percentage formulas say “divide” in several sections while the general rule says reduce/multiply.
3. Tax-preparer relationship language conflicts in consecutive bullets.
4. PPP body text conflicts with the 2026-04-27 term-removal summary.

### Hercules Expanded

- Effective: 2026-04-27.
- Matrix rows: 18.
- $100,000–$2,000,000; minimum FICO 620; up to 80% LTV.
- Housing-history and 36-month credit-event overlays retained.
- Same alternative-income and P&L-only safeguards as Hercules Non-QM.

### Olympus Standalone Closed-End Second

- Effective: 2026-03-16.
- Matrix rows: 6.
- Correctly tagged `standalone_second`; it will not match ordinary first-lien cash-out programs.
- $50,000–$500,000; minimum FICO 660; maximum 85% CLTV; no reserves.
- Primary/second-home and investor tiers retained; Texas capped at 80% CLTV.
- Entity, foreign-national, rural, non-warrantable-condo and other express exclusions retained.

Human-review conflict retained: the guide requires six months of cash-out ownership but also contains a valuation branch for ownership under six months.

## Lender import summary — Redwood Residential Acquisition Corporation

### Aspire DSCR v1.3

- Effective: 2025-07-21.
- 1–4-unit matrix rows: 7.
- 5–8-unit matrix rows: 2.
- $75,000–$3,000,000; minimum FICO 640; DSCR floor 0.75.
- Purchase, rate/term and cash-out tiers are stored separately.
- Non-permanent-resident, foreign-national/no-U.S.-score, STR, first-time-investor, condo/condotel and 5–8-unit restrictions retained.
- No-U.S.-score foreign-national handling preserves Redwood’s internal 999 convention rather than inventing a consumer FICO.
- ITIN and DACA are expressly ineligible.

Human-review conflicts retained:

1. Version-history tier narrative conflicts with operative matrix; operative matrix used.
2. Generic warrantable-only condo sentence conflicts with detailed non-warrantable/condotel sections.
3. Unleased-refinance overlay conflicts with SFR leased-at-closing language.
4. Reserve thresholds overlap.
5. Judgment/lien thresholds are not harmonized.
6. REO mortgage-statement bulletin language is broader than the guide text.

### Aspire Expanded — Full Documentation v1.2

- Effective: 2025-07-21.
- Matrix rows: 18.
- $100,000–$3,000,000; minimum FICO 620; maximum 90% purchase; DTI up to 55% (50% for FTHB).
- Primary, second-home and investment matrices retained separately.
- Investment Florida attached-condo 50% overlay retained in notes.
- Non-warrantable condo and condotel reductions/caps retained.

### Aspire Expanded — Alternative Documentation v1.2

- Effective: 2025-07-21.
- Matrix rows: 19.
- $100,000–$4,000,000; minimum matrix FICO 620; maximum 90% purchase/rate-term; DTI up to 55%.
- Bank Statement, 1099 Only, P&L Only, Alternative Asset Depletion and Written VOE Only included.
- P&L Only: minimum 25% ownership, two-year self-employment, third-party P&L, minimum 700 FICO, maximum 80% LTV/CLTV, no tax-return delivery requirement.
- Written VOE Only: salaried, same employer two years, FNMA Form 1005, two months matching deposits, minimum 660, no FTHB.
- Business bank statements: 12/24 months; default 50% expense factor or supported factor not below 25%.

Human-review conflicts retained:

1. P&L ownership formula is facially anomalous (“divide by ownership percentage”).
2. Exactly $2,000,000 appraisal count is omitted.
3. Reserve bands overlap.
4. Several matrix/change-bulletin comparator glyphs require visual confirmation.
5. Asset Utilization has no independent 80% cap in the full guide; no cap was invented beyond the applicable matrix/property overlays.

## Application logic changes

- Added `PurposeLtvMatrixEntry` to preserve loan amount, FICO, occupancy, DSCR and separate purchase/rate-term/cash-out columns.
- Explicit `N/A` purpose cells resolve to zero eligibility for that tier rather than falling back to a broader purchase/base cap.
- Matrix selection supports score roll-down and chooses the strongest applicable published tier without exceeding amount, occupancy or DSCR conditions.
- Existing citizenship, property-type and no-FICO caps continue to tighten the matrix result.
- Olympus is routed through the existing standalone-second lien path.
- Redwood 5–8-unit scenarios continue to use their dedicated amount/FICO/purpose matrix and cannot fall back to 1–4-unit terms.

## Production QA

Passed checks:

1. All seven program identities are unique.
2. All seven programs are active.
3. All seven records carry the source/migration marker.
4. All seven current guideline versions are `human_verified`.
5. Artemis matrix row count is 12.
6. Hercules/Hercules Expanded row counts are 27/18.
7. Redwood DSCR/Full/Alt row counts are 7/18/19.
8. P&L-only tax-return standing rule is retained.
9. Olympus is tagged standalone second.
10. Redwood 5–8-unit matrix contains two verified rows.
11. Purpose-aware engine tests: 5 passed, covering lower cash-out caps, explicit N/A, DSCR-tier selection, out-of-band rejection and property caps.

## Change-log disposition

- Existing unrelated lender/program records were preserved.
- The seven target program names did not exist under the resolved lender records, so the import inserted new records rather than overwriting non-equivalent programs.
- The second deployment re-ran the idempotent import and confirmed one unique record per target name.
- Current versions were refreshed as human-verified; any older version attached to the same target program would be marked superseded with the new effective date.
- All unresolved source conflicts remain visible in program notes and this report; no conflicting rule was silently normalized into a hard approval.
