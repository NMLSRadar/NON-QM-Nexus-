"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";

/** Creates a new named trial campaign (spec Phase 5). */
export async function createTrialCampaign(formData: FormData): Promise<{ error?: string }> {
  const { supabase, userId } = await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const trialDurationDays = Number(formData.get("trialDurationDays") ?? 14) || 14;
  const maxRedemptionsRaw = String(formData.get("maxRedemptions") ?? "").trim();
  const maxRedemptions = maxRedemptionsRaw ? Number(maxRedemptionsRaw) : null;
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const allowedDomainsRaw = String(formData.get("allowedEmailDomains") ?? "").trim();
  const allowedEmailDomains = allowedDomainsRaw
    ? allowedDomainsRaw.split(",").map((d) => d.trim()).filter(Boolean)
    : null;
  const requireOnePerEmail = formData.get("requireOnePerEmail") === "on";
  const requireNmls = formData.get("requireNmls") === "on";
  const requireCompany = formData.get("requireCompany") === "on";

  if (!name || !slug) return { error: "Name and a valid slug are required." };

  const { error } = await supabase.from("trial_campaigns").insert({
    name,
    slug,
    description,
    trial_duration_days: trialDurationDays,
    max_redemptions: maxRedemptions,
    starts_at: startsAtRaw || null,
    ends_at: endsAtRaw || null,
    allowed_email_domains: allowedEmailDomains,
    require_one_redemption_per_email: requireOnePerEmail,
    require_nmls_number: requireNmls,
    require_company_name: requireCompany,
    created_by: userId,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/trials");
  return {};
}

export async function setCampaignActive(campaignId: string, isActive: boolean): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.from("trial_campaigns").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", campaignId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/trials");
}

/** Manually extend an individual trial by N days (spec Phase 5) — always
 * recomputes trial_expires_at server-side from the CURRENT expiry (or
 * now(), if already expired) + N days; never accepts a client-supplied
 * absolute date, matching the same server-clock-only principle as
 * activate_trial(). */
