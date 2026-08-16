"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export interface MembershipActionResult {
  error?: string;
  message?: string;
}

const VALID_STATUSES = ["trialing", "active", "past_due", "cancelled_pending", "cancelled", "churned", "trial_expired"] as const;
const VALID_SOURCES = ["webhook", "admin", "system"] as const;

const transitionSchema = z.object({
  organizationId: z.string().uuid("Invalid organization."),
  toStatus: z.enum(VALID_STATUSES, { message: "Invalid status." }),
  reason: z.string().trim().optional(),
});

const noteSchema = z.object({
  organizationId: z.string().uuid("Invalid organization."),
  body: z.string().trim().min(1, "Note cannot be empty.").max(2000),
});

// ---------------------------------------------------------------------------
// Every status transition is audited: record_membership_transition (SECURITY
// DEFINER) writes a membership_events row (from_status, to_status, reason,
// source='admin', actor) and updates the org's membership row. Source is
// always 'admin' here; webhook/source flows go through the same function.
// ---------------------------------------------------------------------------
export async function transitionMembership(input: {
  organizationId: string;
  toStatus: (typeof VALID_STATUSES)[number];
  reason?: string;
}): Promise<MembershipActionResult> {
  const { userId: actorUserId } = await requirePlatformAdmin();
  const validated = transitionSchema.safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "Invalid input." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("record_membership_transition", {
    p_organization_id: validated.data.organizationId,
    p_to_status: validated.data.toStatus,
    p_source: "admin",
    p_actor_user_id: actorUserId,
    p_reason: validated.data.reason ?? null,
  });
  if (error) return { error: `Failed to record transition: ${error.message}` };

  revalidatePath("/admin/memberships");
  return { message: "Status updated and audited." };
}

// Comp a month: grant comped active status for a period. For now this is a
// status transition to active with source admin and an explanatory reason,
// recorded as an event; the exact comped-period semantics ride on the plan
// tier/resolver. Every comp write is audited.
export async function compMonth(input: { organizationId: string; reason?: string }): Promise<MembershipActionResult> {
  const { userId: actorUserId } = await requirePlatformAdmin();
  const validated = z
    .object({ organizationId: z.string().uuid("Invalid organization."), reason: z.string().trim().optional() })
    .safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "Invalid organization." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("record_membership_transition", {
    p_organization_id: validated.data.organizationId,
    p_to_status: "active",
    p_source: "admin",
    p_actor_user_id: actorUserId,
    p_reason: validated.data.reason ? `Comp month: ${validated.data.reason}` : "Comp month (admin)",
  });
  if (error) return { error: `Failed to comp: ${error.message}` };

  revalidatePath("/admin/memberships");
  return { message: "Comp recorded and audited." };
}

export async function addMembershipNote(input: { organizationId: string; body: string }): Promise<MembershipActionResult> {
  const { userId: authorUserId } = await requirePlatformAdmin();
  const validated = noteSchema.safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "Invalid note." };

  const service = createServiceRoleClient();
  const { error } = await service.from("membership_notes").insert({
    organization_id: validated.data.organizationId,
    author_user_id: authorUserId,
    body: validated.data.body,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/memberships");
  return { message: "Note added." };
}