# Lender Posture (Flexibility Profiles)

Added 2026-08-10 (chatbot upgrade Part 2). This layer answers two questions guideline data can't: *"who will actually do this / who gives exceptions?"* and *"why is this lender's rate better?"* — both answered from **market experience**, not from a rate sheet or a guideline matrix.

## What this layer IS

Editorial, org-editable metadata about real lenders' market posture:

- `posture`: `exception_based` / `moderate` / `rigid`
- `pricingTendency`: directional only (`typically_better_priced`, `typically_more_aggressive`, …)
- `exceptionsConsidered` + `exceptionChannel` (e.g. "AE submission")
- `typicalCompensatingFactorsRequired`
- provenance: `source` (default `org_editorial`), `isVerified` (default **false**), `confidence`, `lastReviewedAt`

Code: `src/domain/lenderPosture/` (types, seed defaults, resolution/merge). Storage: `supabase/lender-flexibility-profiles.sql` — platform-default rows (`organization_id NULL`) plus per-org override rows under RLS. `mergePostureProfiles` applies an org's overrides over the seed; **one org's read on a lender never affects another org's** (locked by test).

Aliases resolve trade names and shorthand ("Greenbox", "GBX", "Home Xpress", "Cale Mortgage" → Cake Mortgage) via `resolvePostureProfile`.

## What this layer is explicitly NOT

- **Not guideline data.** It never renders inside a guideline citation block, a rule result, or the sources drawer. Chatbot rows carrying posture are tagged `sourceType: 'editorial'` and excluded from sources.
- **Not an eligibility input.** It cannot drive a pass/fail rule outcome, a match score, or an eligibility determination. Structurally enforced: `src/domain/matching`, `src/domain/rules`, `src/domain/calc`, and `analyze.ts` have no import path to the posture layer — `tests/domain/postureIsolation.test.ts` fails the build if one appears, and also asserts that flipping every lender's posture leaves every rule outcome and score byte-identical.
- **Not a pricing source.** No rate, point, or price figure exists anywhere in this layer. The only permitted statement is the directional explainer (`PRICING_TENDENCY_EXPLAINER`): tighter guidelines correlate with better pricing; flexibility carries a premium; pricing varies and is not quoted or modeled here.
- **Not a promise.** "Considers exceptions" / "has a documented exception process" — never "will approve," "should be fine," "they'll do it." The eval suite hard-fails on approval language.
- **Not sample data.** Real lender names carry posture metadata only; their actual guidelines stay empty until an admin loads verified ones, and the editorial disclaimer is a different label from the sample-data disclaimer. If a user asks a guideline question about a real lender with no verified guidelines, the answer is "not in your library yet" plus the posture note — never an inferred guideline.

Every surface that shows posture carries: *"Internal guidance based on market experience — not a lender guideline or commitment."* plus `lastReviewedAt`.

## Where it appears

- **Match cards** (scenario results): `<LenderPostureBadge />` next to the lender name — no profile on record → no badge, no inference.
- **Exception Readiness** section (results page): renders when the scenario is conditional/manual-review/ineligible AND an exception-friendly lender is in the match set. Shows what's failing and by how much, the deterministic compensating-factor assessment with real figures, the highest-value missing factors as exception-*strengthening* targets (explicitly labeled "does not create eligibility"), the exception-friendly lenders with their channel, a deterministic draft exception narrative built from the assessment only, and the standing discretionary-review caveat.
- **Chatbot** `exception_guidance` intent: three parts, in order — the editorial list with badges and `lastReviewedAt`; the compensating-factors condition stated as a condition; the file's actual factors when a scenario is in context. Pricing questions get the directional explanation and named posture, never a figure or a price ranking.
- **Sorting**: posture may be a user-facing display filter/sort preference in the future — it is never a scoring input.

## Maintenance and review cadence

- Admin → **Lender Posture** lists every effective profile with source, confidence, and last-reviewed date, and lets platform admins edit posture/pricing-tendency/notes/channel and mark profiles reviewed. Org admins can write org-level overrides through the same table (RLS-scoped).
- Profiles older than **180 days** (configurable via `DEFAULT_POSTURE_STALENESS_DAYS`) are flagged *possibly stale* in the admin dashboard **and** in assistant answers, prompting review.
- Posture-sourced assistant answers are logged with `postureSourced: true` so admins can see how often editorial data carries an answer.
