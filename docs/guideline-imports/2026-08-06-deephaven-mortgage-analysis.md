# Non-QM Nexus Guideline Analysis — Deephaven Mortgage

Lender: Deephaven Mortgage LLC  
Primary matrix effective date: May 5, 2026  
Latest supplied guideline effective date: June 2, 2026 (Equity Advantage HELOC)  
Date analyzed: August 6, 2026  
Existing lender: YES  
Database status: UPDATE PREPARED — obsolete combined record identified; production execution requires secured environment credentials.

## Documents reviewed and source hierarchy

1. `cd74148d-b5ca-4587-880c-10e02f3f1214.pdf` — Correspondent Equity Advantage HELOC Guidelines, effective 06/02/2026.
2. `d2184ecc-3935-47a6-96af-37068a9a72ef.pdf` — Correspondent Purchase Eligibility Guidelines, effective 05/05/2026.
3. `f581b131-0bf3-46d6-a4da-cc41774694ea.pdf` — Correspondent Business Purpose Lending Guidelines, effective 05/05/2026.
4. `103d013f-fea9-4d54-8083-7ff750d0cead.pdf` — Expanded Prime, Non-Prime, DSCR, ITIN, and Super Jumbo matrices, effective 05/05/2026.
5. `2aaebcb0-28cb-42a1-87a1-b5c1eeef092c.pdf` — Equity Advantage CES, Elite, and DSCR matrices, effective 05/05/2026.
6. `7c248192-d7a6-42c0-81ea-4d761cd1b021.pdf` — DSCR 5–9 Unit matrix, effective 05/05/2026.
7. `bbaf2c48-26d3-4f55-9843-b76561c477ea.pdf` — Equity Advantage HELOC matrix, effective 05/05/2026.
8. `f065dfac-54be-4986-835e-50b6de237845.pdf` — Correspondent change bulletin, effective 05/05/2026.
9. `f5453570-7bca-4ac4-a3f9-5e477e17e728.pdf` — Business-purpose change bulletin, effective 05/05/2026; channel heading requires clarification.
10. `3aabacc3-cb73-4ab6-af34-eaeb117b0d8e.pdf` — Wholesale Equity Advantage HELOC Guidelines, effective 04/14/2026; separate/older channel reference.

Numerical eligibility comes from the applicable matrix; definitions and overlays come from the applicable full guideline. The newer 06/02/2026 HELOC guideline controls substantive conflicts with the 05/05 matrix, but the older matrix remains the only supplied numerical HLTV/HCLTV grid.

## Programs identified

1. Expanded Prime — Full / Alternative Documentation
2. Non-Prime — Full / Alternative Documentation
3. Investor Cash Flow (DSCR) — 1–4 Unit
4. Investor Cash Flow (DSCR) — 5–9 Unit
5. ITIN Mortgage
6. Expanded Prime Super Jumbo
7. Equity Advantage Closed-End Second
8. Equity Advantage Elite Closed-End Second
9. Equity Advantage DSCR Closed-End Second
10. Equity Advantage HELOC — First Lien
11. Equity Advantage HELOC — Second Lien

## Existing-data audit

Existing record: `Expanded Prime — Bank Statement / 1099 / Asset Utilization`.

| Field | Existing | Official 2026 package | Action |
|---|---|---|---|
| Program structure | One combined row | Multiple distinct programs and matrices | UPDATED — split |
| Minimum FICO | 0 | Numeric program floors and separate Foreign National/no-FICO rules | UPDATED |
| Occupancy | Investment only | Expanded Prime includes primary, second home, and investment | UPDATED |
| Maximum LTV | Flat 80% | Up to 89.99%, with FICO/loan/occupancy/purpose tiers | UPDATED |
| Maximum loan | $2M | Expanded Prime to $3.5M; Super Jumbo to $5M | UPDATED |
| Foreign National | Bundled | Not eligible under consumer Expanded Prime; eligible under DSCR tier | UPDATED |
| Cash-out | Not accurately modeled | Purpose-specific cells and dollar caps | NEW |
| P&L Only | Not separately controlled | Specific support/no-support tiers and overlays | NEW |
| DSCR/ITIN/CES/HELOC | Missing | Separate official programs | NEW |

The combined row should be deactivated only after the replacement records are published.

# Program analyses

## 1. Expanded Prime — Full / Alternative Documentation

