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

## The assistant chatbot (2026-08-10 precision upgrade)

The site chatbot no longer sends a free-text prompt and trusts the reply. It runs a two-stage pipeline (see `docs/chatbot.md`):

- **Stage A** (intent/entity parsing) and **Stage B** (answer composition from tool calls) are fully deterministic — no model computes an eligibility number or recalls a lender fact. Superlatives are ranked in the domain layer with tie sets.
- The LLM's only job is **rephrasing the one-line answer prose for tone**. Its output is discarded unless it passes `verifyNarrationGrounding` (no lender names or numbers absent from the tool results; no approval/pricing language) — a hallucination cannot reach the user.
- Tenant scoping is structural: the pipeline receives only the caller's tier-gated catalog from `repo.getCatalog(org)`.
- Guardrails decline misrepresentation framing (with the legitimate alternative), protected-class reasoning, legal/tax advice, and rate/pricing claims.
- The eval suite (`evals/chatbot/`) enforces grounding, zero hallucinated entities, correct refusals, prompt-injection resistance, and tenant isolation in CI; prompt files are versioned (`prompts/chatbot/`, `PROMPT_VERSION` logged per turn).

## Editorial posture vs. guidelines; exception language (Part 2)

The lender-posture layer (`docs/lender-posture.md`) is editorial market-experience data about real lenders. Safety rules, all enforced by tests:

- **Separation**: posture never appears in a guideline citation block, rule result, or sources drawer (chat rows are tagged `sourceType: 'editorial'` and excluded from sources); `src/domain/matching|rules|calc` and `analyze.ts` have no import path to it, and flipping posture leaves every rule outcome and match score identical (`tests/domain/postureIsolation.test.ts`).
- **Exception language**: "considers exceptions" / "documented exception process" — never "will approve," "should be fine," or any approval probability. Approval questions get a decline plus the compensating-factors framing. Exception answers always state that compensating factors are the condition, and the assessment engine's output is file strength, never approval likelihood.
- **Pricing**: no rate/point/price figures anywhere from this layer — the directional guideline-tightness explainer only, with the volatility caveat; lenders are never ranked by price.
- **Real-lender accuracy bar**: a guideline claim about a real lender requires a loaded, verified guideline version. Posture metadata is not that — with no verified guidelines, the answer is "not in your library yet" plus the labeled posture note.
- Every posture surface carries the editorial disclaimer + `lastReviewedAt`; stale profiles (>180 days) are flagged; posture-carried answers are logged distinctly (`postureSourced`).

## Provider abstraction

`getAiProvider()` selects Anthropic or OpenAI from `AI_PROVIDER`; keys come from server-side env only. Provider-specific code stays behind the `AiProvider` interface; prompts live in version-controlled source files.
