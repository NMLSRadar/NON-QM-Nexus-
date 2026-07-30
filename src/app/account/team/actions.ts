"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/orgAdmin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { generateInviteToken, hashInviteToken, inviteExpiresAt } from "@/lib/invites";
import { sendTransactionalEmail } from "@/lib/email";
import { orgInviteEmail } from "@/lib/emailTemplates";
import { getStripe } from "@/lib/stripe";

const VALID_ROLES = ["broker", "account_executive", "processor", "underwriter", "org_admin"] as const;

async function getActiveOrgSubscription(organizationId: string) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("org_subscriptions")
    .select("id, seat_count, status, source, stripe_subscription_id, current_period_end, plan:membership_plans(name)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Failed to load org subscription: ${error.message}`);
  return data;
}

async function countCoveredMembers(organizationId: string): Promise<number> {
  const service = createServiceRoleClient();
  const { count, error } = await service
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("covered_by_org_plan", true)
    .is("deleted_at", null);
  if (error) throw new Error(`Failed to count covered members: ${error.message}`);
  return count ?? 0;
}

/** Sends a team invite (org_admin only) — creates the org_invites row
 * (service-role write, no user write policy on that table — see
 * supabase/team-membership-schema.sql) and emails a tokenized accept link.
 * The raw token is only ever handed to sendTransactionalEmail — never
 * returned to the caller or logged. */
export async function inviteMember(formData: FormData): Promise<{ error?: string }> {
  const { userId, organizationId } = await requireOrgAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "broker");
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  if (!(VALID_ROLES as readonly string[]).includes(role)) return { error: "Invalid role." };

  const service = createServiceRoleClient();

  const { data: existingMembership } = await service
    .from("memberships")
    .select("id, user:users(email)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  const alreadyMember = (existingMembership ?? []).some((m) => {
    const u = Array.isArray(m.user) ? m.user[0] : m.user;
    return (u?.email as string | undefined)?.toLowerCase() === email;
  });
  if (alreadyMember) return { error: "That person is already a member of this organization." };

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = inviteExpiresAt();

  const { error: insertError } = await service.from("org_invites").insert({
    organization_id: organizationId,
    email,
    role,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    invited_by: userId,
  });
  if (insertError) return { error: insertError.message };

  const { data: orgRow } = await service.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const { data: inviterRow } = await service.from("users").select("email").eq("id", userId).maybeSingle();
  const { data: existingUser } = await service.from("users").select("id").eq("email", email).maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const acceptUrl = existingUser
    ? `${appUrl}/invites/accept?invite=${rawToken}`
    : `${appUrl}/signup?invite=${rawToken}`;

  const { subject, html } = orgInviteEmail({
    organizationName: (orgRow?.name as string | undefined) ?? "your team",
    role,
    inviterEmail: (inviterRow?.email as string | undefined) ?? "A teammate",
    acceptUrl,
    expiresAtIso: expiresAt.toISOString(),
  });
  const sendResult = await sendTransactionalEmail({ to: email, subject, html });
  if (!sendResult.ok) {
    return { error: `Invite saved, but the email failed to send: ${sendResult.error ?? "unknown error"}` };
  }

  revalidatePath("/account/team");
  return {};
}

/** Revokes a pending invite (org_admin only) — single-use, so a revoked
 * invite's token can never be redeemed even if the email was already
 * opened. */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { organizationId } = await requireOrgAdmin();
  const service = createServiceRoleClient();
  const { error } = await service
    .from("org_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/account/team");
}

/** Toggles a member's coverage under the org's team subscription
 * (org_admin only). Enforced here at toggle-time — coverage never exceeds
 * seats — AND re-checked in the resolver (src/lib/repository/membership.ts's
 * resolveOrgCoverage, deterministic oldest-membership-first) as defense in
 * depth. */
export async function toggleMemberCoverage(membershipId: string, covered: boolean): Promise<{ error?: string }> {
  const { organizationId } = await requireOrgAdmin();
  const service = createServiceRoleClient();

  const { data: membership, error: membershipError } = await service
    .from("memberships")
    .select("id, organization_id")
    .eq("id", membershipId)
    .is("deleted_at", null)
    .maybeSingle();
  if (membershipError) return { error: membershipError.message };
  if (!membership || membership.organization_id !== organizationId) return { error: "Member not found." };

  if (covered) {
    const orgSub = await getActiveOrgSubscription(organizationId);
    if (!orgSub) return { error: "This organization has no active team subscription." };
    const coveredCount = await countCoveredMembers(organizationId);
    if (coveredCount >= (orgSub.seat_count as number)) {
      return { error: `All ${orgSub.seat_count} seats are already covered. Add seats before covering another member.` };
    }
  }

  const { error } = await service.from("memberships").update({ covered_by_org_plan: covered }).eq("id", membershipId);
  if (error) return { error: error.message };

  revalidatePath("/account/team");
  return {};
}