- Occupancy: primary, second home, investment.
- Loan amount: $100,000–$3,500,000.
- Citizenship: U.S. citizen, Permanent Resident Alien, and Non-Permanent Resident Alien with U.S. credit. Foreign National is not listed under this program. [Matrix p.1; Correspondent Guidelines §§4.3–4.6]
- Minimum FICO: 660 at restricted tiers; 700 required for the $3.5M tier.
- Mortgage lates: maximum 1x30x12.
- BK/FC/short sale/DIL: 48 months.
- DTI: generally 50%; up to 55% only under the documented Expanded Prime exception.
- Reserves: 6 months through $2M; 9 months at $2.5M; 12 months at $3M–$3.5M.
- Income methods: Full Doc; 12-month personal/business Bank Statement; P&L Only; 1099; Asset Utilization.
- P&L Only: with two months business statements, maximum 80% purchase/70% refinance. Without statements, maximum 70% purchase/60% refinance, minimum 720 FICO, maximum $2M. The P&L is the income document; borrower tax returns are not required. Tax-preparer attestation confirms filing. [Matrix p.1; Guidelines §§8.5.1–8.5.3]
- Asset Utilization: Expanded Prime only; purchase/rate-term only; no cash-out; six-month asset seasoning; max 80% under matrix. Option 1 uses net qualified assets ÷84 with stated sufficiency test; Option 2 requires assets sufficient for the loan/closing/reserves and five years’ obligations. [Guidelines §8.7.2]
- 1099: most recent complete-year 1099, same provider for two years, IRS wage/income transcript, YTD evidence, and confirmation of no job expenses. [Guidelines §8.7.26.5]
- Cash-out: $500,000 when LTV >65%; unlimited at ≤65%; investment cap $1M.
- Property overlays: warrantable/non-warrantable condo and 2–4 units capped at 80%; rural 75% purchase/70% refinance and maximum 10 acres.
- First-time homebuyer: permitted subject to overlays; investment FTHB ineligible.
- Products: 15/30/40 fixed, 30/40 fixed IO, 5/6 ARM and ARM IO. Maximum note rate not specified.

### Expanded Prime LTV matrix

| Loan cap | FICO | Primary P/RT | Primary CO | 2H/Investment P/RT | 2H/Investment CO |
|---:|---:|---:|---:|---:|---:|
| $1.5M | 720 | 89.99% | 80% | 85% | 80% |
| $1.5M | 680 | 85% | 80% | 80% | 75% |
| $1.5M | 660 | 80% | 75% | 75% | 70% |
| $2M | 700 | 85% | 80% | 75% | 75% |
| $2M | 660 | 80% | 75% | 70% | 70% |
| $2.5M | 700 | 80% | 75% | 75% | 70% |
| $2.5M | 660 | 75% | 70% | 70% | 65% |
| $3M | 700 | 80% | 75% | 70% | 65% |
| $3M | 680 | 75% | 70% | 65% | 60% |
| $3.5M | 700 | 70% | N/A | N/A | N/A |

Source: 05/05/2026 matrix p.1. Footnote says “Up to 90%; max 89.99%.”

## 2. Non-Prime — Full / Alternative Documentation

- Loan amount: $100,000–$2,000,000.
- FICO: 620 floor.
- Occupancy: primary, second home, investment.
- Citizenship: U.S. citizen, Permanent Resident, and Non-Permanent Resident with U.S. credit.
- Cash-out cap: $500,000.
- Reserves: 3 months.
- DTI: 50%.
- Standard mortgage history: no 60-day late in prior 12 months; recent-event primary tier may allow 1x120x12 under the matrix.
- Standard BK/FC/SS/DIL: 24 months. Recent-event tier must be stored separately and not inferred into standard eligibility.
- Income methods: Full Doc, 12-month Bank Statement, P&L Only, 1099. Asset Utilization is not allowed.
- P&L Only: two months business statements, minimum 660 FICO, maximum 80% purchase/70% refinance.
- Non-warrantable condo/2–4 units: maximum 80%. Rural: 75% purchase/70% refinance, maximum 10 acres.

### Non-Prime standard matrix

| FICO | Primary P/RT | Primary CO | 2H/Investment P/RT | 2H/Investment CO |
|---:|---:|---:|---:|---:|
| 700 | 80% | 80% | 75% | 65% |
| 660 | 80% | 75% | 75% | 60% |
| 620 | 75% | 65% | 70% | N/A |

Recent-event primary P/RT: 70%; cash-out N/A. [Matrix p.2]

## 3. Investor Cash Flow (DSCR) — 1–4 Unit

