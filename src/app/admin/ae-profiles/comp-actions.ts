"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

/** Admin comps a Featured Placement for a pilot AE without Stripe —
 * writes an ae_placements row (source='comped') and an audit_logs entry
 * recording who did it and why, matching the platform's existing
 * audit_logs schema (organization_id, actor_user_id, action, entity_type,
 * entity_id, metadata jsonb) rather than inventing a parallel shape. */
export async function compAePlacement(aeProfileId: string, reason: string): Promise<{ error?: string }> {
  const { supabase, userId } = await requirePlatformAdmin();

  const { error: placementError } = await supabase.from("ae_placements").upsert(
    {
      ae_profile_id: aeProfileId,
      status: "active",
      source: "comped",
      started_at: new Date().toISOString(),
      canceled_at: null,
    },
    { onConflict: "ae_profile_id" }
  );
  if (placementError) return { error: placementError.message };

  const { error: auditError } = await supabase.from("audit_logs").insert({
    organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
    actor_user_id: userId,
    action: "comp_ae_placement",
    entity_type: "ae_profile",
    entity_id: aeProfileId,
    metadata: { reason: reason || "Pilot AE comp" },
  });
  if (auditError) console.error("Failed to write audit log for comp_ae_placement:", auditError.message);

  revalidatePath("/admin/ae-profiles");
  return {};
}

export async function revokeAePlacement(aeProfileId: string, reason: string): Promise<{ error?: string }> {
  const { supabase, userId } = await requirePlatformAdmin();

  const { error } = await supabase
    .from("ae_placements")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("ae_profile_id", aeProfileId);
  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
    actor_user_id: userId,
    action: "revoke_ae_placement",
    entity_type: "ae_profile",
    entity_id: aeProfileId,
    metadata: { reason: reason || "Admin revoke" },
  });

  revalidatePath("/admin/ae-profiles");
  return {};
}
