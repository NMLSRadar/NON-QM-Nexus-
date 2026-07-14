"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { scenarioInputSchema, type ScenarioInput } from "@/domain/validation/scenarioSchema";
import { getCurrentOrganizationId, getRepository } from "@/lib/store";
import type { Scenario } from "@/domain/types/scenario";

export interface CreateScenarioState {
  errors?: Record<string, string[]>;
  message?: string;
}

/**
 * Server action: validate the questionnaire payload with the shared Zod schema
 * and persist the scenario. The organization ID always comes from the server
 * session (never from the client) to preserve tenant isolation.
 */
export async function createScenario(payload: ScenarioInput): Promise<CreateScenarioState> {
  const parsed = scenarioInputSchema.safeParse(payload);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]>, message: "Please correct the highlighted fields." };
  }

  const org = getCurrentOrganizationId();
  const now = new Date().toISOString();
  const scenario: Scenario = {
    ...parsed.data,
    id: `scn_${randomUUID().slice(0, 8)}`,
    organizationId: org,
    createdByUserId: "user_demo_broker",
    createdAt: now,
    updatedAt: now,
  };

  await getRepository().saveScenario(scenario);
  redirect(`/scenarios/${scenario.id}`);
}
