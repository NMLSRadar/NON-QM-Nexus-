# Product Requirements (MVP)

## Vision

A secure, AI-assisted platform where mortgage professionals enter a borrower/property scenario once and receive: potentially eligible NON-QM programs and lenders, ineligible programs with reasons, maximum LTV / minimum FICO / maximum DTI / reserve and loan-amount limits, documentation requirements, underwriting concerns, compensating factors, restructuring recommendations, guideline citations, a needs list, and an exportable analysis.

**The platform is a decision-support and research tool.** It never represents output as a loan approval, credit decision, commitment to lend, adverse action, or guaranteed acceptance. Every result carries: *"Preliminary scenario analysis only. Final eligibility, pricing, underwriting, documentation, and approval are subject to lender review and the guidelines in effect at the time of submission."*

## Core principle

Deterministic rules compute; AI explains. Results separate (1) deterministic eligibility, (2) AI-generated analysis, (3) human-reviewed lender information. Every eligibility result traces to a rule and, where available, a guideline source.

## Supported program categories

Bank statement · P&L-only · DSCR · asset depletion · full-doc NON-QM · 1099 · ITIN · foreign national · non-permanent resident · jumbo/alt-doc.

## Roles

Broker/LO (create/analyze/share scenarios), Account executive (review, recommend, track), Processor (docs and needs lists), Underwriter/guideline admin (matrices, versions, rule approval, tests), Org admin (users, settings, audit, retention, AI config), Platform admin (orgs, templates, health, flags — minimum necessary access).

## Workflow

1. **Create scenario** — dynamic questionnaire; conditional sections per income type and citizenship
2. **Preliminary analysis** — validate, calculate (LTV/CLTV/DTI/DSCR/income methods), evaluate every active program, classify (strong match / eligible / conditional / eligible-with-restructuring / manual review / ineligible), rank transparently
3. **Review matches** — per program: lender, status, score, caps, income, reserves, doc type, failed rules, manual-review items, guideline version/citation/verification, disclaimer
4. **Compare** — up to 4 programs side by side
5. **Generate output** — needs list, summaries, JSON export (PDF, shareable links, email summaries on roadmap)

## MVP acceptance criteria — status

| # | Criterion | Status |
|---|---|---|
| 1–2 | Registration / org invites & roles | ✅ live — Supabase Auth, real per-user/org registration, team invites with roles (see docs/team-membership.md) |
| 3 | Create and save a scenario | ✅ |
| 4 | Conditional questions per income type | ✅ |
| 5 | LTV, DTI, DSCR, bank-statement, P&L, asset-depletion calcs | ✅ tested |
| 6 | Deterministic rules engine on active demo programs | ✅ |
| 7 | Results grouped eligible / conditional / manual / ineligible | ✅ |
| 8 | Every result shows controlling rules | ✅ |
| 9 | Program comparison | ✅ (up to 4) |
| 10 | Safe restructuring suggestions | ✅ |
| 11 | Needs list | ✅ |
| 12 | Scenario report | ◐ JSON export + print-friendly page; PDF pending |
| 13–14 | Admin CRUD + rule testing | ◐ read views + regression framework; builder UI pending |
| 15–16 | Private documents, RLS isolation | ✅ live — RLS enforced on every tenant-owned table (`supabase/rls-policies.sql` + related policy files) |
| 17 | Automated tests for critical calcs | ✅ 2,751 tests across domain/e2e/live-database integration |
| 18 | Demo data clearly labeled | ✅ persistent labels |
| 19 | Never presented as loan approval | ✅ disclaimers everywhere |
| 20 | Builds + documented deploy steps | ✅ |

## Non-goals (MVP)

Live pricing, AUS integration, statistical approval prediction, collection of protected-class data, credit pulls, e-sign, POS functionality.
