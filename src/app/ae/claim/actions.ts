"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { error: updateError } = await supabase
    .from("ae_profiles")
    .update({ claimed_by_user_id: user.id, status: autoApprove ? "claimed" : "unclaimed" })
    .eq("id", profileId);
  if (updateError) return { error: updateError.message };

  return { autoApproved: autoApprove };
}
