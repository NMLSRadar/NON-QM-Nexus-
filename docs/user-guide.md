# User Guide

## Creating a scenario

**New Scenario** → complete the questionnaire. Sections appear based on your selections — e.g. choosing *Bank statements* asks statement type/months/ownership/deposits/expense factor and deposit-quality flags; choosing *DSCR* asks lease/market rent and PITIA components; *Foreign national / ITIN* citizenship adds passport/OFAC questions. Use an anonymized borrower reference — not a full name or any identifier containing PII.

Submit to run the preliminary analysis immediately.

## Reading the results page

1. **Scenario snapshot** — what you entered.
2. **Calculation summary** — LTV, CLTV, DTI/DSCR, qualifying income, reserves. Expand *"How was this calculated?"* on any tile to see the exact formula, inputs, and cautions.
3. **Program matches**, grouped: Eligible / Conditional / Manual review / Ineligible. Every card lists the controlling rules — failed rules in red with guideline citations, warnings in amber, manual-review items in blue — plus the program's caps, the guideline version and verification date, and *"Why this ranking?"* (the transparent score breakdown).
4. **Side-by-side comparison** — tick up to 4 programs; a comparison table appears above.
5. **How to make this work** — honest restructuring options (lower LTV, debt payoff, documentation-method changes, seasoning waits …) with the programs each change would unlock and the verification it requires. The platform will never suggest misrepresenting occupancy, income, assets, employment, ownership, citizenship, property use, or loan purpose.
6. **Document needs list** — generated from the scenario's structure; required vs. if-applicable items with reasons.

## The guideline assistant (chat)

The chat widget (lower-right) answers ad-hoc guideline questions from **your library's data only** — "who has the lowest down payment for DSCR?", "who does ITIN?", "what does 2x30x12 mean?". Answers lead with the finding, then an evidence table (lender · program · value · gating conditions · guideline version/effective date, with sample data badged), assumptions actually made, what would change the answer, and a sources drawer. Ranked questions ("lowest/highest") are computed server-side and ties are reported as ties.

When the library can't answer — the field isn't captured, or no program qualifies — the assistant says so plainly instead of guessing, and the question lands in an admin queue so the gap gets filled. Use the thumbs to flag a bad answer; use the "Run full scenario" link when a question needs the real engine — it opens the scenario builder prefilled with what you described. Chat history persists in your browser; "start fresh" clears it.

The assistant never quotes rates or pricing, never promises approval, and never helps restate a file as something it isn't.

## Exporting

`GET /api/scenarios/{id}/analysis` returns the full analysis as JSON. Print-friendly output comes from the results page; PDF reports are on the roadmap.

## What the results mean (and don't)

Results are preliminary, based on configured rules and demonstration or configured guidelines. Guidelines change; lender overlays may apply; exceptions are not guaranteed; pricing is not included; final eligibility and approval always remain with the lender. Verify the current guideline before submission.
