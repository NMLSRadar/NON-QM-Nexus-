"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export interface AttributionActionResult {
  error?: string;
  message?: string;
}

const reassignSchema = z.object({
  organizationId: z.string().uuid("Select the organization."),
  toUserId: z.string().uuid("Select the rep."),
  reason: z.string().trim().min(3, "A written reason is required (min 3 characters)."),
});

const repSchema = z.object({
  userId: z.string().uuid("Select the user."),
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters.")
    .max(32)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Code may only contain letters, digits, and hyphens (no spaces)."),
  displayName: z.string().trim().min(1, "Display name is required."),
});

// ---------------------------------------------------------------------------
// Reassign an org's attribution. Reason is mandatory and is written, along
// with from/to, to attribution_changes (append-only audit). Never deletes or
// overwrites history: attribution_captures gets an admin_manual row too.
// ---------------------------------------------------------------------------
export async function reassignAttribution(input: {
  organizationId: string;
  toUserId: string;
  reason: string;
}): Promise<AttributionActionResult> {
  const { userId: actorUserId } = await requirePlatformAdmin();
  const validated = reassignSchema.safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "Invalid input." };

  const service = createServiceRoleClient();
  const { organizationId, toUserId, reason } = validated.data;

  // The target must be a real, active sales rep.
  const { data: rep, error: repError } = await service
    .from("sales_reps")
    .select("user_id")
    .eq("user_id", toUserId)
    .eq("is_active", true)
    .maybeSingle();
  if (repError) return { error: repError.message };
  if (!rep) return { error: "That user is not an active sales rep. Activate them first." };

  const { data: current, error: currentError } = await service
    .from("organization_attribution")
    .select("attributed_to_user_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError && !/does not exist/i.test(currentError.message)) return { error: currentError.message };

  const fromUserId = (current?.attributed_to_user_id as string | null) ?? null;

  // Append-only audit of the change.
  const { error: changeError } = await service.from("attribution_changes").insert({
    organization_id: organizationId,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    reason,
    changed_by: actorUserId,
  });
  if (changeError) return { error: `Failed to record attribution change: ${changeError.message}` };

  // Upsert the current attribution row (admin_manual always wins; no conflict).
  const row = {
    organization_id: organizationId,
    attributed_to_user_id: toUserId,
    method: "admin_manual",
    status: "confirmed",
    conflict_detail: null,
    last_modified_by: actorUserId,
    updated_at: new Date().toISOString(),
  };
  const { error: upsertError } = await service
    .from("organization_attribution")
    .upsert(row, { onConflict: "organization_id" } as never);
  if (upsertError) return { error: `Failed to update attribution: ${upsertError.message}` };

  // Capture trail (admin_manual).
  await service.from("attribution_captures").insert({
    organization_id: organizationId,
    rep_user_id: toUserId,
    method: "admin_manual",
    source: `admin_reassign:${actorUserId}`,
    resolved: true,
  });

  revalidatePath("/admin/attribution");
  return { message: "Attribution updated." };
}

// ---------------------------------------------------------------------------
// Resolve a needs_review conflict: keep the rep on one side of the conflict.
// Writing attribution_changes with a reason is mandatory (same audit path as
// reassign — resolving a conflict IS a manual attribution decision).
// ---------------------------------------------------------------------------
export async function resolveConflict(input: {
  organizationId: string;
  keepUserId: string;
  reason: string;
}): Promise<AttributionActionResult> {
  // Resolving a conflict is a manual attribution decision — same audit path
  // as reassignment: the kept rep becomes the attribution, with a reason.
  return reassignAttribution({
    organizationId: input.organizationId,
    toUserId: input.keepUserId,
    reason: input.reason,
  });
}

// ---------------------------------------------------------------------------
// Sales rep management.
// ---------------------------------------------------------------------------
export async function createSalesRep(input: { userId: string; code: string; displayName: string }): Promise<AttributionActionResult> {
  const { userId: actorUserId } = await requirePlatformAdmin();
  void actorUserId;
  const validated = repSchema.safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "Invalid rep." };

  const service = createServiceRoleClient();
  const normalized = {
    user_id: validated.data.userId,
    code: validated.data.code.toLowerCase(),
    display_name: validated.data.displayName,
  };

  const { data: existing, error: existingError } = await service.from("sales_reps").select("id").ilike("code", normalized.code).maybeSingle();
  if (existingError) return { error: existingError.message };
  if (existing) return { error: "That code is already in use by another rep." };

  const { error } = await service.from("sales_reps").insert(normalized);
  if (error) return { error: error.message };

  revalidatePath("/admin/attribution");
  return { message: "Rep created." };
}

export async function setRepActive(input: { repId: string; isActive: boolean }): Promise<AttributionActionResult> {
  await requirePlatformAdmin();
  const validated = z
    .object({ repId: z.string().uuid("Invalid rep."), isActive: z.boolean() })
    .safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "Invalid input." };

  const service = createServiceRoleClient();
  const { error } = await service
    .from("sales_reps")
    .update({ is_active: validated.data.isActive })
    .eq("id", validated.data.repId);
  if (error) return { error: error.message };

  revalidatePath("/admin/attribution");
  return { message: validated.data.isActive ? "Rep activated." : "Rep deactivated." };
}