# Voice Scenario Intake

Route: `/scenarios/voice` · Domain logic: `src/domain/voice/` · Tests: `tests/domain/voice.test.ts`

Speak (or type) a full NON-QM scenario in one go. The system extracts the
vitals, asks for exactly what's missing, and — the moment everything resolves —
automatically runs the deterministic analysis and lands on the ranked results
page, best option first.

## The eight vitals

Analysis requires all eight to resolve (a caller typically states 6–8 details;
the rest derive):

1. Purchase or refinance (a bare "refinance" triggers a rate-and-term vs.
   cash-out clarifying question)
2. Occupancy (primary / second home / investment)
3. Property type
4. Property value
5. Loan amount
6. LTV
7. Credit score
8. Income-documentation type (bank statements also capture 12 vs 24 months and
   personal vs business when spoken)

Any one of **{value, loan amount, LTV}** derives from the other two. If all
three are stated and disagree by more than one point, the assistant flags the
conflict, shows the computed figure, and holds auto-analysis until the user
confirms or corrects a number.

## Flow

1. **Capture** — the browser Web Speech API (`SpeechRecognition`) streams the
   dictation into an editable transcript; typing works identically, which is
   also the fallback for unsupported browsers.
2. **Extract (deterministic)** — `extractFromTranscript` normalizes spoken
   numbers ("eight hundred fifty thousand", "1.2 million", "680k") and pulls
   each vital with provenance: every captured field shows the transcript
   fragment it came from, and derived or guessed values are marked *inferred*.
3. **Assess & prompt** — `assess` computes derivations, detects conflicts, and
   produces the assistant's reply: an acknowledgment of what it heard plus
   targeted questions for only the missing vitals ("Got purchase,
   single-family, FICO 725. I still need occupancy, property value…"). Replies
   can optionally be spoken back via `speechSynthesis` (off by default, muted
   while the mic is live to avoid feedback).
4. **Auto-analyze** — when all eight vitals resolve with no unconfirmed
   conflicts, the client calls the `createScenarioFromVoice` server action,
   which independently re-assesses the extraction (completeness is never
   client-asserted), builds a payload for the shared Zod schema, and reuses the
   existing `createScenario` action — organization from the server session,
   validation, save, redirect to `/scenarios/[id]` with programs ranked
   best-first.

## Determinism and AI

Extraction, slot-filling, derivation, and all eligibility math are fully
deterministic — no model call anywhere in the default path. An optional
AI-assisted extractor (`src/lib/ai/extractScenario.ts`) exists behind the
provider abstraction for phrasings the parser misses: the transcript is passed
as delimited untrusted data, output is schema-validated JSON only, every
AI-captured field is marked *inferred — confirm before use*, and nothing AI
touches reaches the engine without user confirmation. It is disabled until an
AI provider is configured (see `docs/ai-safety.md`).

## Browser support & requirements

- Speech capture: Chrome, Edge, Safari (Web Speech API). Firefox and others:
  type or paste — every other part of the flow is identical.
- Requires HTTPS (or localhost) and microphone permission.
- Recognition runs in the browser; the server receives only the extracted
  fields the user has seen on screen.
- Parsing heuristics target US-English mortgage phrasing; every field is
  correctable inline ("Correct a field manually").

## Known limitations

- Heuristic extraction will miss unusual phrasings — the vitals grid plus
  manual correction is the designed recovery path, and
  `tests/domain/voice.test.ts` is where new phrasings get pinned when added.
- Multi-borrower or multi-property dictation is out of scope for the MVP.