export async function extendTrial(redemptionId: string, extraDays: number): Promise<void> {
  const { supabase, userId } = await requirePlatformAdmin();

  const { data: redemption, error: fetchError } = await supabase
    .from("trial_redemptions")
    .select("user_id, expires_at, extension_count")
    .eq("id", redemptionId)
    .single();
  if (fetchError || !redemption) throw new Error(fetchError?.message ?? "Redemption not found");

  const base = new Date(redemption.expires_at).getTime() > Date.now() ? new Date(redemption.expires_at) : new Date();
  const newExpiry = new Date(base.getTime() + extraDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateRedemptionError } = await supabase
    .from("trial_redemptions")
    .update({ expires_at: newExpiry, extended_by: userId, extension_count: (redemption.extension_count ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", redemptionId);
  if (updateRedemptionError) throw new Error(updateRedemptionError.message);

  const { error: updateSubError } = await supabase
    .from("user_subscriptions")
    .update({ trial_expires_at: newExpiry, updated_at: new Date().toISOString() })
    .eq("user_id", redemption.user_id);
  if (updateSubError) throw new Error(updateSubError.message);

  revalidatePath("/admin/trials");
}

/** Manually revoke trial access immediately (spec Phase 5) — sets
 * trial_expires_at to now() so the very next read resolves to tier 0,
 * without deleting the account, its scenarios, or its profile data (spec
 * Phase 3's preservation requirements apply equally to a manual revoke). */
export async function revokeTrial(redemptionId: string): Promise<void> {
  const { supabase } = await requirePlatformAdmin();

  const { data: redemption, error: fetchError } = await supabase.from("trial_redemptions").select("user_id").eq("id", redemptionId).single();
  if (fetchError || !redemption) throw new Error(fetchError?.message ?? "Redemption not found");

  const now = new Date().toISOString();
  const { error: revokeError } = await supabase.from("trial_redemptions").update({ revoked_at: now, updated_at: now }).eq("id", redemptionId);
  if (revokeError) throw new Error(revokeError.message);

  const { error: subError } = await supabase.from("user_subscriptions").update({ trial_expires_at: now, updated_at: now }).eq("user_id", redemption.user_id);
  if (subError) throw new Error(subError.message);

  revalidatePath("/admin/trials");
}

/** Converts a trial user into a paid or complimentary account (spec Phase
 * 5) by assigning a real plan and clearing the trial flag — the resulting
 * subscription is a genuine plan assignment, not a trial extension. */
export async function convertTrial(redemptionId: string, planId: string): Promise<void> {
  const { supabase } = await requirePlatformAdmin();

  const { data: redemption, error: fetchError } = await supabase.from("trial_redemptions").select("user_id").eq("id", redemptionId).single();
  if (fetchError || !redemption) throw new Error(fetchError?.message ?? "Redemption not found");

  const { data: plan, error: planError } = await supabase.from("membership_plans").select("key").eq("id", planId).single();
  if (planError || !plan) throw new Error(planError?.message ?? "Plan not found");

  const now = new Date().toISOString();
  const { error: subError } = await supabase
    .from("user_subscriptions")
    .update({ plan_id: planId, is_trial: false, trial_expires_at: null, canceled_at: null, source: "comped", updated_at: now })
    .eq("user_id", redemption.user_id);
  if (subError) throw new Error(subError.message);

  const { error: redemptionError } = await supabase
    .from("trial_redemptions")
    .update({ converted_at: now, converted_plan_key: plan.key as string, updated_at: now })
    .eq("id", redemptionId);
  if (redemptionError) throw new Error(redemptionError.message);

  revalidatePath("/admin/trials");
}

/** Admin override for the duplicate-trial restriction (spec Phase 4) —
 * activates a trial for a user who already has a trial_redemptions row
 * (or would otherwise be blocked), bypassing activate_trial()'s own
 * duplicate check via its p_admin_override parameter. Requires the target
 * user to already exist (have signed up) — this does not create an
 * account, only grants trial access to one that's already there. */
export async function adminOverrideActivateTrial(
  targetUserEmail: string,
  campaignSlug: string
): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin();

  const normalizedEmail = targetUserEmail.toLowerCase().trim();
  const { data: targetUser, error: userError } = await supabase.from("users").select("id, email").eq("email", normalizedEmail).maybeSingle();
  if (userError) return { error: userError.message };
  if (!targetUser) return { error: `No existing account found for ${targetUserEmail}. The user must sign up first.` };

  // Call the RPC AS the admin, impersonating the target's identity is not
  // possible with the anon-session RPC (it keys off auth.uid()) — so this
  // override performs the equivalent writes directly instead, exactly
  // mirroring what activate_trial() does, just without its own duplicate
  // check (which is the entire point of an admin override).
  const { data: campaign, error: campaignError } = await supabase
    .from("trial_campaigns")
    .select("id, trial_duration_days")
    .eq("slug", campaignSlug)
    .single();
  if (campaignError || !campaign) return { error: campaignError?.message ?? "Campaign not found" };

  const expiresAt = new Date(Date.now() + campaign.trial_duration_days * 24 * 60 * 60 * 1000).toISOString();

  const { error: redemptionError } = await supabase.from("trial_redemptions").insert({
    campaign_id: campaign.id,
    user_id: targetUser.id,
    email: targetUser.email,
    normalized_email: normalizedEmail,
    activated_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  if (redemptionError) return { error: redemptionError.message };

  const { error: subError } = await supabase.from("user_subscriptions").upsert(
    { user_id: targetUser.id, plan_id: (await supabase.from("membership_plans").select("id").eq("key", "enterprise").single()).data?.id, is_trial: true, trial_activated_at: new Date().toISOString(), trial_expires_at: expiresAt, source: "comped" },
    { onConflict: "user_id" }
  );
  if (subError) return { error: subError.message };

  revalidatePath("/admin/trials");
  return {};
}
