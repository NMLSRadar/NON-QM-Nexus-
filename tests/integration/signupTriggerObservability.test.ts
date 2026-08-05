// Integration test for the 2026-08-05 trigger-observability hardening
// (incident 2026-07-30 follow-up, reviewer-ordered): handle_new_user()'s
// invite-branch `exception when others` handler used to swallow errors
// silently (a bare `null;`). It now (supabase/team-invite-signup.sql)
// RAISE WARNINGs and inserts a row into signup_trigger_errors — never the
// full email, only the domain — while still letting the signup itself
// succeed via the normal (self-created-org) fallback.
//
// To exercise the REAL exception path without touching the global trigger
// function (any temporary swap of it would race every other concurrently
// running signup in this suite), this test manufactures a genuinely
// corrupted invite the same way the original incident happened: a
// dangling foreign key. It creates a normal, fully-valid invite (real org,
// unexpired, unrevoked, matching email), then deletes ONLY that one row's
// backing organization out from under it — using
// `session_replication_role = replica` scoped to a single Prisma
// transaction (one Postgres session) so foreign-key enforcement is
// bypassed only for that one statement, on this one connection, never
// affecting any other concurrent session/test. The org_invites row is
// left pointing at an organization_id that no longer exists — a
// deliberately corrupted invite token, indistinguishable at signup time
// from any other real invite until handle_new_user() tries to actually
// use it and hits a real 23503 foreign_key_violation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
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

describe.skipIf(!hasCredentials)("Signup trigger observability — corrupted invite still signs up + logs (live database)", () => {
  let admin: SupabaseClient;
  let prisma: PrismaClient;
  let schemaReady = false;
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdInviteIds: string[] = [];

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    prisma = new PrismaClient();
    schemaReady = await probeTeamSchemaReady(admin);
  }, 30_000);

  afterAll(async () => {
    for (const userId of createdUserIds) {
      const { data: membership } = await admin.from("memberships").select("organization_id").eq("user_id", userId).is("deleted_at", null).maybeSingle();
      if (membership) {
        await admin.from("memberships").delete().eq("user_id", userId);
        createdOrgIds.push(membership.organization_id as string);
      }
      await admin.auth.admin.deleteUser(userId);
    }
    for (const inviteId of createdInviteIds) {
      await admin.from("org_invites").delete().eq("id", inviteId);
    }
    for (const orgId of createdOrgIds) {
      await admin.from("organizations").delete().eq("id", orgId);
    }
    await prisma.$disconnect();
  });

  it("a corrupted (dangling-org) invite still yields a successful signup, via the normal fallback, and logs to signup_trigger_errors", async (ctx) => {
    if (!schemaReady) return ctx.skip();

    // 1. A completely normal, valid invite against a real (soon-to-be-corrupted) org.
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: `NQN Trigger-Corruption Test Org ${Date.now()}` })
      .select("id")
      .single();
    if (orgError || !org) throw new Error(`Failed to create test org: ${orgError?.message}`);
    const orgId = org.id as string;

    const email = `nqn-corrupted-invite-${Date.now()}@gmail.com`;
    const rawToken = generateInviteToken();
    const { data: invite, error: inviteError } = await admin
      .from("org_invites")
      .insert({
        organization_id: orgId,
        email,
        role: "broker",
        token_hash: hashInviteToken(rawToken),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invited_by: orgId,
      })
      .select("id")
      .single();
    if (inviteError || !invite) throw new Error(`Failed to create test invite: ${inviteError?.message}`);
    createdInviteIds.push(invite.id as string);

    // 2. Corrupt it: delete the org this one invite references, bypassing FK
    //    enforcement only for this single statement on a single dedicated
    //    Postgres session (never touches any other concurrent connection).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET session_replication_role = replica");
      await tx.$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${orgId}'::uuid`);
      await tx.$executeRawUnsafe("SET session_replication_role = DEFAULT");
    });
    // Confirmed corrupted: org_invites still references orgId, but it no
    // longer exists in organizations. Never re-add orgId to createdOrgIds —
    // it's already gone.

    const before = await prisma.signupTriggerError.count();

    // 3. Sign up with this now-corrupted invite token — same real signup
    //    path as production (supabase.auth.signUp() -> the real trigger).
    const { data: signup, error: signupError } = await admin.auth.admin.createUser({
      email,
      password: "Trigger-Observability-Pw-123",
      email_confirm: true,
      user_metadata: { invite_token: rawToken },
    });
    // The whole point: signup must NOT fail even though the invite blew up internally.
    expect(signupError).toBeNull();
    expect(signup.user).not.toBeNull();
    const userId = signup.user!.id;
    createdUserIds.push(userId);

    // 4. Falls through to the normal (self-created-org) path, exactly like
    //    any other refused/broken invite — never the (now-deleted) org.
    const { data: membership } = await admin.from("memberships").select("organization_id, role").eq("user_id", userId).is("deleted_at", null).maybeSingle();
    expect(membership).not.toBeNull();
    expect(membership?.organization_id).not.toBe(orgId);
    expect(membership?.role).toBe("org_admin");

    // 5. And the failure is now OBSERVABLE: a new signup_trigger_errors row,
    //    domain-only, real SQLSTATE for a foreign-key violation.
    const after = await prisma.signupTriggerError.count();
    expect(after).toBe(before + 1);

    const latest = await prisma.signupTriggerError.findFirst({ orderBy: { occurredAt: "desc" } });
    expect(latest).not.toBeNull();
    expect(latest?.sqlstate).toBe("23503"); // foreign_key_violation
    expect(latest?.emailDomainOnly).toBe("gmail.com");
    expect(latest?.message).not.toContain(email); // never the full email
  }, 30_000);
});
