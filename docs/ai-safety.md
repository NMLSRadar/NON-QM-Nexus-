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
