# NON-QM Nexus Guideline Analysis — Cake Mortgage Category Expansion

- **Lender:** Cake Mortgage (Cake TPO, https://www.caketpo.com)
- **Date reviewed:** August 7, 2026
- **Sources:** user-uploaded "Coffee Cake Matrix 03.09.26 (ver 1.0)" PDFs (Alt Doc - Lite and Alt Doc), plus live-browsed caketpo.com matrix PDFs (Cheese Cake, Cup Cake) and narrative guidelines (DSCR_5.0_Guidelines.pdf, CES_2.0_GUIDELINES).

## Objective

Cake's real numeric matrices were previously not ingested — the existing programs only carried the narrative v4.0 guide's "current matrix required" placeholders. This batch pulls Cake's actual branded product matrices (Cake names its products with cake-themed codenames — Coffee Cake, Cheese Cake, Cup Cake, etc.) and maps them onto the requested categories: Bank Statement, P&L Only, WVOE, 1099, DSCR 1-4, DSCR Multi-Family, DSCR Foreign National, Closed End Seconds.

## Product-to-category mapping

- **Bank Statement** → Coffee Cake Lite ("Alt Doc - Lite") matrix — full 26-row loan-amount x FICO x purpose grid, $150K-$4.0M, up to 90% LTV. Updated the existing "Bank Statement — 12/24 Month" program; deactivated a redundant numberless duplicate program named "Bank Statement".
- **P&L Only** → Cheese Cake ("Alt Doc") matrix's dedicated P&L Only overlay row — 80%/75% LTV by FICO tier, capped at $2.0M. Updated "P&L Statement Only — 12/24 Month".
- **WVOE** → Cheese Cake matrix's dedicated WVOE overlay row — primary residence only, 680 min FICO, no gift funds. Updated "WVOE Only".
- **1099** → Cup Cake matrix's 1099 Only overlay — self-employed only, flat 80% max CLTV. Updated "1099 Only — 1/2 Year".
- **DSCR 1-4** → Cup Cake matrix's embedded DSCR grid (12-row loan-amount x FICO grid, ITIN overlay, short-term-rental overlay). Updated "DSCR Loan (1-4 Unit)".
- **DSCR Foreign National** → Cup Cake matrix's Foreign Nationals DSCR overlay (70%/65% CLTV, priced at 700 FICO) plus DSCR_5.0_Guidelines.pdf Sections 4.6-4.6.6 (documentation, credit, ACH, foreign-asset conversion). Updated "DSCR Foreign National" (was stuck on `draft` verification status — now `human_verified`).
- **DSCR Multi-Family** → DSCR_5.0_Guidelines.pdf Section 9 (Multifamily Collateral, 5-9 Units) — real eligibility/overlay rules (min DSCR 1.00, max 2 vacant units, no STR income, 6/12-month reserves, no rural/agricultural zoning, no FTHB) but **no numeric LTV/FICO/loan-amount grid was found published** on the accessible Guidelines/Products pages; the guideline itself defers to "the applicable product matrix." Added new program "DSCR Multifamily — 5-9 Unit" with `matrixConfirmationRequired: true` rather than borrowing the 1-4 unit grid.
- **Closed End Seconds** → CES_2.0_GUIDELINES narrative — real program structure (stand-alone or piggyback second, Full Doc/Bank Statement/1099/WVOE/P&L Only/DSCR all eligible, fixed 10/15/20/30-yr + 30/15 and 40/15 balloon, prepayment penalty only on DSCR/business-purpose CES, no escrows). **No numeric CLTV/loan-amount/DTI matrix was found published.** Added new program "Closed End Second (CES)" with `matrixConfirmationRequired: true`.

## Method

Written via `scripts/ingest_cake_category_expansion_2026_08_07.mjs` (idempotent upsert-by-name for `programs`, upsert-by-label for `guideline_versions`, always promoted to `human_verified` — the lesson from the NQM Funding/Carrington batch earlier the same day: a program row alone does not make it customer-visible; `listPrograms()` also requires a `human_verified` `guideline_versions` row per program). Verified against the live database that all 12 active Cake Mortgage programs now have a `human_verified` guideline_versions row.