- Business-purpose investment only; first-time homebuyer ineligible.
- Loan amount: $100,000–$2.5M; $200,000 minimum when DSCR <1.00; Foreign National maximum $1.5M.
- Minimum DSCR: 0.75; interest-only requires DSCR ≥1.00 and max 80% LTV.
- Mortgage history: 0x30x12; BK/housing events 36 months.
- Cash-out: $1M at ≤65% LTV; $500,000 above 65%.
- Reserves: 3 months ≤$1M; 6 months >$1M; 6 months for DSCR <1.00 or Foreign National.
- First-time investor: allowed only with 700 FICO, DSCR ≥1.00, and long-term rental.
- STR: DSCR ≥1.15, 720 FICO, −5 LTV, 75% maximum, 12 months experience; no FTI, 2–4 unit, rural, or DSCR below 1.00. Purchase AirDNA occupancy minimum is 60% under the complete guideline.
- Foreign National: eligible; no U.S. FICO may use documented alternative/international credit. Consumer ITIN is not this Foreign National ITIN use case.
- Property: condo/non-warrantable condo maximum 80%; rural SFR/condo purchase only, long-term only, DSCR >1.00, 65% maximum, 10 acres.

### DSCR ≥1.00 matrix

| Loan cap | FICO/class | P/RT | Cash-out |
|---:|---:|---:|---:|
| $1.5M | 720 | 80% | 80% |
| $1.5M | 700 | 80% | 75% |
| $1.5M | 680 | 75% | 75% |
| $1.5M | 640 | 70% | 70% |
| $1.5M | Foreign National | 70% | 60% |
| $2M | 700 | 80% | 75% |
| $2M | 680 | 75% | 75% |
| $2M | 660 | 65% | 65% |
| $2.5M | 700 | 70% | 70% |
| $2.5M | 660 | 65% | 65% |

### DSCR 0.75–0.99 matrix

| Loan cap | FICO | P/RT | Cash-out |
|---:|---:|---:|---:|
| $1.5M | 720 | 75% | 70% |
| $1.5M | 700 | 75% | 65% |
| $1.5M | 680 | 70% | 65% |
| $2M | 700 | 70% | 65% |
| $2M | 680 | 65% | 65% |
| $2.5M | 700 | 60% | 60% |

Source: Matrix p.3; Business Purpose Guidelines.

## 4. DSCR — 5–9 Unit

- Loan amount: $350,000–$2.5M.
- FICO: 680 minimum.
- DSCR: 1.15 minimum.
- Mortgage history: 0x30x24.
- BK/FC/SS/DIL: 84 months.
- Cash-out: $500,000 maximum.
- Reserves: 6 months.
- First-time investor: ineligible; 12-month investment-property ownership required.
- STR, mixed-use, rural, and subordinate financing: ineligible.
- Maximum two vacant units; vacant rent at 75% of market.
- IO: five-point LTV reduction.

| FICO | Purchase | Rate/term | Cash-out |
|---:|---:|---:|---:|
| 720 | 75% | 75% | 70% |
| 700 | 75% | 75% | 70% |
| 680 | 70% | 70% | 65% |

Source: 5–9 Unit matrix p.1.

## 5. ITIN Mortgage

- Consumer ITIN borrower resides and works in the U.S.; separate from Foreign National DSCR.
- Loan amount: $100,000–$1.5M.
- FICO: 680 minimum; U.S. credit required using ITIN; no limited tradelines.
- Maximum DTI: 50%.
- Mortgage/rental history: 0x30x12.
- BK/FC/SS/DIL: 48 months.
- Cash-out: $500,000 maximum.
- Income: one-year W-2/tax-return path, 12-month personal/business Bank Statement, 12-month 1099, and 12-month P&L.
- P&L: two months business statements; max 80% purchase/75% refinance; the P&L is the income document, not borrower tax returns.
- IO, subordinate financing, escrow waiver, and limited tradelines: ineligible.
- Gift funds: allowed with 5% borrower contribution.
- Reserves: 3 months standard; 6 months cash-out/second home/investment; at least 3 months borrower-owned.
- Property: SFR, PUD, townhome, warrantable/non-warrantable condo, 2–4 units; rural/condotel/manufactured/unique ineligible.

| FICO | Primary P/RT | Primary CO | 2H/Investment P/RT | 2H/Investment CO |
|---:|---:|---:|---:|---:|
| 720 | 80% | 65% | 70% | 65% |
| 700 | 80% | 60% | 70% | N/A |
| 680 | 75% | N/A | N/A | N/A |

