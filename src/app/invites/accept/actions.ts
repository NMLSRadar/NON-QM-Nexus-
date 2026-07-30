"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { hashInviteToken } from "@/lib/invites";

export interface AcceptInviteResult {
  error?: string;
  organizationName?: string;
}

/** Accepts a team invite for an ALREADY-LOGGED-IN user (adds a SECOND
 * membership — see src/lib/session.ts's org switcher for how they then
 * move between orgs). The brand-new-signup path
 * (supabase/team-invite-signup.sql) is separate and handles the case where
 * the invitee doesn't have an account yet.
 *
 * Validated entirely server-side via the service-role client (the caller
 * has no membership in the target org yet, so their own RLS-scoped session
 * can't see the org_invites row at all): hash match, unaccepted, unrevoked,
 * unexpired, AND the invite's email must match the caller's own signed-in
 * email (case-insensitive) — an invite is not transferable to whoever
 * happens to click the link. */
export async function acceptInvite(rawToken: string): Promise<AcceptInviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Sign in first, then open the invite link again." };

  if (!rawToken) return { error: "Missing invite token." };
  const tokenHash = hashInviteToken(rawToken);
  const service = createServiceRoleClient();

  const { data: invite, error: inviteError } = await service
    .from("org_invites")
    .select("id, organization_id, email, role, expires_at, accepted_at, revoked_at, organization:organizations(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (inviteError) return { error: inviteError.message };
  if (!invite) return { error: "This invitation link is invalid." };
  if (invite.accepted_at) return { error: "This invitation has already been used." };
  if (invite.revoked_at) return { error: "This invitation has been revoked." };
  if (new Date(invite.expires_at as string).getTime() <= Date.now()) return { error: "This invitation has expired." };
  if ((invite.email as string).toLowerCase() !== user.email.toLowerCase()) {
    return { error: "This invitation was sent to a different email address." };
  }

  const organizationId = invite.organization_id as string;
  const org = Array.isArray(invite.organization) ? invite.organization[0] : invite.organization;
  const organizationName = (org?.name as string | undefined) ?? "the organization";

  const { data: existingMembership } = await service
    .from("memberships")
    .select("id, deleted_at")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership && !existingMembership.deleted_at) {
    return { error: `You're already a member of ${organizationName}.` };
  }

  // Coverage-on-accept, capped by seats free — same rule as the invited-
  // signup trigger.
  const { data: orgSub } = await service
    .from("org_subscriptions")
    .select("seat_count")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  let covered = false;
  if (orgSub) {
    const { count } = await service
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("covered_by_org_plan", true)
      .is("deleted_at", null);
    covered = (count ?? 0) < (orgSub.seat_count as number);
  }

  if (existingMembership) {
    const { error } = await service
      .from("memberships")
      .update({ role: invite.role, covered_by_org_plan: covered, deleted_at: null })
      .eq("id", existingMembership.id as string);
    if (error) return { error: error.message };
  } else {
    const { error } = await service.from("memberships").insert({
      organization_id: organizationId,
      user_id: user.id,
      role: invite.role,
      covered_by_org_plan: covered,
    });
    if (error) return { error: error.message };
  }

  const { error: acceptError } = await service.from("org_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id as string);
  if (acceptError) return { error: acceptError.message };

  revalidatePath("/account");
  return { organizationName };
}
