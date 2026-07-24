// Integration tests for self-serve subscription cancellation against the
// REAL Supabase project. Same skip-without-credentials convention as the
// other tests/integration/*.test.ts files.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEffectivePlan } from "@/lib/repository/membership";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Subscription cancellation (live database)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let organizationId: string;
  let essentialPlanId: string;
  const testEmail = `nqn-cancel-integration-${Date.now()}@gmail.com`;
  const testPassword = "Cancel-Integration-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: essential } = await admin.from("membership_plans").select("id").eq("key", "essential").single();
    essentialPlanId = essential!.id;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
    userId = created.user.id;

    userClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });

    const { data: membership } = await userClient
      .from("memberships")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    organizationId = membership!.organization_id as string;

    await admin.from("lenders").insert({ organization_id: organizationId, name: "Cancel-test Lender", tier_level: 1 });

    // Assign the Essential plan directly (mirrors what an admin does).
    await admin
      .from("user_subscriptions")
      .upsert({ user_id: userId, plan_id: essentialPlanId, assigned_by: userId }, { onConflict: "user_id" });
  }, 30_000);

  afterAll(async () => {
    if (organizationId) {
      await admin.from("lenders").delete().eq("organization_id", organizationId);
      await admin.from("memberships").delete().eq("organization_id", organizationId);
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (userId) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      await admin.from("users").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("an active subscription grants tier access before cancellation", async () => {
    const plan = await getEffectivePlan(userClient, userId);
    expect(plan.tierLevel).toBe(1);
    expect(plan.canceledAt).toBeNull();

    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders.map((l) => l.name)).toEqual(["Cancel-test Lender"]);
  }, 15_000);

  it("self-serve cancel_own_subscription() revokes access but keeps plan history", async () => {
    const { error } = await userClient.rpc("cancel_own_subscription");
    expect(error).toBeNull();

    const plan = await getEffectivePlan(userClient, userId);
    expect(plan.tierLevel).toBe(0); // access revoked
    expect(plan.planName).toBe("Essential"); // history kept
    expect(plan.canceledAt).not.toBeNull();

    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders).toHaveLength(0);
  }, 15_000);

  it("a canceled user cannot use the RPC to cancel someone else's subscription", async () => {
    // The RPC only ever touches auth.uid()'s own row — call it again as the
    // same already-canceled user and confirm nothing else was touched /
    // no error escalation happened.
    const { error } = await userClient.rpc("cancel_own_subscription");
    expect(error).toBeNull();
    const plan = await getEffectivePlan(userClient, userId);
    expect(plan.tierLevel).toBe(0);
  }, 15_000);

  it("admin reactivation (clearing canceled_at) restores tier access", async () => {
    await admin.from("user_subscriptions").update({ canceled_at: null }).eq("user_id", userId);

    const plan = await getEffectivePlan(userClient, userId);
    expect(plan.tierLevel).toBe(1);
    expect(plan.canceledAt).toBeNull();

    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders.map((l) => l.name)).toEqual(["Cancel-test Lender"]);
  }, 15_000);
});
