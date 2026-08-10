import { z } from "zod";
import type { ProgramCatalog } from "@/domain/analyze";
import { composeAnswer, type ChatAnswer } from "@/domain/chat/answer";
import { parseChatQuery, type ParseOptions } from "@/domain/chat/parse";
import type { ParsedQuery } from "@/domain/chat/types";
import type { LenderFlexibilityProfile } from "@/domain/lenderPosture";
import { NARRATION_SYSTEM_PROMPT, PROMPT_VERSION } from "../../../prompts/chatbot/narration.v2.0";
import { asUntrustedData, getAiProvider } from "./provider";

/**
 * Chatbot Stage A + Stage B pipeline (2026-08-10 precision upgrade).
 *
 *  Stage A — parseChatQuery: deterministic normalize/classify (no model).
 *  Stage B — composeAnswer: intent-routed tool calls against the caller's
 *    tier-gated catalog; superlatives/thresholds computed in the domain
 *    layer with tie sets; the answer object is grounded by construction.
 *  Narration — OPTIONAL LLM pass that may rephrase the one-line `answer`
 *    prose for tone. Its output is discarded unless it survives
 *    verifyNarrationGrounding, so a hallucinated lender/number can never
 *    reach the user. With no provider configured the deterministic prose
 *    ships as-is — the pipeline never depends on a model to be correct.
 */

export { PROMPT_VERSION };

/** Answer-contract schema — the route validates every outgoing answer. */
export const chatAnswerSchema = z.object({
  answer: z.string().min(1),
  answered: z.boolean(),
  rows: z.array(
    z.object({
      lenderName: z.string(),
      programName: z.string(),
      programId: z.string(),
      value: z.string().optional(),
      gatingConditions: z.array(z.string()),
      guidelineVersion: z.string(),
      effectiveDate: z.string(),
      isSampleData: z.boolean(),
      caveats: z.array(z.string()),
      posture: z.enum(["exception_based", "moderate", "rigid"]).optional(),
      postureLabel: z.string().optional(),
      sourceType: z.enum(["editorial", "guideline"]).optional(),
    })
  ),
  assumptions: z.array(z.string()),
  caveats: z.array(z.string()),
  sources: z.array(
    z.object({
      lenderName: z.string(),
      programName: z.string(),
      guidelineVersion: z.string(),
      effectiveDate: z.string(),
      lastVerifiedDate: z.string().optional(),
      sourceCitation: z.string(),
    })
  ),
  followUps: z.array(z.string()),
  cta: z.object({ label: z.string(), url: z.string() }).optional(),
  clarifyingQuestion: z.string().optional(),
  toolActivity: z.array(z.object({ tool: z.string(), rowCount: z.number() })),
});

/**
 * Grounding guard for the narration pass: every capitalized multi-word name
 * and every number in the candidate text must already exist in the
 * deterministic answer (rows, sources, or original prose). Fails closed.
 */
export function verifyNarrationGrounding(candidate: string, deterministic: ChatAnswer): boolean {
  const allowedText = [
    deterministic.answer,
    ...deterministic.rows.flatMap((r) => [r.lenderName, r.programName, r.value ?? "", ...r.gatingConditions, ...r.caveats]),
    ...deterministic.sources.map((s) => `${s.lenderName} ${s.programName} ${s.guidelineVersion} ${s.effectiveDate}`),
    ...deterministic.assumptions,
    ...deterministic.caveats,
  ]
    .join(" ")
    .toLowerCase();

  // Numbers: every numeric token in the narration must appear in allowed text.
  const numbers = candidate.match(/\d[\d,.]*/g) ?? [];
  for (const n of numbers) {
    if (!allowedText.includes(n.toLowerCase())) return false;
  }
  // Proper-name shaped tokens (two+ consecutive capitalized words): must be known.
  const nameLike = candidate.match(/\b([A-Z][a-zA-Z&'-]+(?:\s+[A-Z][a-zA-Z&'()-]+)+)\b/g) ?? [];
  for (const name of nameLike) {
    if (!allowedText.includes(name.toLowerCase())) return false;
  }
  // Approval / pricing language is never allowed regardless of grounding.
  if (/approved|guarantee|will qualify|interest rate of|\brate is\b/i.test(candidate)) return false;
  return true;
}

