"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";
import type { GuidelinePosture, PricingTendency } from "@/domain/lenderPosture";

/**
 * Upsert an org's editorial lender-posture profile (chatbot Part 2). Written to
 * the platform catalog organization so every subscriber org inherits it via
 * Repository.listLenderFlexibilityProfiles's platform-org fallback. Editorial
 * metadata only — never a guideline, never a scoring input.
 */
export async function upsertPostureProfile(input: {
  lenderId: string;
  posture: GuidelinePosture;
  pricingTendency: PricingTendency;
  exceptionsConsidered: boolean;
  exceptionChannel?: string;
  postureNotes?: string;
  isVerified?: boolean;
}): Promise<void> {
  const { supabase, userId } = await requirePlatformAdmin();
  const org = PLATFORM_CATALOG_ORGANIZATION_ID;

  const { data: existing, error: readError } = await supabase
    .from("lender_flexibility_profiles")
    .select("id")
    .eq("organization_id", org)
    .eq("lender_id", input.lenderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const payload = {
    organization_id: org,
    lender_id: input.lenderId,
    posture: input.posture,
    posture_notes: input.postureNotes ?? null,
    pricing_tendency: input.pricingTendency,
    exceptions_considered: input.exceptionsConsidered,
    exception_channel: input.exceptionChannel ?? null,
    is_verified: input.isVerified ?? false,
    updated_by: userId,
  };

  if (existing) {
    const { error } = await supabase.from("lender_flexibility_profiles").update(payload).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("lender_flexibility_profiles").insert({ ...payload, created_by: userId });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/admin/lender-posture");
}

/** Mark a profile's lastReviewedAt = now (review cadence). */
export async function markPostureReviewed(profileId: string): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase
    .from("lender_flexibility_profiles")
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/lender-posture");
}

/** Soft-delete a posture profile (revert to platform default). */
export async function deletePostureProfile(profileId: string): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase
    .from("lender_flexibility_profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/lender-posture");
}