# Tutorial screenshot manifest

Every media slot on `/tutorial` is defined here, in the order the sections
render. **No real screenshots exist yet** — each section currently renders a
clearly labeled placeholder (component `<Screenshot>`) showing the recording
script, so the page never shows a broken embed. When the UI changes, re-capture
per the script below and drop the file in `public/tutorial/` with the exact
name — the placeholder swap is a one-line change in the section&apos;s MDX.

## Conventions

- File location: `public/tutorial/<media-id>.png` (public folder, so the
  renderer can serve it at `/tutorial/<media-id>.png`).
- Capture at **1440x900**, browser zoom 100%, logged in as a **member account**
  (real catalog) unless the script says otherwise. Use the gold/black theme
  that ships in the app — never a light-mode mockup.
- Alt text: already written into each `<Screenshot alt="…">` in the MDX — copy
  it verbatim so screen-reader content matches the page.
- To swap a placeholder for the real shot: replace the `<Screenshot … />`
  component in the section MDX with
  `<Image alt="…" src="/tutorial/<media-id>.png" width="1440" height="900" />`
  — or a `<video>` loop for the walkthrough clips below.

## Slots to capture

| # | Media id | Section | Subject | Capture state |
| --- | --- | --- | --- | --- |
| 1 | `voice-vitals-review` | Voice Scenario | The nine captured vitals shown as editable values before analysis runs | Signed-in member, `/scenarios/voice`, after speaking the DSCR example script |
| 2 | `manual-form-bank-statement` | Manual Scenario | New Scenario form with Bank Statement selected, conditional section expanded | Signed-in member, `/scenarios/new` |
| 3 | `lender-detail-programs` | Lender List | Lender detail page: per-program metric tiles, pills, version line, source citation | Signed-in member, any unlocked lender, `/lenders/<id>` |
| 4 | `programs-matrix` | Programs | Full matrix table: column headers + ≥6 real program rows | Signed-in member, `/programs` |
| 5 | `document-needs-list` | Documentation Needs | Results sidebar Document Needs List: collapsed 4-item state, then expanded with Required / If applicable pills | Signed-in member, any analyzed scenario |
| 6 | `unique-product-pills` | Unique Non-QM Products | Match card showing gold niche pills (ITIN DSCR, foreign national specialist, standalone second lien) | Signed-in member, scenario with an edge-case vital (e.g. “second lien” or “ITIN DSCR”) |
| 7 | `trial-banner` | Account, Trial & Billing | Site-wide amber trial banner with days remaining + “choose a plan” link | Fresh trial account, 1440x900, top of any page |
| 8 | `match-card-anatomy` | Reading Your Results | Top match card: Best Match pill, status badge, score ring, Why This Lender, Potential Issues | Signed-in member, any analyzed scenario, top of the matches list |
| 9 | `quick-start-results` | Quick Start | Ranked Best Lender Matches list with gold Best Match pill and right-hand Document Needs List | Signed-in member, any analyzed scenario, full results page |

## Clips (looping video placeholders)

None exist yet. When produced, record at 1080p, 12–20s loops, muted, and store
as `public/tutorial/<media-id>.mp4`:

| Media id | Section | Clip script |
| --- | --- | --- |
| `voice-demo-loop` | Voice Scenario (optional) | Speak the DSCR example script end-to-end: mic on → captured vitals render as chips → corrections → analysis runs → ranked matches fade in. |
| `results-loop` | Reading Your Results (optional) | Scroll a results page slowly: status badges, score rings, expand a card to Why This Lender / Potential Issues. |

## Recording checklist (before any capture)

1. Confirm the section&apos;s described steps match the live UI — the page follows
   the product, so capture the product, then fix the copy if they diverge.
2. Use a member account with real (non-sample) catalog data.
3. Hide personal info (no borrower PII) — the app already anonymizes; keep it
   that way in screenshots (no borrower names, emails, or account pages with
   real emails).
4. PNG for stills, H.264 MP4 for clips, no letterboxing.