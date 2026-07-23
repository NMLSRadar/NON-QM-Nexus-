"use server";

import { createScenario, type CreateScenarioState } from "../new/actions";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import type { VoiceExtraction } from "@/domain/voice/slots";

/**
 * Server action for voice intake. The client sends its extraction (including
 * any manual edits); the server re-assesses it independently — defense in
 * depth, since completeness and derivations must not be client-asserted —
 * then reuses the existing createScenario action, which validates against the
 * shared Zod schema, assigns the organization from the server session, saves,
 * and redirects to the ranked results page (best option first).
 */
export async function createScenarioFromVoice(extraction: VoiceExtraction): Promise<CreateScenarioState> {
  const assessment = assess(extraction);
  if (!assessment.complete) {
    return { message: `Still missing: ${assessment.missing.join(", ")}. ${assessment.questions.slice(0, 2).join(" ")}` };
  }
  return createScenario(buildScenarioInput(extraction, assessment));
}