export interface ChatTurnLog {
  promptVersion: string;
  intent: string;
  confidence: number;
  guardrailFlag?: string;
  toolsCalled: Array<{ tool: string; rowCount: number }>;
  answered: boolean;
  narrationUsed: boolean;
  /** true when editorial posture data carried part of the answer — logged
   * distinctly so admins can see how often editorial data is load-bearing. */
  postureSourced: boolean;
  latencyMs: number;
  model?: string;
}

export interface ChatPipelineResult {
  answer: ChatAnswer;
  parsed: ParsedQuery;
  log: ChatTurnLog;
}

/**
 * Run the full pipeline for one user question. `catalog` must already be the
 * caller's own tier-gated catalog — tenant scoping is the caller's job and
 * happens before any of this runs.
 */
export async function runChatPipeline(
  question: string,
  catalog: ProgramCatalog,
  opts: { enableNarration?: boolean; priorUserMessages?: string[]; postureProfiles?: LenderFlexibilityProfile[] } = {}
): Promise<ChatPipelineResult> {
  const started = Date.now();
  // "(Sample)" suffixes are display labels, not part of the name a user
  // would type — strip them for matching; the search filter still resolves
  // the stripped name back to the full lender record by substring.
  const parseOpts: ParseOptions = {
    knownLenderNames: catalog.lenders.filter((l) => l.active).map((l) => l.name.replace(/\s*\((sample|demo)\)\s*$/i, "")),
  };
  const parsed = parseChatQuery(question, parseOpts);

  // Scenario memory: facts stated earlier in the conversation carry forward
  // (never re-asked). Earlier turns only FILL missing entity slots — the
  // latest message always wins on conflict.
  for (const prior of [...(opts.priorUserMessages ?? [])].reverse()) {
    const prevEntities = parseChatQuery(prior, parseOpts).entities;
    for (const [key, value] of Object.entries(prevEntities)) {
      if (value == null) continue;
      const k = key as keyof typeof parsed.entities;
      if (parsed.entities[k] == null) (parsed.entities as Record<string, unknown>)[k] = value;
    }
  }

  const deterministic = composeAnswer(parsed, catalog, { postureProfiles: opts.postureProfiles });

  let answer = deterministic;
  let narrationUsed = false;
  let model: string | undefined;

  const wantNarration = opts.enableNarration !== false && process.env.CHATBOT_NARRATION !== "off" && deterministic.answered;
  if (wantNarration && (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)) {
    try {
      const provider = getAiProvider();
      model = provider.name;
      const rowsJson = JSON.stringify({ rows: deterministic.rows, assumptions: deterministic.assumptions, caveats: deterministic.caveats });
      const candidate = await provider.complete({
        messages: [
          { role: "system", content: NARRATION_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Draft answer: ${deterministic.answer}\n\n${asUntrustedData("result_rows", rowsJson)}`,
          },
        ],
        maxTokens: 200,
        temperature: 0.3,
      });
      const trimmed = candidate.trim();
      if (trimmed && verifyNarrationGrounding(trimmed, deterministic)) {
        answer = { ...deterministic, answer: trimmed };
        narrationUsed = true;
      }
    } catch {
      // Narration is a garnish — any failure falls back to deterministic prose.
    }
  }

  const postureSourced =
    answer.rows.some((r) => r.posture != null || r.sourceType === "editorial") ||
    answer.caveats.some((c) => c.includes("editorial") || c.includes("market experience"));

  const log: ChatTurnLog = {
    promptVersion: PROMPT_VERSION,
    intent: parsed.intent,
    confidence: parsed.confidence,
    guardrailFlag: parsed.guardrailFlag,
    toolsCalled: answer.toolActivity,
    answered: answer.answered,
    narrationUsed,
    postureSourced,
    latencyMs: Date.now() - started,
    model,
  };

  return { answer: chatAnswerSchema.parse(answer), parsed, log };
}
