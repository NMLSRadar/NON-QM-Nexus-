# Chatbot eval harness

Precision gate for the NON-QM Nexus AI assistant chatbot. Runs in CI (`npm run
test:chatbot`) against a controlled seed catalog — **no LLM and no API keys
needed**, because the suite grades the deterministic pipeline (Stage A parser →
tool layer → grounded answer), which is what the precision guarantees actually
rest on.

## Files

| File | Purpose |
|---|---|
| `golden.ts` | The golden set — **68 fixtures** (≥60 required): the acceptance corpus from the spec, **10 deliberately unanswerable**, **10 with typos/shorthand**, plus Part-2 exception/pricing cases. Each fixture carries `expectedIntent`, `answered`, and `mustContain` / `mustNotContain` assertions. |
| `seed.ts` | Controlled, realistic NON-QM catalog (fictional lenders/programs/rules) the fixtures are graded against. |
| `evalRunner.ts` | Graded runner — executes each fixture through `runChatAssistant` (deterministic path) and scores intent, grounding, correct-refusal, hallucination, and completeness. |
| `chatbotEval.test.ts` | Vitest suite that asserts every metric target and fails the build on any regression. |

## Metrics (spec §7)

| Metric | Target | Enforced |
|---|---|---|
| Intent accuracy | ≥ 95% | `expectedIntent` === parsed intent |
| Grounding rate | 100% | every `rows[].programId` traces to a tool result |
| Correct-refusal rate | 100% | every `answered:false` fixture gets a `false` reply |
| Hallucinated-entity rate | 0 | no forbidden entity/price substring, no invented programId |
| Completeness | 100% | answered fixtures carry a non-empty answer |

The `chatOrchestrate.test.ts` suite (in `tests/domain/`) adds the adversarial
layers that can't be expressed as data fixtures: the **hallucination trap**
(an LLM narration inventing a lender is rejected and falls back to a grounded
answer), the **prompt-injection** guard (leak/imperative phrasing is discarded),
and the **tenant-isolation** check (Org B never sees Org A's programs).

## Running

```bash
npm run test:chatbot      # the full gate (eval + chat domain tests)
npx vitest run evals/chatbot/chatbotEval.test.ts   # just the graded suite
```

## Adding a fixture

Add to `GOLDEN_SET` in `golden.ts`. Set `expectedIntent` and `answered` to what
the *correct* behavior is, and `mustNotContain` for anything that must never
appear (hallucination guard). The runner grades it automatically.

## Prompt / code changes

Any change to the Stage A parser, the tool layer, the orchestrator, or the
narration prompt must keep this suite green — the CI step named **"Chatbot eval
gate (precision)"** blocks the build on any grounding, hallucination, or
tenant-isolation regression.