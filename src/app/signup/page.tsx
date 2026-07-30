import { Card } from "@/components/ui";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { hashInviteToken } from "@/lib/invites";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

/** A safe, minimal preview of a pending invite for the signup page's copy —
 * looked up via service role (the visitor has no session/membership yet, so
 * RLS would otherwise hide org_invites entirely). Only ever reveals the
 * organization name and role, never anything else, and reveals nothing at
 * all for an invalid/expired/already-used token (no oracle for guessing
 * tokens). */
async function loadInvitePreview(rawToken: string | undefined): Promise<{ organizationName: string; role: string } | null> {
  if (!rawToken) return null;
  const service = createServiceRoleClient();
  const tokenHash = hashInviteToken(rawToken);
  const { data } = await service
    .from("org_invites")
    .select("role, expires_at, accepted_at, revoked_at, organization:organizations(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (data.accepted_at || data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;
  const org = Array.isArray(data.organization) ? data.organization[0] : data.organization;
  return { organizationName: (org?.name as string | undefined) ?? "a team", role: data.role as string };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const invitePreview = await loadInvitePreview(invite);

  return (
    <main className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[70vh] max-w-md mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-2">Create your account</h1>
      {invitePreview ? (
        <p className="text-sm text-amber-300/90 mb-4">
          You&apos;re joining <strong>{invitePreview.organizationName}</strong> — your seat is covered by their team
          subscription.
        </p>
      ) : null}
      <Card>
        <SignupForm inviteToken={invite} />
      </Card>
      {!invitePreview ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          Subscriptions are currently activated by our team after signup — usually within one business day.
        </p>
      ) : null}
    </main>
  );
}