/** Removes (soft-deletes) a member (org_admin only) — coverage is turned
 * off automatically. Refuses to remove the caller if they are the ONLY
 * org_admin on an org with an active team subscription (billing-admin
 * continuity — spec section 5). */
export async function removeMember(membershipId: string): Promise<{ error?: string }> {
  const { userId, organizationId } = await requireOrgAdmin();
  const service = createServiceRoleClient();

  const { data: target, error: targetError } = await service
    .from("memberships")
    .select("id, user_id, role, organization_id")
    .eq("id", membershipId)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target || target.organization_id !== organizationId) return { error: "Member not found." };

  if (target.user_id === userId && target.role === "org_admin") {
    const continuityError = await checkLastAdminContinuity(organizationId, membershipId);
    if (continuityError) return { error: continuityError };
  }

  const { error } = await service
    .from("memberships")
    .update({ deleted_at: new Date().toISOString(), covered_by_org_plan: false })
    .eq("id", membershipId);
  if (error) return { error: error.message };

  revalidatePath("/account/team");
  return {};
}

/** Shared continuity check: refuses when `excludingMembershipId` is the
 * only remaining active org_admin AND the org has an active subscription
 * (Stripe or comped) — used by removeMember above. */
export async function checkLastAdminContinuity(organizationId: string, excludingMembershipId: string): Promise<string | null> {
  const service = createServiceRoleClient();
  const { data: otherAdmins, error } = await service
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("role", "org_admin")
    .is("deleted_at", null)
    .neq("id", excludingMembershipId);
  if (error) throw new Error(error.message);
  if ((otherAdmins ?? []).length > 0) return null;

  const orgSub = await getActiveOrgSubscription(organizationId);
  if (!orgSub) return null;

  return "You are the only admin on this organization's active team subscription — promote another member to admin first, or cancel the subscription.";
}

/** Updates seat count (org_admin only). For a Stripe-sourced subscription,
 * updates the Stripe subscription item's quantity — the webhook then
 * confirms and the DB write happens there (this NEVER writes seat_count
 * directly for a Stripe org sub). For a comped subscription, writes
 * seat_count directly with an audit_logs entry (no Stripe object exists). */
export async function updateSeatCount(newSeatCount: number): Promise<{ error?: string }> {
  const { userId, organizationId } = await requireOrgAdmin();
  if (!Number.isInteger(newSeatCount) || newSeatCount < 1) return { error: "Seat count must be a positive whole number." };

  const service = createServiceRoleClient();
  const orgSub = await getActiveOrgSubscription(organizationId);
  if (!orgSub) return { error: "No active team subscription found." };

  const coveredCount = await countCoveredMembers(organizationId);
  if (newSeatCount < coveredCount) {
    return {
      error: `${coveredCount} members are currently covered — uncover at least ${coveredCount - newSeatCount} before reducing seats to ${newSeatCount}.`,
    };
  }

  if (orgSub.source === "stripe") {
    if (!orgSub.stripe_subscription_id) return { error: "This subscription has no Stripe subscription id." };
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(orgSub.stripe_subscription_id as string);
    const item = subscription.items.data[0];
    if (!item) return { error: "Stripe subscription has no line item to update." };
    await stripe.subscriptions.update(orgSub.stripe_subscription_id as string, {
      items: [{ id: item.id, quantity: newSeatCount }],
      proration_behavior: "create_prorations",
    });
    // DB write happens via the webhook (customer.subscription.updated) once
    // Stripe confirms the change — not here.
    revalidatePath("/account/team");
    return {};
  }

  // Comped subscription: no Stripe object, admin-comped writes go through
  // this org_admin-gated action with an audit_logs entry.
  const { error } = await service.from("org_subscriptions").update({ seat_count: newSeatCount }).eq("id", orgSub.id as string);
  if (error) return { error: error.message };

  await service.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: "org_subscription.seat_count_updated",
    entity_type: "org_subscriptions",
    entity_id: orgSub.id as string,
    metadata: { new_seat_count: newSeatCount, source: "comped" },
  });

  revalidatePath("/account/team");
  return {};
}
