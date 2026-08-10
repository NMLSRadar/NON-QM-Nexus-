"use server";

import { createScenario, type CreateScenarioState } from "../new/actions";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import type { VoiceExtraction } from "@/domain/voice/slots";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import type { ProgramCatalog } from "@/domain/analyze";

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
  return createScenario(buildScenarioInput(extraction, assessment), { extraActivity: "voice_scenario" });
}

/**
 * Fetches the signed-in user's real, tier-gated lender/program/rule
 * catalog ONCE so the client can run the same deterministic
 * analyzeScenario() function locally (no network round-trip) on every
 * transcript update — powering the live-reordering lender rankings panel
 * while the borrower is still speaking. This is the exact same
 * repo.getCatalog() call the scenario detail page already makes after
 * submission; moving it here just lets the client preview rankings
 * before the scenario is saved. No write, no scenario is created here.
 */
export async function getVoiceCatalog(): Promise<ProgramCatalog> {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  return repo.getCatalog(org);
}
