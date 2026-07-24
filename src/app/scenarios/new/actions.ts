"use server";

import { randomUUID } from "node:crypto";
import { scenarioInputSchema, friendlyValidationMessage, type ScenarioInput } from "@/domain/validation/scenarioSchema";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Scenario } from "@/domain/types/scenario";

export interface CreateScenarioState {
  errors?: Record<string, string[]>;
  message?: string;
  /** Set on success — the client navigates here itself via useRouter().
   * Deliberately NOT calling next/navigation's redirect() here: this action
   * is invoked as a plain awaited function call from a client component
   * (not bound to a <form action={...}> prop), and in that calling shape
   * the special NEXT_REDIRECT exception reaches the caller as a normal
   * thrown error instead of being auto-handled into a navigation by the
   * framework. Returning the path and navigating explicitly on the client
   * is the reliable, version-independent fix for that gap. */
  redirectTo?: string;
}

/**
 * Server action: validate the questionnaire payload with the shared Zod schema
 * and persist the scenario. The organization ID always comes from the server
 * session (never from the client) to preserve tenant isolation.
 */
export async function createScenario(payload: ScenarioInput): Promise<CreateScenarioState> {
  const parsed = scenarioInputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      message: friendlyValidationMessage(parsed.error.issues),
    };
  }

  const org = await getCurrentOrganizationId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { message: "Your session expired. Please sign in again." };
  }

  const now = new Date().toISOString();
  const scenario: Scenario = {
    ...parsed.data,
    id: randomUUID(),
    organizationId: org,
    createdByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  };

  const repo = await getRepository();
  await repo.saveScenario(scenario);
  return { redirectTo: `/scenarios/${scenario.id}` };
}
