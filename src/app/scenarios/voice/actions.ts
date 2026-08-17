"use server";

import { createScenario, type CreateScenarioState } from "../new/actions";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import type { VoiceExtraction } from "@/domain/voice/slots";
import { getRepository, tryGetCurrentOrganizationId } from "@/lib/session";
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
  // Must NOT redirect: this action fires the instant /scenarios/voice
  // mounts and that page is now the default post-login landing (signIn
  // always redirects there), so a redirect here for a signed-in
  // membership-less account — e.g. one whose memberships row was removed,
  // or a beta account the provisioning trigger never created one for —
  // turned login into an unbreakable /login ⇄ /scenarios/voice cycle.
  // Same root-cause class as b2fea1b: non-critical paths must never
  // redirect. Try-var resolves the org or null (no redirect/throw); the
  // client already null-handles a failed catalog fetch and simply hides
  // the live rankings panel — an empty catalog degrades identically.
  const org = await tryGetCurrentOrganizationId();
  if (!org) {
    return { lenders: [], programs: [], rules: [] };
  }
  const repo = await getRepository();
  return repo.getCatalog(org);
}
