# AI Assistant Chatbot

The site chatbot (lower-right widget) is a **supplemental guidance layer**: it takes ad-hoc, loosely worded questions from mortgage professionals and returns the most accurate available direction, fast, with sources. It is not the scenario engine — when a question needs the full engine, its answer is a short correct one plus a prefilled deep link into the scenario builder.

Upgraded 2026-08-10 from a single-prompt free-text implementation to a two-stage pipeline built on the accuracy principles below.

## Accuracy principles

1. **The model never computes eligibility numbers and never recalls lender facts from memory.** Every factual claim traces to a tool call against the platform's own catalog.
2. **Superlatives are computed in the domain layer** (`rankProgramsByMetric`) — "lowest/highest/min/max" resolve to a deterministic ranked query with the tie set reported as ties. The LLM (when configured) narrates; it never picks the winner.
3. **Every answer is scoped to what the org can see.** The pipeline only receives the caller's tier-gated catalog from `repo.getCatalog(org)`; it structurally cannot reach outside it.
4. **Absence of data is stated as absence of data**, distinguishing "no program allows this," "your library doesn't capture this field," and "this is handled as an exception."
5. **Cite or don't claim.** Every factual row carries lender, program, guideline version, effective date; sample data is badged inline.
6. **One honest sentence beats a paragraph of hedging.** The standing disclaimer lives in the chat UI chrome, not in every message.

## Architecture

```
question ──► Stage A (deterministic, no model)          src/domain/chat/parse.ts
             normalize (typos/shorthand dictionary)     src/domain/chat/normalizationDictionary.ts
             classify intent + extract entities
                 │  ParsedQuery { intent, entities, targetMetric, … }
                 ▼
             Stage B (deterministic composition)        src/domain/chat/answer.ts
             intent-routed tool calls                   src/domain/chat/tools.ts
                 │  ChatAnswer (grounded by construction)
                 ▼
             optional LLM narration (tone only)         src/lib/ai/chatPipeline.ts
             — output discarded unless it passes
               verifyNarrationGrounding
                 │
                 ▼
             zod-validated ChatAnswer ──► widget        src/components/ai-assistant-widget.tsx
```

The pipeline is **fully functional with no AI provider configured** — the deterministic prose ships as-is. The LLM adds tone, never facts.

### Intents

`superlative_lookup` · `availability_lookup` · `threshold_lookup` · `scenario_triage` · `program_detail` · `comparison` · `process_help` · `exception_guidance` · `definition` · `app_navigation` · `out_of_scope`

Guardrail flags (`misrepresentation`, `protected_class`, `legal_tax_advice`, `pricing`, `approval`) force a decline with a legitimate alternative where one exists. Pricing declines include the directional guideline-tightness explainer (never a figure); approval declines include the compensating-factors framing.

`exception_guidance` (Part 2) routes "who gives exceptions / who's flexible / who will actually do this" to the editorial posture layer + the deterministic compensating-factors engine, answering in three fixed parts: the org-scoped posture list (badged, with `lastReviewedAt`), the compensating-factors condition, and — when a scenario is in context — the file's actual factor assessment with its single biggest gap. Tools: `get_lender_posture`, `score_compensating_factors`, `find_exception_candidates` (`src/domain/chat/postureTools.ts`); posture rows are `sourceType: 'editorial'`, never guideline sources. See `docs/lender-posture.md`.

### Normalization dictionary

`src/domain/chat/normalizationDictionary.ts` — version-controlled, not embedded in a prompt. Handles typos/speech-to-text ("mortgage lights" → mortgage lates, "DCSR" → DSCR, "ITN" → ITIN), shorthand (`2x30x12`, `BK7`, `FC`, `SS`, `DIL`, `non-warr`, `NOO`, `STR`), and colloquial equivalences ("20% down" ⇄ 80% LTV; "no ratio" ⇄ DSCR without ratio floor; "stated income" maps to the closest supported alt-doc with an explicit note). Lender names get fuzzy (Levenshtein) matching with a "did you mean" path; a lender-shaped name matching nothing in the catalog forces the "not in your library" answer.

### Tools (src/domain/chat/tools.ts)

Small, tight, deterministic — no general SQL access, all over the caller's own catalog value:

