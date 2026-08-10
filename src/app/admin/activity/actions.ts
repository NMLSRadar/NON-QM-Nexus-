"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

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

/**
 * Permanently deletes a user — account sign-in, subscription, trial,
 * scenarios, documents and their personal organization. Full sequence:
 *
 *  1. Guards: platform admin caller; target exists; target is not a
 *     platform admin; target is not the caller.
 *  2. Cancel the user's LIVE personal Stripe subscription (if any) — a
 *     paying account is never deleted mid-period; failure aborts.
 *  3. Cancel any live TEAM (org) Stripe subscriptions held by the user's
 *     organizations — best effort (deletion proceeds regardless).
 *  4. Delete the auth.users account FIRST (service.auth.admin.deleteUser)
 *     so the person can never sign in again.
 *  5. Atomic public-data cleanup via the admin_delete_user() security-
 *     definer RPC (single transaction — see supabase/delete-user.sql),
 *     invoked with the ADMIN's own session so the function's auth.uid()
 *     authorization check passes.
 *  6. Audit-log entry (best effort, service role — audit_logs has no
 *     request-scoped insert policy).
 *
 * If step 4 succeeds but step 5 fails, the account can no longer sign in
 * and a second click of Delete finishes the data cleanup (the RPC is
 * idempotent). Never delete auth first in the reverse order — that would
 * orphan public rows with no recovery path.
 */
export async function deleteUser(targetUserId: string): Promise<{ error?: string }> {
  const { supabase, userId: adminId } = await requirePlatformAdmin();
  const service = createServiceRoleClient();

  // 1) Guards
  const { data: target, error: targetErr } = await service
    .from("users")
    .select("id, email, platform_admin, deleted_at")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetErr) return { error: targetErr.message };
  if (!target || target.deleted_at) return { error: "User not found." };
  if (target.platform_admin) {
    return { error: "Platform administrators cannot be deleted — demote them first in Admin → Users." };
  }
  if (target.id === adminId) return { error: "You cannot delete your own account." };

  // 2) Live personal Stripe subscription — cancel or abort.
  const { data: sub } = await service
    .from("user_subscriptions")
    .select("source, stripe_subscription_id, canceled_at")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (sub && sub.source === "stripe" && sub.stripe_subscription_id && !sub.canceled_at) {
    try {
      await getStripe().subscriptions.cancel(sub.stripe_subscription_id as string);
    } catch (err) {
      return {
        error: `Their live Stripe subscription couldn't be canceled before deleting (${err instanceof Error ? err.message : "Stripe error"}). Cancel it in Admin → Users, then retry.`,
      };
    }
  }

  // 3) Live team (org) Stripe subscriptions — best effort.
  const { data: memberships } = await service
    .from("memberships")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .is("deleted_at", null);
  const orgIds = (memberships ?? []).map((m) => m.organization_id as string);
  if (orgIds.length > 0) {
    const { data: orgSubs } = await service
      .from("org_subscriptions")
      .select("stripe_subscription_id")
      .in("organization_id", orgIds)
      .eq("source", "stripe")
      .eq("status", "active")
      .not("stripe_subscription_id", "is", null);
    for (const os of orgSubs ?? []) {
      try {
        await getStripe().subscriptions.cancel(os.stripe_subscription_id as string);
      } catch {
        // best effort — the RPC removes the local row regardless
      }
    }
  }

  // 4) Kill the sign-in FIRST.
  const { error: authErr } = await service.auth.admin.deleteUser(targetUserId);
  if (authErr) {
    return { error: `The account's sign-in couldn't be removed (${authErr.message}). No data was deleted — please retry.` };
  }

  // 5) Atomic public-data cleanup (runs as the admin's own session so the
  //    RPC's auth.uid() authorization check passes).
  const { error: rpcErr } = await supabase.rpc("admin_delete_user", { p_user_id: targetUserId });
  if (rpcErr) {
    return {
      error: `Their sign-in was removed, but data cleanup didn't finish: ${rpcErr.message}. Click Delete again to complete it.`,
    };
  }

  // 6) Audit trail (best effort).
  const { error: auditErr } = await service.from("audit_logs").insert({
    organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
    actor_user_id: adminId,
    action: "user.deleted",
    entity_type: "users",
    entity_id: targetUserId,
    metadata: { email: target.email },
  });
  if (auditErr) console.error("Failed to write audit log for user.deleted:", auditErr.message);

  revalidatePath("/admin/activity");
  return {};
}