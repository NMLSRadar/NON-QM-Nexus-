"use server";

import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { hashTrialInviteToken } from "@/lib/trialInvites";

/** Best-effort consume of a trial invite token — marks the matching
 * pending trial_invites row accepted once the invitee's trial has
 * activated, so a used invite link can't be redeemed a second time.
 * Idempotent: gated on the row still being unaccepted + unrevoked.
 * Server-only (service role) — the invitee's own anon/authenticated
 * client can't write trial_invites (RLS locked down). */
export async function consumeTrialInvite(
  rawToken: string,
  campaignSlug: string
): Promise<void> {
  if (!rawToken) return;
  const service = createServiceRoleClient();
  await service
    .from("trial_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("token_hash", hashTrialInviteToken(rawToken))
    .is("accepted_at", null)
    .is("revoked_at", null);
}