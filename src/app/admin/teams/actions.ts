"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

/** Grants (or updates) a comped org team subscription — no Stripe object
 * involved, so pilot brokerages can start immediately (spec ground rule).
 * Platform-admin only: an org_admin can never grant themselves free team
 * access — that would be a self-serve comp loophole. Every write here is
 * an audited admin action (see audit_logs insert below), matching the
 * "comped writes go through admin actions with audit_logs entries" rule.
 * org_subscriptions/audit_logs have no user-session write policy at all
 * (see supabase/team-membership-schema.sql / rls-policies.sql) — every
 * write here goes through the service-role client, only reachable after
 * requirePlatformAdmin() has verified the caller via their own session. */
export async function compOrgSubscription(formData: FormData): Promise<{ error?: string }> {
  const { userId } = await requirePlatformAdmin();
  const supabase = createServiceRoleClient();

  const organizationId = String(formData.get("organizationId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const seatCount = Number(formData.get("seatCount"));
  if (!organizationId || !planId) return { error: "Organization and plan are required." };
  if (!Number.isInteger(seatCount) || seatCount < 1) return { error: "Seat count must be a positive whole number." };

  const { data: existingActive } = await supabase
    .from("org_subscriptions")
    .select("id, source")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (existingActive) {
    if (existingActive.source === "stripe") {
      return { error: "This org already has an active Stripe team subscription — cancel it first." };
    }
    const { error } = await supabase
      .from("org_subscriptions")
      .update({ plan_id: planId, seat_count: seatCount })
      .eq("id", existingActive.id as string);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("org_subscriptions").insert({
      organization_id: organizationId,
      plan_id: planId,
      seat_count: seatCount,
      status: "active",
      source: "comped",
    });
    if (error) return { error: error.message };
  }

  await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: existingActive ? "org_subscription.comped_updated" : "org_subscription.comped_granted",
    entity_type: "org_subscriptions",
    entity_id: existingActive?.id ?? null,
    metadata: { plan_id: planId, seat_count: seatCount },
  });

  revalidatePath("/admin/teams");
  return {};
}

/** Cancels a comped org subscription (platform admin only) — members fall
 * back to personal subs / tier 0 immediately (no period-end grace for a
 * comp, since there's no paid period to run out). */
export async function cancelCompedOrgSubscription(orgSubscriptionId: string): Promise<{ error?: string }> {
  const { userId } = await requirePlatformAdmin();
  const supabase = createServiceRoleClient();

  const { data: orgSub, error: fetchError } = await supabase
    .from("org_subscriptions")
    .select("organization_id, source")
    .eq("id", orgSubscriptionId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!orgSub) return { error: "Subscription not found." };
  if (orgSub.source !== "comped") return { error: "Only comped subscriptions can be canceled here — use the Stripe customer portal for a paid one." };

  const now = new Date().toISOString();
  const { error } = await supabase.from("org_subscriptions").update({ status: "canceled", canceled_at: now }).eq("id", orgSubscriptionId);
  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: orgSub.organization_id as string,
    actor_user_id: userId,
    action: "org_subscription.comped_canceled",
    entity_type: "org_subscriptions",
    entity_id: orgSubscriptionId,
    metadata: {},
  });

  revalidatePath("/admin/teams");
  return {};
}
