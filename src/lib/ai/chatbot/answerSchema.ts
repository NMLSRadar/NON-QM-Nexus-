/**
 * Structured answer contract (chatbot precision spec §4).
 *
 * Every response is validated against this Zod schema before it reaches the
 * UI — the renderer never trusts free-form prose. An LLM narration that fails
 * the schema (or the grounding check) is discarded in favor of a deterministic
 * fallback built from the tool results.
 */

import { z } from "zod";

export const ForecastRowSchema = z.object({
  programId: z.string(),
  lenderName: z.string(),
  programName: z.string(),
  /** The value the question asked about, e.g. 20 for "min down payment". */
  value: z.number().nullable(),
  valueLabel: z.string().optional(),
  gating: z.array(z.string()).default([]),
  isSampleData: z.boolean().default(false),
  guidelineVersion: z.string().optional(),
  effectiveDate: z.string().optional(),
  lastVerifiedDate: z.string().optional(),
  fieldNotCaptured: z.boolean().default(false),
});

export const SourceRefSchema = z.object({
  lenderName: z.string(),
  programName: z.string(),
  guidelineVersion: z.string().optional(),
  effectiveDate: z.string().optional(),
  lastVerifiedDate: z.string().optional(),
  sourceCitation: z.string().optional(),
  isSampleData: z.boolean().default(false),
});

export const AssistantReplySchema = z.object({
  /** Direct answer, first line, one or two sentences. */
  answer: z.string(),
  /** Evidence table rows. Every programId must trace to a tool result. */
  rows: z.array(ForecastRowSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
  sources: z.array(SourceRefSchema).default([]),
  followUps: z.array(z.string()).max(4).default([]),
  cta: z
    .object({
      label: z.string(),
      href: z.string(),
    })
    .optional(),
  /** true when the question received a real, grounded answer. */
  answered: z.boolean(),
  /** Set only when answered === false — the honest non-answer. */
  nonAnswer: z.string().optional(),
  /** True when the answer leans on editorial posture data (labels it). */
  editorial: z.boolean().optional(),
});

export type ForecastRow = z.infer<typeof ForecastRowSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type AssistantReply = z.infer<typeof AssistantReplySchema>;

export const STANDING_DISCLAIMER =
  "Preliminary guidance only — verify the current guideline version before submission; final eligibility rests with the lender.";