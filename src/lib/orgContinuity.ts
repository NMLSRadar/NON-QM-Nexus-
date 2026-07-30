// Billing-admin continuity check, shared between
// src/app/account/team/actions.ts's removeMember() and its integration
// tests. Deliberately NOT in actions.ts (a "use server" file) — that file
// pulls in Next.js server-action machinery (next/cache's revalidatePath)
// that can't be imported outside a Next.js runtime, so a plain test
// process importing actions.ts directly fails with a "cannot be imported
// from a Client Component module" error from the server-only guard chain.
// Same reasoning tests/integration/trialAdminActions.test.ts documents for
// why it avoids importing admin/trials/actions.ts directly. This module has
// no such dependency, so it's safe to import straight from a test.
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

/** Refuses when `excludingMembershipId` is the only remaining active
 * org_admin on `organizationId` AND that org has an active subscription
 * (Stripe or comped) — an org_admin cannot remove or demote themselves
 * while they're the only admin backing an active team subscription (Team
 * Membership spec, section 5). Returns null when removal/demotion is safe. */
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

  const { data: orgSub, error: subError } = await service
    .from("org_subscriptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (subError) throw new Error(subError.message);
  if (!orgSub) return null;

  return "You are the only admin on this organization's active team subscription — promote another member to admin first, or cancel the subscription.";
}
