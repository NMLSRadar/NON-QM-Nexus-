import Link from "next/link";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { hashTrialInviteToken } from "@/lib/trialInvites";
import { InviteAcceptClient } from "./invite-accept-client";

export const dynamic = "force-dynamic";

interface TrialCampaignRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  trial_duration_days: number;
  require_nmls_number: boolean;
  require_company_name: boolean;
}

interface TrialInviteRow {
  id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  campaign: TrialCampaignRow;
}

/**
 * Landing page for a beta-tester invite link (streamlined beta flow,
 * 2026-08-10). The invite link is a plain app URL carrying an app-generated
 * token (…?token=<raw>). The token is validated HERE, server-side, against
 * public.trial_invites by SHA-256 hash — the invitee's own (unauthenticated)
 * browser can't reach that table, so the link's validity (real, unexpired,
 * unaccepted, unrevoked) is authoritative and set once at issue time. The
 * client receives only a validated, immutable snapshot (email + mode) and
 * does the account setup / sign-in / activation.
 *
 * Two invitee paths:
 *   - new invitee (no account yet) — choose a password, then a confirmation
 *     email is sent; after they confirm they return here and the trial
 *     activates.
 *   - existing account — sign in (or a magic sign-in link), and the trial
 *     activates.
 * In both cases the person never registers on the /trial/[slug] signup form
 * first; the invite link IS the gate.
 */
export default async function InviteAcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  const service = createServiceRoleClient();

  if (!token) {
    return <InviteLinkError reason="This invitation link is missing its token." />;
  }

  const tokenHash = hashTrialInviteToken(token);
  const { data: invite, error } = await service
    .from("trial_invites")
    .select(
      "id, email, expires_at, accepted_at, revoked_at, campaign:trial_campaigns(id, name, slug, is_active, trial_duration_days, require_nmls_number, require_company_name)"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle<TrialInviteRow>();
  if (error) {
    console.error("invite-accept: token lookup failed", error);
    return <InviteLinkError reason="Something went wrong verifying your invitation link. Please ask the sender for a new one." />;
  }
  if (!invite) {
    return <InviteLinkError reason="This invitation link is invalid. It may have expired — ask for a new invite." />;
  }
  if (invite.accepted_at) {
    return <InviteLinkError reason="This invitation has already been used. Sign in to continue." />;
  }
  if (invite.revoked_at) {
    return <InviteLinkError reason="This invitation has been revoked." />;
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return <InviteLinkError reason="This invitation link has expired — ask for a new invite." />;
  }
  if (!invite.campaign) {
    return <InviteLinkError reason="The campaign for this invitation no longer exists." />;
  }
  if (!invite.campaign.is_active) {
    return <InviteLinkError reason="This invitation campaign is no longer active." />;
  }

  // Does an account exist for this email? Decides whether the client shows
  // "create your account" or "sign in". Check BOTH public.users AND the
  // auth.users row itself: a legacy invite can leave a confirmed auth.users
  // account with no public.users row yet (orphaned), which must be treated as
  // an EXISTING invitee — otherwise they're shown "create your account" on an
  // already-registered, already-confirmed email, and Supabase silently sends
  // NO confirmation email (nothing to confirm), stranding them on "Check your
  // email". (2026-08-11 matthew@easemortgage.com incident.)
  const normalizedEmail = invite.email.trim().toLowerCase();
  const { data: existingUser } = await service
    .from("users")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();
  const { data: existingAuth } = await service
    .schema("auth")
    .from("users")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();
  const mode: "new" | "existing" = existingUser || existingAuth ? "existing" : "new";

  return (
    <InviteAcceptClient
      campaignSlug={invite.campaign.slug}
      campaignName={invite.campaign.name}
      trialDurationDays={invite.campaign.trial_duration_days}
      requireNmls={invite.campaign.require_nmls_number}
      requireCompany={invite.campaign.require_company_name}
      inviteToken={token}
      inviteEmail={invite.email.trim()}
      mode={mode}
    />
  );
}

function InviteLinkError({ reason }: { reason: string }) {
  return (
    <main className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[70vh] max-w-md mx-auto flex items-center">
      <div className="gold-card rounded-2xl p-6 w-full text-center space-y-4">
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-3">{reason}</p>
        <Link href="/login" className="inline-block text-sm text-amber-300 hover:underline">
          Go to sign in
        </Link>
      </div>
    </main>
  );
}