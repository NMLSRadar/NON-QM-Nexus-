"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export interface ClaimResult {
  error?: string;
  autoApproved?: boolean;
}

/**
 * An existing authenticated user requests one of the lender's unclaimed AE
 * profiles. Auto-approves ONLY when the user's own verified auth email
 * domain matches lenders.email_domain (admin-maintained) — otherwise the
 * claim is recorded (claimed_by_user_id set) but status stays "unclaimed"
 * until an admin approves it at /admin/ae-profiles.
 *
 * IMPORTANT: the actual claiming UPDATE (setting claimed_by_user_id for
 * the FIRST time) must run through the service-role client, not the
 * request-scoped one — RLS's self-update policy requires
 * claimed_by_user_id = auth.uid() to ALREADY be true before an UPDATE is
 * permitted, which is impossible on a brand-new claim (the column is
 * still null). Real bug found and fixed 2026-07-30: the original version
 * used the request-scoped client here, which Supabase silently no-ops
 * under RLS (zero rows matched, no error returned) — so claims appeared
 * to succeed in the UI while the database was never actually updated.
 * The authorization decision itself (authenticated? profile unclaimed?
 * domain match for auto-approve?) is fully enforced by this function's
 * own application logic above, exactly like the Stripe customer-id write
 * in src/app/pricing/checkout-actions.ts.
 */
export async function claimAeProfile(_prev: ClaimResult, formData: FormData): Promise<ClaimResult> {
  const profileId = formData.get("profileId");
  if (typeof profileId !== "string" || !profileId) return { error: "Select a profile to claim." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect(`/login?next=/ae/claim`);

  const { data: profile, error: profileError } = await supabase
    .from("ae_profiles")
    .select("id, lender_id, claimed_by_user_id, status")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) return { error: profileError.message };
  if (!profile) return { error: "Profile not found." };
  if (profile.claimed_by_user_id) return { error: "This profile has already been claimed." };

  const { data: lender } = await supabase.from("lenders").select("email_domain").eq("id", profile.lender_id).maybeSingle();
  const userDomain = user.email!.split("@")[1]?.toLowerCase();
  const lenderDomain = (lender?.email_domain as string | null)?.toLowerCase();
  const autoApprove = Boolean(lenderDomain && userDomain && userDomain === lenderDomain);

  const service = createServiceRoleClient();
  const { data: updated, error: updateError } = await service
    .from("ae_profiles")
    .update({ claimed_by_user_id: user.id, status: autoApprove ? "claimed" : "unclaimed" })
    .eq("id", profileId)
    .is("claimed_by_user_id", null) // re-check atomically — never overwrite a claim that landed first
    .select("id")
    .maybeSingle();
  if (updateError) return { error: updateError.message };
  if (!updated) return { error: "This profile has already been claimed." };

  return { autoApproved: autoApprove };
}