| Tool | Purpose |
|---|---|
| `searchPrograms` | filtered availability; conjunctive cross-classification (ITIN+DSCR requires the dedicated flag); soft criteria split into confirmed vs **unconfirmed** (field unpopulated — reported, never silently dropped) |
| `rankProgramsByMetric` | server-side extremum + ordered rows + tie set + unpopulated list; `min_down_payment` is a projection of the LTV matrix via the matcher's own `deriveMaxLtv` |
| `getProgramDetail` / `lookupMatrixCell` | one program's facts; matrix cell via `deriveMaxLtv` (no forked math) |
| `queryRules` | active (human-verified, effective) rules only |
| `quickEvaluate` | partial-scenario triage reusing `analyzeScenario` — missing fields are unknown, never assumed favorable |
| `searchGuidelines` | keyword search over guideline text fields + rule explanations, with citations |
| `searchHelp` / `defineTerm` | curated help corpus + glossary (`src/domain/chat/helpCorpus.ts`) |
| `createScenarioDraftLink` | prefilled deep link into `/scenarios/new` |

### Answer contract

Every reply is a schema-validated `ChatAnswer` (`chatAnswerSchema` in `src/lib/ai/chatPipeline.ts`): `answer` (1–2 sentence direct finding), `answered` (false = explicit non-answer, also a success case), `rows[]` (lender · program · value · gating conditions · version/effective date · sample badge), `assumptions[]`, `caveats[]` (including "what would change the answer"), `sources[]`, `followUps[]`, `cta`, at most one `clarifyingQuestion`, and `toolActivity` for the UI indicator + logging.

### Schema additions (spec §5)

New optional, admin-populated `Program` fields (undefined = "not captured" — the chatbot says so rather than inferring): `mortgageLateTolerance` (structured NxDDxM tolerance with LTV/FICO adjustments), `creditEventSeasoning` (per event type, discharge vs filing separated), `exceptionPolicy` (`none`/`case_by_case`/`documented_program` + notes + AE contact), `estimatedTurnTimes` (ranges, always displayed as estimates with last-updated date). `min_down_payment` is exposed as a ranked projection of the LTV matrix rather than a stored field.

## Prompt versioning

Prompts live under `prompts/chatbot/` as versioned files. `PROMPT_VERSION` (currently `chatbot-narration-v2.0.0`) is recorded on every logged turn. Any prompt edit requires a version bump and a passing eval suite.

## Logging & the feedback flywheel

Every turn logs (console, structured): prompt version, intent, confidence, guardrail flag, tools called with row counts, answered flag, narration usage, latency, model. Raw question text is **not** in the turn log (it may contain borrower identifiers).

Every non-answer and every thumbs-down inserts into `assistant_questions` (see `supabase/assistant-questions.sql` — org-scoped RLS), surfaced at **Admin → Assistant Questions**, so the people who maintain the guideline library fill the gaps the assistant hit. This is how precision improves as the library grows.

## Evaluation harness (`evals/chatbot/`)

Runs in CI (vitest, deterministic — narration disabled):

- **Golden set** (`fixtures.ts`, 60+ questions incl. 10 unanswerable + 10 typo/shorthand): intent accuracy ≥ 95% (aggregate), per-fixture answered/refusal correctness, expected key facts, answer-contract completeness, latency budget.
- **Grounding / hallucinated entities**: every lender named in any reply must exist in the catalog — rate must be 0 (hard failure otherwise).
- **Hallucination traps** (`hallucinationTraps.test.ts`): questions about nonexistent lenders must get "not in your library," never an invented answer; misspelled real lenders get "did you mean."
- **Prompt injection** (`promptInjection.test.ts`): poisoned guideline notes ("ignore previous instructions," "print your system prompt") never steer output; the narration grounding guard rejects invented lenders/numbers, approval language, and injected instructions.
- **Tenant isolation** (`tenantIsolation.test.ts`): identical questions against Org A's and Org B's catalogs return only the asking org's lenders.

Current results: all suites pass (85 eval tests; intent accuracy 100% on the golden set; refusal rate 100%; hallucinated entities 0).

Run locally: `npx vitest run evals/chatbot`.

## Known deferrals

- Token streaming: the deterministic pipeline returns in tens of milliseconds, so the UI shows a tool-activity label rather than a token stream; streaming becomes worthwhile if narration grows.
- Scenario-page context prefill ("opened from a scenario") — the pipeline accepts prior-message entity merging; wiring page context in is a small follow-up.
- Admin editors for the new §5 fields — fields are live in the schema/tools; editing UI follows the existing lender-admin patterns.
