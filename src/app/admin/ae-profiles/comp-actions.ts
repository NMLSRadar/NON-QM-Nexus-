"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";

/** Admin comps a Featured Placement for a pilot AE without Stripe —
 * writes an ae_placements row (source='comped') and an audit_logs entry
 * recording who did it and why, matching the platform's existing comp
 * pattern (see admin/trials for the analogous membership comp flow). */
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
    actor_user_id: userId,
    action: "comp_ae_placement",
    target_type: "ae_profile",
    target_id: aeProfileId,
    reason: reason || "Pilot AE comp",
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
    actor_user_id: userId,
    action: "revoke_ae_placement",
    target_type: "ae_profile",
    target_id: aeProfileId,
    reason: reason || "Admin revoke",
  });

  revalidatePath("/admin/ae-profiles");
  return {};
}
