# VIQI Vitals Gate and Conversational Session Architecture

Revision: 2026-09-06

## Scope

This change modifies VIQI listening, extraction, prompting, and presentation. The existing deterministic maximum-purchase-price solver is intentionally unchanged.

## Two independent state machines

```text
TURN CAPTURE
listening -> adaptive utterance boundary -> extraction -> checklist update -> listening

SESSION
idle -> active -> (complete vitals | explicit stop | manual override | hard ceiling | third no-speech) -> ended
```

A turn boundary cannot transition the session to `ended`. Browser speech recognition may end an individual recognition operation after silence; while the VIQI session remains active, capture restarts and the next missing vital is requested.

## Tunable thresholds

All timing lives in `VIQI_CONFIG`:

- complete-utterance silence: 2,500 ms
- incomplete/filler/mid-number silence: 4,000 ms
- initial silence after a VIQI prompt: 6,000 ms
- hard session ceiling: 6 minutes

The extended threshold protects filler tails, dangling conjunctions, and partial numeric phrases. These values begin conservatively to avoid the previous premature-stop failure; corpus results should drive future tuning.

## Path-dependent completion

The active path is consumer, investor/DSCR, or foreign-national/ITIN. A path signal can arrive in any turn. Applicable captured values survive a path change. The required checklist changes in place, and VIQI announces the interpretation change.

Investor coverage is an optional compound vital. It never blocks completion, but VIQI captures and uses it whenever the loan officer supplies either route:

1. A stated DSCR, including a valid no-ratio answer.
2. Monthly rent plus annual taxes and annual insurance, with HOA and flood defaulting to zero for the coverage calculation.

The calculation records its source and never overwrites a stated number silently. An investor session may complete with occupancy, funds, and FICO even when no coverage value is supplied.

## Extraction and trust boundary

`src/domain/toolkit/viqi.ts` is the independently testable deterministic extraction and state module. `viqi-lexicon.json` is version-controlled separately so vocabulary can expand without modifying capture/UI code.

Every value stores state, confidence, provenance, source, and conversion metadata. Ambiguous values do not satisfy the completion gate. Transcript content is data only; it cannot change application behavior, code, configuration, or tool access.

## Resilience and accessibility

The browser continuously persists the active VIQI record to local storage. Refresh, temporary network loss, speech-service loss, and microphone denial preserve captured values and expose the same keyboard/manual path. Each checklist row is a button with an inline labeled input. State and prompts are announced through live regions. Motion respects the existing reduced-motion rule.

## Test evidence

The VIQI domain suite covers turn/session separation, the three-step no-speech sequence, explicit and manual stop, refresh/resume state, path switching, spoken-number normalization, annual conversion disclosure, hourly ambiguity, mid-number silence, DSCR/no-ratio handling, coverage boundaries, manual completion, and the versioned lexicon corpus. Existing solver tests remain authoritative for calculation behavior.
