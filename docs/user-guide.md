# User Guide

## Creating a scenario

**New Scenario** → complete the questionnaire. Sections appear based on your selections — e.g. choosing *Bank statements* asks statement type/months/ownership/deposits/expense factor and deposit-quality flags; choosing *DSCR* asks lease/market rent and PITIA components; *Foreign national / ITIN* citizenship adds passport/OFAC questions. Use an anonymized borrower reference — not a full name or any identifier containing PII.

Submit to run the preliminary analysis immediately.

## Reading the results page

1. **Scenario snapshot** — what you entered.
2. **Calculation summary** — LTV, CLTV, DTI/DSCR, qualifying income, reserves. Expand *"How was this calculated?"* on any tile to see the exact formula, inputs, and cautions.
3. **Program matches**, grouped: Eligible / Conditional / Manual review / Ineligible. Every card lists the controlling rules — failed rules in red with guideline citations, warnings in amber, manual-review items in blue — plus the program's caps, the guideline version and verification date, and *"Why this ranking?"* (the transparent score breakdown).
4. **Side-by-side comparison** — tick up to 4 programs; a comparison table appears above.
5. **How to make this work** — honest restructuring options (lower LTV, debt payoff, documentation-method changes, seasoning waits …) with the programs each change would unlock and the verification it requires. Changes that don't create eligibility but strengthen a case-by-case exception request are labeled separately as *"Strengthens an exception request (not eligibility)"* and never presented as unlocking a program. The platform will never suggest misrepresenting occupancy, income, assets, employment, ownership, citizenship, property use, or loan purpose.
6. **Document needs list** — generated from the scenario's structure; required vs. if-applicable items with reasons.
7. **Lender posture badges** — where the org has flagged a lender as exception-friendly / moderate / rigid, a small badge appears next to that lender (match cards, comparison table, lender page). Editorially sourced, never a guideline, and never affects eligibility or match score.
8. **Exception Readiness** — when a scenario returns conditional / manual-review / ineligible and an exception-based lender is in the match set, an advisory section shows what's failing and by how much, the itemized compensating factors on the file, what would most improve it, which lenders will consider an exception, and a draft exception narrative. It describes file strength, never a likelihood of approval.

## Exporting

`GET /api/scenarios/{id}/analysis` returns the full analysis as JSON. Print-friendly output comes from the results page; PDF reports are on the roadmap.

## What the results mean (and don't)

Results are preliminary, based on configured rules and demonstration or configured guidelines. Guidelines change; lender overlays may apply; exceptions are not guaranteed; pricing is not included; final eligibility and approval always remain with the lender. Verify the current guideline before submission.

## AI Assistant (chat, lower-right)

The assistant answers lender/guideline questions from your current, tier-gated
catalog. Ask it loosely — it handles typos and shorthand ("who has the lowest
down payment for DCSR?", "2x30x12", "BK7").

- **Answers are structured**: a direct answer first, an evidence table of the
  lender/program/value that matched, any assumptions made, what would change the
  answer, a Sources drawer (the exact guideline versions used), and suggested
  follow-ups.
- **Precise non-answers**: if the library doesn't capture a field, the assistant
  says so rather than guessing. Sample/demo programs are labeled `(sample)`
  inline. Exception/pricing answers carry directional guidance only — never a
  guarantee and never a quoted rate.
- **Feedback**: thumbs up/down on any answer. A thumbs-down or an unanswered
  question feeds an admin queue so the guideline library can be improved.
- **Next step**: answers that need the full engine include a "Run full scenario"
  link that pre-fills the scenario builder from what you've discussed.
- **Start fresh**: the reset button clears your chat history.

Guidance is preliminary — verify the current guideline version before
submission; final eligibility rests with the lender.