Source: Matrix p.4; Guidelines §§4.6–4.6.5.

## 6. Expanded Prime Super Jumbo

- $3.5M–$5M; primary residence only.
- U.S. citizen/Permanent Resident only.
- FICO: 680 minimum; max DTI 35%.
- Full Doc, 12-month Bank Statement, and 12-month 1099. P&L Only and Asset Utilization not eligible.
- Mortgage history: 0x30x24; events 48 months.
- Reserves: 24 months plus 2 months per additional financed property, total maximum 36.
- Two appraisals; lower value used.
- No FTHB, IO, subordinate financing, gifts, or cash-out proceeds for reserves.
- Cash-out cap: $1M.
- No rural, non-warrantable condo, NY, Texas cash-out, or listed excluded geographies.

| Loan cap | FICO | Full Doc Purchase | Full Doc Refi | Alt Doc Purchase | Alt Doc Refi |
|---:|---:|---:|---:|---:|---:|
| $4M | 720 | 75% | 65% | 70% | 60% |
| $4M | 680 | 75% | 65% | 70% | 60% |
| $5M | 700 | 70% | N/A | 65% | N/A |
| $5M | 680 | 65% | N/A | 65% | N/A |

Source: Matrix p.5; Guidelines §§3.14–3.14.4.

## 7. Equity Advantage Closed-End Second

- Standalone second lien; $50,000–$1M; cash-out to $1M.
- Maximum DTI 50%; 0x30x12; 48-month events.
- Primary/second/investment; Full Doc, 12-month Bank Statement, P&L Only.
- No reserves or cash-to-close requirement.
- Citizenship: U.S., Permanent Resident, NPRA with SSN. Foreign National, ITIN, and no valid SSN ineligible.
- P&L: −5 CLTV; primary/second max 80%/$750K; investment max 80%/$500K.
- Non-warrantable condo max 75% CLTV.
- Rural primary SFR/PUD only, max $500K/10 acres; 70% at 720, 60% at 700 under full guideline.
- Interest-only: max 70% CLTV, 700 FICO, primary only, amortizing first lien.

| Loan cap | FICO | Primary CLTV | Second-home CLTV | Investment CLTV |
|---:|---:|---:|---:|---:|
| $500K | 700 | 90% | 85% | 80% |
| $500K | 680 | 85% | 80% | 80% |
| $500K | 660 | 80% | 70% | 70% |
| $750K | 720 | 80% | 75% | 70% |
| $750K | 700 | 80% | 70% | 65% |
| $750K | 680 | 75% | 65% | 60% |
| $1M | 720 | 65% | N/A | N/A |
| $1M | 700 | 60% | N/A | N/A |

Source: Equity Advantage matrix p.1; Guidelines §14.

## 8. Equity Advantage Elite Closed-End Second

- Matrix ceiling $500K; product-specific minimum, cash-out dollar cap, and DTI are not specified.
- Full Doc only; no Bank Statement/P&L.
- 0x30x12; 84-month events.
- Primary, second home, investment.
- U.S. citizen/Permanent Resident with valid SSN.
- No IO, reserves, rural, or non-warrantable condo.
- Declining market: −8 CLTV; Texas primary cash-out max 60%; Philadelphia −10.

| FICO | Primary R/T or CO | 2H/Investment R/T or CO |
|---:|---:|---:|
| 740 | 90% | 75% |
| 720 | 90% | 75% |
| 700 | 85% | 70% |
| 680 | 80% | 65% |

Source: Equity Advantage matrix p.2.

## 9. Equity Advantage DSCR Closed-End Second

- Business-purpose investment only; $75,000–$500,000.
- DSCR ≥1.00; FICO ≥680; 0x30x12; events 48 months.
- SFR/PUD/townhome/2–4; 2–4 reduces CLTV 5 points.
- Condo, rural, STR, and IO ineligible.
- No reserves; six-month ownership and lease required.
- Citizenship: U.S., Permanent Resident, NPRA with U.S. credit.
- Entity vesting/guaranty allowed as stated.

| FICO | Rate/term CLTV | Cash-out CLTV |
|---:|---:|---:|
| 720 | 80% | 80% |
| 700 | 75% | 75% |
| 680 | 65% | 65% |

Source: Equity Advantage matrix p.3; Business Purpose Guidelines.

## 10–11. Equity Advantage HELOC — First and Second Lien

