"use server";

import { revalidatePath } from "next/cache";
import { requireOrgOrPlatformAdmin } from "@/lib/orgOrPlatformAdmin";
import type { GuidelinePosture, PricingTendency } from "@/domain/lenderPosture";

/**
 * Upsert an org's editorial lender-posture profile (chatbot Part 2).
 * Written to the caller's scope: platform admin → the shared platform catalog
 * org (inherited by every subscriber org); org admin → their own org's override.
 * Editorial metadata only — never a guideline, never a scoring input.
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
  const { supabase, userId, scope } = await requireOrgOrPlatformAdmin();
  const org = scope.organizationId;

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
  const { supabase } = await requireOrgOrPlatformAdmin();
  const { error } = await supabase
    .from("lender_flexibility_profiles")
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/lender-posture");
}

/** Soft-delete a posture profile. */
export async function deletePostureProfile(profileId: string): Promise<void> {
  const { supabase } = await requireOrgOrPlatformAdmin();
  const { error } = await supabase
    .from("lender_flexibility_profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/lender-posture");
}