// Integration tests for the membership/tier system against the REAL
// Supabase project. Gated on real credentials — skips in CI without
// secrets, same convention as tests/integration/supabaseRepository.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";
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

describe.skipIf(!hasCredentials)("Membership tiers (live database)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let organizationId: string;
  let essentialPlanId: string;
  let fiftyOffDiscountId: string;
  const testEmail = `nqn-tier-integration-${Date.now()}@gmail.com`;
  const testPassword = "Tier-Integration-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: essential } = await admin.from("membership_plans").select("id").eq("key", "essential").single();
    essentialPlanId = essential!.id;
    const { data: discount } = await admin.from("discounts").select("id").eq("name", "50% Off").single();
    fiftyOffDiscountId = discount!.id;

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

    // Seed 3 lenders at each tier level directly (skip the full sample
    // catalog seed — we only need tier filtering behavior here).
    await userClient.from("lenders").insert([
      { organization_id: organizationId, name: "Essential-only Lender", tier_level: 1 },
      { organization_id: organizationId, name: "Professional Lender", tier_level: 2 },
      { organization_id: organizationId, name: "Enterprise Lender", tier_level: 3 },
    ]);
  }, 30_000);

  afterAll(async () => {
    if (organizationId) {
      await admin.from("rules").delete().eq("organization_id", organizationId);
      await admin.from("guideline_versions").delete().eq("organization_id", organizationId);
      await admin.from("programs").delete().eq("organization_id", organizationId);
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

  it("a user with no subscription sees zero lenders", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders).toHaveLength(0);
  }, 15_000);

  it("assigning the Essential plan reveals only tier-1 lenders", async () => {
    await admin.from("user_subscriptions").upsert(
      { user_id: userId, plan_id: essentialPlanId, assigned_by: userId },
      { onConflict: "user_id" }
    );
    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders.map((l) => l.name)).toEqual(["Essential-only Lender"]);
  }, 15_000);

  it("a 50% discount halves the effective price without changing tier access", async () => {
    await admin
      .from("user_subscriptions")
      .update({ discount_id: fiftyOffDiscountId })
      .eq("user_id", userId);

    const plan = await getEffectivePlan(userClient, userId);
    expect(plan.tierLevel).toBe(1);
    expect(plan.monthlyPriceCents).toBe(6000);
    expect(plan.effectivePriceCents).toBe(3000);

    // Tier access must be unaffected by the discount.
    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders.map((l) => l.name)).toEqual(["Essential-only Lender"]);
  }, 15_000);

  it("upgrading to Enterprise reveals every lender, including future ones", async () => {
    const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
    await admin.from("user_subscriptions").update({ plan_id: enterprise!.id }).eq("user_id", userId);

    // Simulate a brand-new lender added after the user upgraded.
    await admin
      .from("lenders")
      .insert({ organization_id: organizationId, name: "Brand New Lender", tier_level: 3, id: randomUUID() });

    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders.map((l) => l.name).sort()).toEqual(
      ["Brand New Lender", "Enterprise Lender", "Essential-only Lender", "Professional Lender"].sort()
    );
  }, 15_000);

  it("RLS still denies a second, unrelated user access to this organization's lenders regardless of their own tier", async () => {
    const otherEmail = `nqn-tier-integration-other-${Date.now()}@gmail.com`;
    const { data: otherCreated, error: otherErr } = await admin.auth.admin.createUser({
      email: otherEmail,
      password: "Other-Test-Pw-123",
      email_confirm: true,
    });
    if (otherErr || !otherCreated.user) throw new Error("Failed to create second test user");

    try {
      const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
      await admin
        .from("user_subscriptions")
        .upsert({ user_id: otherCreated.user.id, plan_id: enterprise!.id }, { onConflict: "user_id" });

      const otherClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await otherClient.auth.signInWithPassword({ email: otherEmail, password: "Other-Test-Pw-123" });

      const repo = new SupabaseRepository(otherClient, otherCreated.user.id);
      // Even on Enterprise (tier 3, unrestricted), this user cannot see the
      // first user's organization at all — RLS org-scoping still applies.
      const lenders = await repo.listLenders(organizationId);
      expect(lenders).toHaveLength(0);

      await admin.from("user_subscriptions").delete().eq("user_id", otherCreated.user.id);
      const { data: otherMembership } = await otherClient
        .from("memberships")
        .select("organization_id")
        .eq("user_id", otherCreated.user.id)
        .maybeSingle();
      if (otherMembership) {
        await admin.from("memberships").delete().eq("user_id", otherCreated.user.id);
        await admin.from("organizations").delete().eq("id", otherMembership.organization_id);
      }
      await admin.from("users").delete().eq("id", otherCreated.user.id);
    } finally {
      await admin.auth.admin.deleteUser(otherCreated.user.id);
    }
  }, 30_000);
});
