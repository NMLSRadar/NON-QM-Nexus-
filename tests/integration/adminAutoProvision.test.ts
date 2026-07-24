// Integration test for the platform-admin auto-provisioning guard in
// getEffectivePlan() (src/lib/repository/membership.ts) against the REAL
// Supabase project — same skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// Regression covered: a platform-admin account with NO user_subscriptions
// row silently resolved to tierLevel 0, which hides every real (tier >= 1)
// lender from every scenario match — exactly what happened to the live
// admin account before this fix. The guard must self-heal that on first
// read by auto-assigning a comped Enterprise subscription, using the
// SIGNED-IN admin's own RLS-scoped client (not service role) — proving the
// fix works within the real subscriptions_admin_write RLS policy, not just
// against a service-role bypass.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEffectivePlan } from "@/lib/repository/membership";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Platform-admin auto-provisioning guard (live database)", () => {
  let admin: SupabaseClient;
  let adminUserClient: SupabaseClient;
  let regularUserClient: SupabaseClient;
  let platformAdminUserId: string;
  let regularUserId: string;
  const adminEmail = `nqn-admin-autoprovision-${Date.now()}@gmail.com`;
  const regularEmail = `nqn-regular-noprovision-${Date.now()}@gmail.com`;
  const password = "Auto-Provision-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: createdAdmin, error: adminCreateError } = await admin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    if (adminCreateError || !createdAdmin.user) throw new Error(`Failed to create test platform-admin user: ${adminCreateError?.message}`);
    platformAdminUserId = createdAdmin.user.id;
    // Promote to platform admin — a new sign-up is never one by default.
    const { error: promoteError } = await admin.from("users").update({ platform_admin: true }).eq("id", platformAdminUserId);
    if (promoteError) throw new Error(`Failed to promote test user to platform admin: ${promoteError.message}`);

    const { data: createdRegular, error: regularCreateError } = await admin.auth.admin.createUser({
      email: regularEmail,
      password,
      email_confirm: true,
    });
    if (regularCreateError || !createdRegular.user) throw new Error(`Failed to create test regular user: ${regularCreateError?.message}`);
    regularUserId = createdRegular.user.id;

    adminUserClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await adminUserClient.auth.signInWithPassword({ email: adminEmail, password });

    regularUserClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await regularUserClient.auth.signInWithPassword({ email: regularEmail, password });

    // Sanity check: neither test account has a subscription row yet.
    const { data: preCheck } = await admin.from("user_subscriptions").select("user_id").in("user_id", [platformAdminUserId, regularUserId]);
    if (preCheck && preCheck.length > 0) throw new Error("Test setup invariant violated: a subscription row already exists for a fresh test user");
  }, 30_000);

  afterAll(async () => {
    await admin.from("user_subscriptions").delete().in("user_id", [platformAdminUserId, regularUserId]);
    if (platformAdminUserId) await admin.auth.admin.deleteUser(platformAdminUserId);
    if (regularUserId) await admin.auth.admin.deleteUser(regularUserId);
  }, 30_000);

  it("a platform admin with no subscription row is auto-assigned comped Enterprise (tier 3), using their own RLS-scoped session", async () => {
    const plan = await getEffectivePlan(adminUserClient, platformAdminUserId);
    expect(plan.tierLevel).toBe(3);
    expect(plan.planName).toBe("Enterprise");
    expect(plan.source).toBe("comped");
    expect(plan.canceledAt).toBeNull();

    // And the row now genuinely exists in the database (not just returned
    // in-memory) — the next hand-rolled query should see the same thing
    // without needing to provision again.
    const { data: row } = await admin
      .from("user_subscriptions")
      .select("source, canceled_at, plan:membership_plans(key, tier_level)")
      .eq("user_id", platformAdminUserId)
      .single();
    expect(row?.source).toBe("comped");
    expect(row?.canceled_at).toBeNull();
    const plan2 = Array.isArray(row?.plan) ? row.plan[0] : row?.plan;
    expect(plan2?.key).toBe("enterprise");
  });

  it("re-resolving the same admin's plan is idempotent (no duplicate row, same result)", async () => {
    const first = await getEffectivePlan(adminUserClient, platformAdminUserId);
    const second = await getEffectivePlan(adminUserClient, platformAdminUserId);
    expect(second.tierLevel).toBe(first.tierLevel);
    expect(second.source).toBe(first.source);

    const { count } = await admin
      .from("user_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", platformAdminUserId);
    expect(count).toBe(1);
  });

  it("a REGULAR (non-admin) user with no subscription row still resolves to tier 0 — the guard never over-grants", async () => {
    const plan = await getEffectivePlan(regularUserClient, regularUserId);
    expect(plan.tierLevel).toBe(0);
    expect(plan.planName).toBeNull();
    expect(plan.source).toBeNull();

    const { data: row } = await admin.from("user_subscriptions").select("id").eq("user_id", regularUserId).maybeSingle();
    expect(row).toBeNull();
  });
});
