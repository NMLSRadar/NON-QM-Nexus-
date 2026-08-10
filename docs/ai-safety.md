# AI Safety

## The boundary

**Deterministic first, AI second.** The pipeline in `src/domain/analyze.ts` contains no AI. The AI layer (`src/lib/ai`) receives *finished* deterministic results as read-only facts and produces explanations, summaries, needs-list prose, comparisons, and draft rules — never numbers that feed back into eligibility.

Structurally enforced:
1. `src/domain` has no import path to `src/lib/ai`.
2. AI-drafted rules are created with `verificationStatus: "ai_extracted_pending_review"`, and `selectActiveRules` only ever runs `human_verified` rules — an AI rule cannot activate without a human publishing it.
3. Machine-consumed AI output must parse against a Zod schema (`parseStructured`); anything else is rejected.

## Prompt-injection defenses

Uploaded documents, borrower notes, and any user-entered free text are untrusted:

- Untrusted content is wrapped in `<untrusted_data>` envelopes (`asUntrustedData`) with tag-collision escaping, and never concatenated into the instruction section.
- The system preamble (`AI_SYSTEM_PREAMBLE`) instructs the model to treat envelope contents as data, never follow instructions inside them, never reveal the system prompt or secrets, and never contradict supplied deterministic facts.
- No tools are exposed to the model from this layer.
- Responses destined for machines are schema-validated; free-text responses are labeled as AI-generated in the UI and require user acceptance before inclusion in any artifact.

## Data-sharing preconditions

Sensitive documents are not sent to any AI provider unless **all** of: the integration is enabled by feature flag, the organization has authorized it, data-processing terms with the provider are configured, the user sees a clear disclosure, logging excludes sensitive content, and the provider's retention settings are documented.

## Audit trail

Every AI call records (see `ai_requests` in the schema): prompt version, provider + model, deterministic facts supplied, response, timestamp, user, scenario, and whether the user accepted or edited the output.

## Provider abstraction

`getAiProvider()` selects Anthropic or OpenAI from `AI_PROVIDER`; keys come from server-side env only. Provider-specific code stays behind the `AiProvider` interface; prompts live in version-controlled source files.

## Chatbot exception-language rules (Part 2)

The chatbot's exception guidance (`exception_guidance` intent) has hard language
rules enforced by the prompt, the deterministic renderer, and the eval suite:

- **Never state or imply a named lender will grant an exception.** Allowed:
  "considers exceptions" / "has a documented exception process." Forbidden:
  "will approve," "should be fine," "they'll do it."
- **Exceptions are always conditioned on compensating factors** — reserves well
  past the requirement, LTV meaningfully under the cap, low DTI, clean housing
  history. No exception is ever presented as granted on the ask alone.
- **No pricing figures, ever.** Directional language only (tighter guidelines
  generally correlate with better pricing), with the volatility caveat. No rate,
  point, or price figure.
- These rules are asserted in the eval suite (`evals/chatbot/golden.ts` g33–g36)
  and fail the build if any response contains a price figure or an approval
  promise.

## Editorial vs guideline separation

`lender_flexibility_profiles` (see `docs/lender-posture.md`) is **editorial
metadata, not guideline data**. Structurally enforced:

- Posture rows are tagged `sourceType: 'editorial'` and may never appear in a
  guideline citation block, a rule result, or the source panel.
- Posture is **never a scoring input** — the matching engine does not read these
  tables, so posture cannot change a match status or score by construction.
- A guideline question about a real lender with no verified guidelines loaded is
  answered "no verified guidelines in the library yet," never inferred from
  posture.
- The editorial disclaimer (*"Internal guidance based on market experience — not
  a lender guideline or commitment"*) is attached to every posture-sourced
  answer, distinct from the sample-data disclaimer.
