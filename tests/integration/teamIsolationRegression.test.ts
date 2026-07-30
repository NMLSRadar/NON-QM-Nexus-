// Cross-tenant isolation regression for the Team Membership surfaces —
// against the REAL Supabase project, using REAL RLS-scoped sessions (not
// the service-role client) for the read assertions, since RLS is exactly
// what's under test here. Same skip-without-credentials + schema-probe
// convention as the other tests/integration/*.test.ts files.
//
// Covers spec section 7's "Isolation regression": org A admin cannot read
// org B's members/invites/subscription; the org switcher cannot select an
// org the user has no active membership in (tested at the DB-query level
// that both getCurrentOrganizationId and setActiveOrganization rely on —
// see src/lib/session.ts / src/app/account/set-active-org.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

async function probeTeamSchemaReady(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from("org_subscriptions").select("id").limit(1);
  return !error;
}

describe.skipIf(!hasCredentials)("Team Membership cross-tenant isolation (live database, real RLS sessions)", () => {
  let admin: SupabaseClient;
  let schemaReady = false;
  let orgAId: string;
  let orgBId: string;
  let adminAClient: SupabaseClient;
  let adminAUserId: string;
  const password = "Isolation-Regression-Pw-123";
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    schemaReady = await probeTeamSchemaReady(admin);
    if (!schemaReady) return;

    const { data: orgA } = await admin.from("organizations").insert({ name: `NQN Isolation Org A ${Date.now()}` }).select("id").single();
    const { data: orgB } = await admin.from("organizations").insert({ name: `NQN Isolation Org B ${Date.now()}` }).select("id").single();
    orgAId = orgA!.id as string;
    orgBId = orgB!.id as string;

    const emailA = `nqn-isolation-admin-a-${Date.now()}@gmail.com`;
    const { data: userA, error: userAError } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (userAError || !userA.user) throw new Error(`Failed to create org A admin: ${userAError?.message}`);
    adminAUserId = userA.user.id;
    createdUserIds.push(adminAUserId);
    await admin.from("memberships").insert({ organization_id: orgAId, user_id: adminAUserId, role: "org_admin" });

    await admin.from("org_subscriptions").insert({ organization_id: orgBId, plan_id: (await admin.from("membership_plans").select("id").eq("key", "enterprise").single()).data!.id, seat_count: 5, status: "active", source: "comped" });
    await admin.from("org_invites").insert({ organization_id: orgBId, email: "someone-else@example.com", role: "broker", token_hash: `isolation-test-hash-${Date.now()}`, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), invited_by: adminAUserId });

    adminAClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!);
    const { error: signInError } = await adminAClient.auth.signInWithPassword({ email: emailA, password });
    if (signInError) throw new Error(`Failed to sign in as org A admin: ${signInError.message}`);
  }, 30_000);

  afterAll(async () => {
    if (!schemaReady) return; // beforeAll returns before creating orgA/orgB when schema isn't ready
    await admin.from("org_subscriptions").delete().eq("organization_id", orgBId);
    await admin.from("org_invites").delete().eq("organization_id", orgBId);
    await admin.from("memberships").delete().in("organization_id", [orgAId, orgBId]);
    await admin.from("organizations").delete().in("id", [orgAId, orgBId]);
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("org A's admin cannot read org B's memberships", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const { data, error } = await adminAClient.from("memberships").select("id").eq("organization_id", orgBId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("org A's admin cannot read org B's org_invites", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const { data, error } = await adminAClient.from("org_invites").select("id").eq("organization_id", orgBId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("org A's admin cannot read org B's org_subscriptions", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const { data, error } = await adminAClient.from("org_subscriptions").select("id").eq("organization_id", orgBId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("the org switcher's membership check finds nothing for an org the user doesn't belong to (so it can never select it)", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    // Mirrors exactly what src/app/account/set-active-org.ts's
    // setActiveOrganization() checks before trusting a client-supplied
    // organization id.
    const { data } = await adminAClient
      .from("memberships")
      .select("id")
      .eq("organization_id", orgBId)
      .eq("user_id", adminAUserId)
      .is("deleted_at", null)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("sanity: org A's admin CAN read their own org's memberships (proves the isolation above is RLS, not a broken query)", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const { data, error } = await adminAClient.from("memberships").select("id").eq("organization_id", orgAId);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });
});
