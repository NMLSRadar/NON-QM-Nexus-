"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

/**
 * Inline beta-tester toggle on the /admin/activity table. No modal, no
 * confirm — a single click flips is_beta_tester (and stamps/clears
 * beta_granted_at). Uses the service role client because public.users RLS
 * only lets a user see/update their own row; this is a server-only action
 * gated by requirePlatformAdmin.
 */
export async function setBetaTester(userId: string, beta: boolean): Promise<{ error?: string }> {
  await requirePlatformAdmin();
  const now = new Date().toISOString();
  const service = createServiceRoleClient();
  const { error } = await service
    .from("users")
    .update({ is_beta_tester: beta, beta_granted_at: beta ? now : null, updated_at: now })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/activity");
  return {};
}