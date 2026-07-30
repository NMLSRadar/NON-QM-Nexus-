// Integration tests for invite security + the invited-signup auto-org
// regression, against the REAL Supabase project — exercises the ACTUAL
// signup path: creates a real auth.users row via admin.auth.admin.createUser
// with user_metadata.invite_token set exactly like
// src/app/login/actions.ts's signUp() passes it through
// supabase.auth.signUp({ options: { data: { invite_token } } }), which fires
// the real supabase/team-invite-signup.sql handle_new_user() trigger — not
// a re-implementation of its logic.
//
// Covers spec section 7's "Invite security": expired token refused, reused
// token refused, revoked refused, wrong-email acceptance refused, invited
// signup does NOT create a new org, normal signup still does.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateInviteToken, hashInviteToken } from "@/lib/invites";
import { probeTeamSchemaReady } from "./teamMembershipSchemaProbe";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Invite security + invited-signup regression (live database)", () => {
  let admin: SupabaseClient;
  let schemaReady = false;
  let inviteOrgId: string;
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdInviteIds: string[] = [];

  async function makeInvite(email: string, overrides: Partial<{ expiresAt: string; acceptedAt: string; revokedAt: string }> = {}): Promise<string> {
    const rawToken = generateInviteToken();
    const { data, error } = await admin
      .from("org_invites")
      .insert({
        organization_id: inviteOrgId,
        email,
        role: "broker",
        token_hash: hashInviteToken(rawToken),
        expires_at: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: overrides.acceptedAt ?? null,
        revoked_at: overrides.revokedAt ?? null,
        invited_by: inviteOrgId, // any uuid satisfies the column; not FK-checked against a specific user here
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create test invite: ${error?.message}`);
    createdInviteIds.push(data.id as string);
    return rawToken;
  }

  async function signUpWithInviteToken(email: string, rawToken: string | undefined): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "Invite-Security-Pw-123",
      email_confirm: true,
      user_metadata: rawToken ? { invite_token: rawToken } : undefined,
    });
    if (error || !data.user) throw new Error(`Failed to create test signup ${email}: ${error?.message}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function membershipFor(userId: string): Promise<{ organization_id: string; role: string } | null> {
    const { data } = await admin.from("memberships").select("organization_id, role").eq("user_id", userId).is("deleted_at", null).maybeSingle();
    return (data as { organization_id: string; role: string } | null) ?? null;
  }

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    schemaReady = await probeTeamSchemaReady(admin);
    if (!schemaReady) return;

    const { data: org, error } = await admin.from("organizations").insert({ name: `NQN Invite Security Test ${Date.now()}` }).select("id").single();
    if (error || !org) throw new Error(`Failed to create invite-security test org: ${error?.message}`);
    inviteOrgId = org.id as string;
    createdOrgIds.push(inviteOrgId);
  }, 30_000);

  afterAll(async () => {
    for (const userId of createdUserIds) {
      const membership = await membershipFor(userId);
      if (membership) await admin.from("memberships").delete().eq("user_id", userId);
      if (membership && membership.organization_id !== inviteOrgId) createdOrgIds.push(membership.organization_id);
      await admin.auth.admin.deleteUser(userId);
    }
    for (const orgId of createdOrgIds) {
      await admin.from("organizations").delete().eq("id", orgId);
    }
    for (const inviteId of createdInviteIds) {
      await admin.from("org_invites").delete().eq("id", inviteId);
    }
  });

  it("a valid, matching invite adds the user to the inviting org and skips auto-org-creation", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const email = `nqn-invite-valid-${Date.now()}@gmail.com`;
    const rawToken = await makeInvite(email);
    const userId = await signUpWithInviteToken(email, rawToken);

    const membership = await membershipFor(userId);
    expect(membership?.organization_id).toBe(inviteOrgId);
    expect(membership?.role).toBe("broker");
  });

  it("normal signup (no invite token) still auto-provisions its own org exactly as before — the regression", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const email = `nqn-invite-normal-signup-${Date.now()}@gmail.com`;
    const userId = await signUpWithInviteToken(email, undefined);

    const membership = await membershipFor(userId);
    expect(membership).not.toBeNull();
    expect(membership?.organization_id).not.toBe(inviteOrgId);
    expect(membership?.role).toBe("org_admin");
  });

  it("an expired invite token is refused — falls back to normal auto-org signup", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const email = `nqn-invite-expired-${Date.now()}@gmail.com`;
    const rawToken = await makeInvite(email, { expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const userId = await signUpWithInviteToken(email, rawToken);

    const membership = await membershipFor(userId);
    expect(membership?.organization_id).not.toBe(inviteOrgId);
    expect(membership?.role).toBe("org_admin");
  });

  it("a revoked invite token is refused", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const email = `nqn-invite-revoked-${Date.now()}@gmail.com`;
    const rawToken = await makeInvite(email, { revokedAt: new Date().toISOString() });
    const userId = await signUpWithInviteToken(email, rawToken);

    const membership = await membershipFor(userId);
    expect(membership?.organization_id).not.toBe(inviteOrgId);
  });

  it("an already-accepted (reused) invite token is refused a second time", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const email = `nqn-invite-reused-${Date.now()}@gmail.com`;
    const rawToken = await makeInvite(email, { acceptedAt: new Date().toISOString() });
    const userId = await signUpWithInviteToken(email, rawToken);

    const membership = await membershipFor(userId);
    expect(membership?.organization_id).not.toBe(inviteOrgId);
  });

  it("a token presented with a DIFFERENT email than the invite is refused", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const invitedEmail = `nqn-invite-target-${Date.now()}@gmail.com`;
    const differentEmail = `nqn-invite-wrong-email-${Date.now()}@gmail.com`;
    const rawToken = await makeInvite(invitedEmail);
    const userId = await signUpWithInviteToken(differentEmail, rawToken);

    const membership = await membershipFor(userId);
    expect(membership?.organization_id, "a mismatched email must never grant the invite's org").not.toBe(inviteOrgId);
    expect(membership?.role).toBe("org_admin");
  });
});
