import { z } from "zod";
import { AI_SYSTEM_PREAMBLE, asUntrustedData, getAiProvider, parseStructured } from "./provider";
import type { VoiceExtraction } from "@/domain/voice/slots";

/**
 * OPTIONAL AI-assisted transcript extraction for voice intake.
 *
 * The deterministic extractor (src/domain/voice/extract.ts) runs first and
 * needs no AI. This helper can supplement it for phrasings the deterministic
 * parser misses. Product-principle guardrails:
 *  - The transcript is passed as delimited UNTRUSTED DATA, never instructions.
 *  - Output must be valid JSON matching the schema below; anything else is
 *    rejected by parseStructured.
 *  - Every AI-captured field is marked `inferred` with an explicit
 *    "confirm before use" source, and the UI requires user confirmation
 *    before analysis — AI never feeds the deterministic engine silently.
 *  - Not wired into the demo UI by default; enable by configuring an AI
 *    provider (see docs/ai-safety.md).
 */

const aiExtractionSchema = z.object({
  loanPurpose: z.enum(["purchase", "rate_term_refinance", "cash_out_refinance"]).optional(),
  occupancy: z.enum(["primary", "second_home", "investment"]).optional(),
  propertyType: z
    .enum(["single_family", "condo", "non_warrantable_condo", "townhome", "2_4_unit", "5_plus_unit", "pud", "manufactured", "rural", "condotel"])
    .optional(),
  propertyValue: z.number().min(25_000).optional(),
  loanAmount: z.number().min(10_000).optional(),
  ltv: z.number().min(5).max(100).optional(),
  fico: z.number().int().min(300).max(850).optional(),
  incomeDocType: z.enum(["full_doc", "bank_statement", "pnl_only", "dscr", "asset_depletion", "1099", "wvoe_only"]).optional(),
  bankStatementMonths: z.union([z.literal(12), z.literal(24)]).optional(),
  bankStatementKind: z.enum(["personal", "business"]).optional(),
});

type AiExtraction = z.infer<typeof aiExtractionSchema>;

const AI_SOURCE = "AI-assisted extraction — confirm before use";

const TASK = `Extract NON-QM mortgage scenario vitals from the voice transcript below.
Reply with VALID JSON ONLY (no prose, no markdown) using exactly these optional keys:
loanPurpose ("purchase" | "rate_term_refinance" | "cash_out_refinance"),
occupancy ("primary" | "second_home" | "investment"),
propertyType ("single_family" | "condo" | "non_warrantable_condo" | "townhome" | "2_4_unit" | "5_plus_unit" | "pud" | "manufactured" | "rural"),
propertyValue (number, USD), loanAmount (number, USD), ltv (number, percent),
fico (integer), incomeDocType ("full_doc" | "bank_statement" | "pnl_only" | "dscr" | "asset_depletion" | "1099" | "wvoe_only"),
bankStatementMonths (12 | 24), bankStatementKind ("personal" | "business").
Omit any key the transcript does not clearly state. Never guess numbers.`;

/**
 * Returns a partial VoiceExtraction with every field marked inferred and
 * sourced as AI-assisted. Merge it UNDER user review (mergeExtractions), never
 * silently. Throws if no provider is configured or output fails the schema.
 */
export async function aiExtractScenario(transcript: string): Promise<Partial<VoiceExtraction>> {
  const provider = getAiProvider();
  const raw = await provider.complete({
    messages: [
      { role: "system", content: AI_SYSTEM_PREAMBLE },
      { role: "user", content: `${TASK}\n\n${asUntrustedData("voice_transcript", transcript)}` },
    ],
    maxTokens: 400,
    temperature: 0,
  });
  const parsed: AiExtraction = parseStructured(raw, aiExtractionSchema);

  const out: Partial<VoiceExtraction> = { notesFragments: ["Some fields were captured by AI-assisted extraction and require confirmation."] };
  if (parsed.loanPurpose) out.loanPurpose = { value: parsed.loanPurpose, source: AI_SOURCE, inferred: true };
  if (parsed.occupancy) out.occupancy = { value: parsed.occupancy, source: AI_SOURCE, inferred: true };
  if (parsed.propertyType) out.propertyType = { value: parsed.propertyType, source: AI_SOURCE, inferred: true };
  if (parsed.propertyValue !== undefined) out.propertyValue = { value: parsed.propertyValue, source: AI_SOURCE, inferred: true };
  if (parsed.loanAmount !== undefined) out.loanAmount = { value: parsed.loanAmount, source: AI_SOURCE, inferred: true };
  if (parsed.ltv !== undefined) out.statedLtv = { value: parsed.ltv, source: AI_SOURCE, inferred: true };
  if (parsed.fico !== undefined) out.fico = { value: parsed.fico, source: AI_SOURCE, inferred: true };
  if (parsed.incomeDocType) out.incomeDocType = { value: parsed.incomeDocType, source: AI_SOURCE, inferred: true };
  if (parsed.bankStatementMonths) out.bankStatementMonths = parsed.bankStatementMonths;
  if (parsed.bankStatementKind) out.bankStatementKind = parsed.bankStatementKind;
  return out;
}
