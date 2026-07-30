// Integration tests for the Team Membership entitlement resolver
// (src/lib/repository/membership.ts's getEffectivePlan / resolveOrgCoverage)
// against the REAL Supabase project — same skip-without-credentials
// convention as the other tests/integration/*.test.ts files, PLUS a schema
// probe (see teamMembershipSchemaProbe.ts) since this feature's tables may
// not be pushed yet.
//
// Covers spec section 7's "Entitlement matrix": personal-only, org-only,
// both (max wins), covered vs uncovered member, seat-overflow determinism,
// org sub expired -> fallback.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEffectivePlan } from "@/lib/repository/membership";
import { probeTeamSchemaReady } from "./teamMembershipSchemaProbe";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Team Membership entitlement resolver (live database)", () => {
  let admin: SupabaseClient;
  let schemaReady = false;
  let essentialPlan: { id: string; tier_level: number };
  let professionalPlan: { id: string; tier_level: number };
  let enterprisePlan: { id: string; tier_level: number };
  let orgId: string;
  const createdUserIds: string[] = [];

  async function createTestUser(label: string): Promise<string> {
    const email = `nqn-team-entitlement-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: "Team-Entitlement-Pw-123", email_confirm: true });
    if (error || !data.user) throw new Error(`Failed to create test user ${label}: ${error?.message}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    schemaReady = await probeTeamSchemaReady(admin);
    if (!schemaReady) return;

    const { data: plans } = await admin.from("membership_plans").select("id, key, tier_level").in("key", ["essential", "professional", "enterprise"]);
    essentialPlan = plans!.find((p) => p.key === "essential") as typeof essentialPlan;
    professionalPlan = plans!.find((p) => p.key === "professional") as typeof professionalPlan;
    enterprisePlan = plans!.find((p) => p.key === "enterprise") as typeof enterprisePlan;

    const { data: org, error: orgError } = await admin.from("organizations").insert({ name: `NQN Team Entitlement Test ${Date.now()}` }).select("id").single();
    if (orgError || !org) throw new Error(`Failed to create test org: ${orgError?.message}`);
    orgId = org.id as string;
  }, 30_000);

  afterAll(async () => {
    // Cleanup runs regardless of schemaReady: `organizations` is a
    // pre-existing table (always safe to delete from), and a delete
    // against a table that doesn't exist yet (org_subscriptions before the
    // schema is pushed) returns an error object rather than throwing, so
    // it's harmless here — nothing was ever inserted into it if
    // schemaReady was false (every test skips itself first).
    if (orgId) {
      await admin.from("org_subscriptions").delete().eq("organization_id", orgId);
      await admin.from("memberships").delete().eq("organization_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
    }
    for (const userId of createdUserIds) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("personal-only: a personal subscription with no org coverage resolves to the personal tier", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const userId = await createTestUser("personal-only");
    await admin.from("user_subscriptions").upsert({ user_id: userId, plan_id: professionalPlan.id, source: "comped" }, { onConflict: "user_id" });

    const plan = await getEffectivePlan(admin, userId);
    expect(plan.tierLevel).toBe(professionalPlan.tier_level);
    expect(plan.orgCoverage).toBeNull();
  });

  it("org-only: a covered membership with no personal subscription resolves to the org's tier", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const userId = await createTestUser("org-only");
    await admin.from("org_subscriptions").insert({ organization_id: orgId, plan_id: enterprisePlan.id, seat_count: 5, status: "active", source: "comped" });
    await admin.from("memberships").insert({ organization_id: orgId, user_id: userId, role: "broker", covered_by_org_plan: true });

    const plan = await getEffectivePlan(admin, userId);
    expect(plan.tierLevel).toBe(enterprisePlan.tier_level);
    expect(plan.orgCoverage?.tierLevel).toBe(enterprisePlan.tier_level);

    await admin.from("org_subscriptions").delete().eq("organization_id", orgId);
    await admin.from("memberships").delete().eq("organization_id", orgId);
  });

  it("both coexist: the HIGHER of personal and org tier wins", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const userId = await createTestUser("both-max-wins");
    await admin.from("user_subscriptions").upsert({ user_id: userId, plan_id: essentialPlan.id, source: "comped" }, { onConflict: "user_id" });
    await admin.from("org_subscriptions").insert({ organization_id: orgId, plan_id: enterprisePlan.id, seat_count: 5, status: "active", source: "comped" });
    await admin.from("memberships").insert({ organization_id: orgId, user_id: userId, role: "broker", covered_by_org_plan: true });

    const higherOrg = await getEffectivePlan(admin, userId);
    expect(higherOrg.tierLevel).toBe(enterprisePlan.tier_level); // org (3) beats personal essential (1)

    // Now flip: personal Enterprise, org Essential — personal should win.
    await admin.from("user_subscriptions").update({ plan_id: enterprisePlan.id }).eq("user_id", userId);
    await admin.from("org_subscriptions").update({ plan_id: essentialPlan.id }).eq("organization_id", orgId);
    const higherPersonal = await getEffectivePlan(admin, userId);
    expect(higherPersonal.tierLevel).toBe(enterprisePlan.tier_level);

    await admin.from("org_subscriptions").delete().eq("organization_id", orgId);
    await admin.from("memberships").delete().eq("organization_id", orgId);
    await admin.from("user_subscriptions").delete().eq("user_id", userId);
  });

  it("seat-overflow determinism: only the oldest seat_count covered members actually count as covered", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const olderUserId = await createTestUser("seat-older");
    const newerUserId = await createTestUser("seat-newer");

    await admin.from("org_subscriptions").insert({ organization_id: orgId, plan_id: enterprisePlan.id, seat_count: 1, status: "active", source: "comped" });
    const olderTimestamp = new Date(Date.now() - 60_000).toISOString();
    const newerTimestamp = new Date().toISOString();
    await admin.from("memberships").insert({ organization_id: orgId, user_id: olderUserId, role: "broker", covered_by_org_plan: true, created_at: olderTimestamp });
    await admin.from("memberships").insert({ organization_id: orgId, user_id: newerUserId, role: "broker", covered_by_org_plan: true, created_at: newerTimestamp });

    const olderPlan = await getEffectivePlan(admin, olderUserId);
    const newerPlan = await getEffectivePlan(admin, newerUserId);
    expect(olderPlan.tierLevel, "the OLDEST covered membership should win the single seat").toBe(enterprisePlan.tier_level);
    expect(newerPlan.tierLevel, "a covered_by_org_plan=true row beyond seat_count must resolve as UNCOVERED").toBe(0);
    expect(newerPlan.orgCoverage).toBeNull();

    await admin.from("org_subscriptions").delete().eq("organization_id", orgId);
    await admin.from("memberships").delete().eq("organization_id", orgId);
  });

  it("org subscription expired (current_period_end in the past) falls back — no org coverage", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const userId = await createTestUser("org-expired");
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin.from("org_subscriptions").insert({
      organization_id: orgId,
      plan_id: enterprisePlan.id,
      seat_count: 5,
      status: "active",
      source: "stripe",
      current_period_end: pastDate,
    });
    await admin.from("memberships").insert({ organization_id: orgId, user_id: userId, role: "broker", covered_by_org_plan: true });

    const plan = await getEffectivePlan(admin, userId);
    expect(plan.tierLevel).toBe(0);
    expect(plan.orgCoverage).toBeNull();

    await admin.from("org_subscriptions").delete().eq("organization_id", orgId);
    await admin.from("memberships").delete().eq("organization_id", orgId);
  });
});