- Line amount: $50,000–$1M.
- Full Doc and 12-month personal/business Bank Statement. Newer guideline also supports DSCR at ≥1.10, but no current numerical HCLTV grid was supplied for DSCR; keep that combination at human review.
- DTI: 50% through $500K; 43% above $500K.
- Minimum FICO: 660 primary/second; 700 investment.
- 0x30x12; events 48 months.
- Initial draw under 06/02 guideline: at least 80% and $50,000.
- No draws first 90 days; afterward $5,000 minimum.
- Draw period: 3 or 5 years IO; 20- or 30-year amortization.
- No reserves/cash to close.
- Primary: no minimum ownership; <6 months causes −10 CLTV. Second/investment: six months.
- U.S., Permanent Resident, NPRA with valid SSN. Foreign National/ITIN ineligible.
- Newer guideline allows warrantable and non-warrantable condos; current HCLTV confirmation remains required where matrix conflicts.
- Entity vesting investment-only; entity borrower itself ineligible.
- Prepayment penalty prohibited.

### 05/05/2026 numerical grid

| Line cap | FICO | 1st Primary | 1st 2H | 1st Inv | 2nd Primary | 2nd 2H | 2nd Inv DTI |
|---:|---:|---:|---:|---:|---:|---:|---:|
| $500K | 740 | 80% | 80% | 75% | 90% | 85% | 75% |
| $500K | 720 | 80% | 75% | 70% | 90% | 85% | 75% |
| $500K | 700 | 80% | 75% | 70% | 90% | 85% | 70% |
| $500K | 680 | 75% | 70% | N/A | 85% | 75% | N/A |
| $500K | 660 | 70% | 65% | N/A | 70% | 60% | N/A |
| $750K | 720 | 75% | 70% | 65% | 80% | 75% | 65% |
| $750K | 680 | 70% | 65% | N/A | 75% | N/A | N/A |
| $1M | 720 | 75% | 70% | 65% | 65% | N/A | N/A |
| $1M | 680 | 70% | 65% | N/A | N/A | N/A | N/A |

## Conflict register requiring human awareness

1. DSCR STR minimum: matrix extraction 1.10 vs full guideline 1.15 — use 1.15.
2. DSCR STR occupancy: matrix extraction 80% vs full guideline purchase section 60% — use 60%.
3. DSCR rural: full discussion loosened language, but matrix remains purchase-only — use stricter matrix.
4. Equity Advantage rural 700 FICO: matrix extraction 70% vs guideline 60% — use 60%.
5. HELOC condo: 05/05 matrix says ineligible; 06/02 guideline says eligible — use newer eligibility but require current HCLTV confirmation.
6. HELOC DSCR: 05/05 matrix cells N/A; 06/02 guideline allows DSCR ≥1.10 — enable only as manual review until current HCLTV is confirmed.
7. HELOC initial draw: 89%/$500 in older extraction vs 80%/$50,000 in newer guideline — use 80%/$50,000.
8. HELOC product term/seasoning/assets: newer 06/02 guideline controls.
9. P&L Only: preparer attestation confirms filing; it must not be stored as borrower-tax-return income documentation.
10. Elite matrix leaves several product fields blank; do not infer them from general CES.

## Strongest selling points

- Expanded Prime up to 89.99% LTV and $3.5M.
- Super Jumbo to $5M.
- DSCR down to 0.75 and Foreign National no-U.S.-FICO alternatives.
- Consumer ITIN with primary, second-home, and investment eligibility.
- P&L Only, Bank Statement, 1099, and Asset Utilization alternatives.
- Dedicated 5–9 unit DSCR.
- Closed-end seconds to 90% CLTV and HELOC to 90% second-lien HCLTV under documented tiers.

## Most important restrictions

- Program-specific matrices vary materially by transaction, loan amount, occupancy, FICO, DSCR, citizenship, property type, and lien position.
- Consumer ITIN must not be confused with Foreign National passive-income ITIN use.
- Super Jumbo is primary-only and highly restricted.
- STR requires strong overlays and is unavailable on several DSCR variants.
- Many city/state/declining-market and rural reductions apply.
- HELOC DSCR needs a current numerical HCLTV confirmation.

## Database update summary

- Preserve existing Deephaven lender; do not create a duplicate.
- Create/update the 11 separate program records listed above.
- Deactivate obsolete combined record only after replacements publish.
- Store full-fidelity eligibility matrices rather than flat summary limits.
- Store closed-end second/HELOC leverage against CLTV, not the second advance alone.
- Store leverage-banded cash-out dollar caps.
- Update AI Assistant/Voice Scenario through structured fields used by the matching engine.
