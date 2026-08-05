// Surfaces the case the incident-2026-07-30 trigger-observability hardening
// made possible to detect: a user signed up with a valid invite_token (still
// present in their Supabase Auth user_metadata forever), but — because
// handle_new_user()'s invite branch hit an unexpected error and fell back to
// normal signup (see supabase/team-invite-signup.sql's `exception when
// others`, which now also logs to signup_trigger_errors) — ended up as the
// sole admin of a freshly self-created org instead of joining the org they
// were actually invited to. Previously this was invisible: the user just saw
// a org with only themselves in it and no obvious explanation. Server
// component: cheap (only queries further when invite_token metadata is
// actually present, which is rare — most users never had one).
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/lib/invites";
import { SUPPORT_EMAIL } from "@/lib/support";

export async function InviteMismatchBanner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const inviteToken = user?.user_metadata?.invite_token;
  if (!user || typeof inviteToken !== "string" || !inviteToken) return null;

  const { data: invite } = await supabase
    .from("org_invites")
    .select("organization_id, organization:organizations(name)")
    .eq("token_hash", hashInviteToken(inviteToken))
    .maybeSingle();
  if (!invite) return null; // invite row itself is gone (cleaned up) — nothing to compare against

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", invite.organization_id as string)
    .is("deleted_at", null)
    .maybeSingle();
  if (membership) return null; // the invite worked as intended — nothing to report

  const orgRel = invite.organization as unknown as { name?: string } | { name?: string }[] | null;
  const invitingOrgName = (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) ?? "the team";

  return (
    <div className="rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm p-4 mb-4">
      <p className="font-semibold">Your invite to {invitingOrgName} didn&apos;t go through as expected.</p>
      <p className="mt-1 text-amber-200/90">
        You&apos;re signed in, but not as a member of that team — you were added to your own workspace instead. This can
        happen due to a temporary signup issue. Please contact us so we can add you to the right team.
      </p>
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=Invite%20did%20not%20apply%20on%20signup`}
        className="mt-2 inline-block text-amber-300 underline font-medium"
      >
        Contact support ({SUPPORT_EMAIL})
      </a>
    </div>
  );
}
