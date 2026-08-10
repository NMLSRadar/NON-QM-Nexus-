"use server";

import { requirePlatformAdmin } from "@/lib/admin";
import type { GuidelinePosture, PricingTendency } from "@/domain/lenderPosture";

/**
 * Platform-level posture maintenance (organization_id NULL rows — the
 * defaults every org inherits until it writes its own override). Org-level
 * overrides use the same table with organization_id set, written under
 * org-admin RLS. Editorial data only: nothing here can touch eligibility.
 */
export async function upsertPostureDefault(input: {
  canonicalName: string;
  posture: GuidelinePosture;
  pricingTendency: PricingTendency;
  postureNotes: string;
  exceptionsConsidered: boolean;
  exceptionChannel?: string;
  aliases: string[];
  markReviewed: boolean;
}): Promise<void> {
  const { supabase, userId } = await requirePlatformAdmin();
  const { data: existing } = await supabase
    .from("lender_flexibility_profiles")
    .select("id")
    .is("organization_id", null)
    .ilike("canonical_name", input.canonicalName)
    .is("deleted_at", null)
    .maybeSingle();

  const values = {
    canonical_name: input.canonicalName,
    aliases: input.aliases,
    posture: input.posture,
    posture_notes: input.postureNotes,
    pricing_tendency: input.pricingTendency,
    exceptions_considered: input.exceptionsConsidered,
    exception_channel: input.exceptionChannel ?? null,
    source: "org_editorial",
    updated_by: userId,
    updated_at: new Date().toISOString(),
    ...(input.markReviewed ? { last_reviewed_at: new Date().toISOString().slice(0, 10) } : {}),
  };

  const { error } = existing
    ? await supabase.from("lender_flexibility_profiles").update(values).eq("id", existing.id)
    : await supabase
        .from("lender_flexibility_profiles")
        .insert({ ...values, organization_id: null, created_by: userId, last_reviewed_at: new Date().toISOString().slice(0, 10) });
  if (error) throw new Error(error.message);
}

