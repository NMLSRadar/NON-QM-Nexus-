# Chatbot — NON-QM Nexus AI Assistant

The assistant is a **supplemental guidance layer**: it takes ad-hoc, loosely worded
questions from mortgage professionals and returns the most accurate available
direction, fast. It is not an underwriter and not a replacement for the full
scenario analysis flow — when a question needs the full engine, its best answer
is a short, correct answer plus a link into the scenario builder.

## Architecture: intent router + tools, not one big prompt

The assistant is a **two-stage pipeline**. There is no single-prompt free-text
implementation anymore.

### Stage A — normalize and classify (deterministic)

- `src/domain/chat/normalize.ts` — typo/speech-to-text dictionary, shorthand
  (`2x30x12`, `BK7`, `PPP`, `IO`, `non-warr`, …), and colloquial equivalences
  ("20% down" ⇄ 80% LTV). Version-controlled, not inline in a prompt.
- `src/domain/chat/intents.ts` — intent classifier with guardrail precedence
  (out-of-scope → definition → process → exception → navigation → comparison →
  program-detail → pricing → superlative → threshold → availability → scenario).
- `src/domain/chat/parse.ts` — produces the `ParsedQuery` (entities, target
  metric, direction, missing critical fields).

### Tool layer (deterministic, tenant-scoped)

`src/domain/chat/tools.ts` operates on the caller's **tier-gated catalog** — the
route passes it in, so a tool can never return a row the org can't see. No
general SQL access. Tools: `rank_programs_by_metric` (extremum + ties),
`search_programs`, `get_program_detail`, `lookup_matrix_cell`, `query_rules`,
`quick_evaluate` (reuses the real matcher), `search_help`,
`create_scenario_draft`.

### Stage B — grounded narration

`src/lib/ai/chatbot/orchestrate.ts` runs the tools, then either renders a
deterministic answer from the results (CI-safe, always grounded) or hands the
results to the LLM to narrate — with a hard grounding + prompt-injection
`safetyCheck`. Any narration that invents a row, leaks, or echoes an injected
instruction is discarded in favor of the deterministic fallback. **The final
reply is always grounded by construction.**

## Intents

`superlative_lookup` · `availability_lookup` · `threshold_lookup` ·
`scenario_triage` · `program_detail` · `comparison` · `exception_guidance` ·
`process_help` · `definition` · `app_navigation` · `out_of_scope`

## Answer contract

Every response is Zod-validated (`src/lib/ai/chatbot/answerSchema.ts`):
`answer`, `rows[]`, `assumptions[]`, `caveats[]`, `sources[]`, `followUps[]`,
`cta?`, `answered`, `nonAnswer?`, `editorial?`. The widget renders it as real UI
components (evidence table, sources drawer, follow-up chips, CTA), never as
markdown.

## Prompt versioning

- Prompt: `prompts/chatbot/narrate.md` (Stage B narration).
- `PROMPT_VERSION` constant (`src/lib/ai/chatbot/orchestrate.ts`) is logged on
  every turn via the `ai_requests` table.

## Eval harness

`evals/chatbot/` runs in CI (`npm run test:chatbot`) against a controlled seed
catalog — no LLM, no API keys. Metrics: intent accuracy ≥ 95%, grounding 100%,
correct-refusal 100%, hallucinated-entity rate 0, completeness 100%. See
`evals/chatbot/README.md`.

**LLM narration tier** (`npm run eval:chatbot:llm`): the deterministic suite
can't exercise Stage B narration (the path that can hallucinate), so a
separately-triggered script runs ~12 fixtures through the **actual configured
provider** and asserts: no lender/program outside tool output, no price figures,
no approval language, and that prompt-injection embedded in guideline data is
discarded. It is not part of the default test run (needs an API key + spends
tokens) and prints SKIPPED when no provider is configured.

## Logging, feedback, and the unanswered-questions queue

- Every turn is logged to `ai_requests` (intent, tools, row counts, prompt
  version, provider, whether deterministic).
- Thumbs up/down post to `POST /api/assistant/feedback`.
- Every thumbs-down and every non-answer lands in `chat_unanswered_questions`
  — the flywheel that feeds gaps back to the admins who maintain the guideline
  library.

## Current eval results

68-fixture golden set (10 unanswerable + 10 typo/shorthand). Verified green:
intent accuracy 1.0, grounding 1.0, correct-refusal 1.0, hallucination 0,
completeness 1.0.