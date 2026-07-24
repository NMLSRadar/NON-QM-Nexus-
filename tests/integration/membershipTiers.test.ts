// Integration tests for the membership/tier system against the REAL
// Supabase project. Gated on real credentials — skips in CI without
// secrets, same convention as tests/integration/supabaseRepository.test.ts.
//
// IMPORTANT: lenders/programs/guideline_versions/rules are a SHARED
// platform catalog (see src/lib/platformCatalog.ts) — every fixture
// lender here is inserted into PLATFORM_CATALOG_ORGANIZATION_ID (the one
// real organization that holds the catalog), given a unique per-run name,
// and deleted by that exact name in afterAll — NEVER by a blanket
// organization_id delete, since that organization also holds the real
// production lender catalog.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";
import { getEffectivePlan } from "@/lib/repository/membership";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

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
  const suffix = Date.now();
  const tier1Name = `Essential-only Lender ${suffix}`;
  const tier2Name = `Professional Lender ${suffix}`;
  const tier3Name = `Enterprise Lender ${suffix}`;
  const brandNewName = `Brand New Lender ${suffix}`;
  const allTestNames = [tier1Name, tier2Name, tier3Name, brandNewName];

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

    // Seed 3 test lenders at each tier level into the SHARED PLATFORM
    // CATALOG organization (uniquely named per test run) — writes go
    // through the service-role client since lenders/programs writes are
    // platform-admin-only under RLS.
    await admin.from("lenders").insert([
      { organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: tier1Name, tier_level: 1 },
      { organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: tier2Name, tier_level: 2 },
      { organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: tier3Name, tier_level: 3 },
    ]);
  }, 30_000);

  afterAll(async () => {
    await admin.from("lenders").delete().eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).in("name", allTestNames);
    if (organizationId) {
      await admin.from("memberships").delete().eq("organization_id", organizationId);
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (userId) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      await admin.from("users").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("a user with no subscription sees zero lenders (tier 0)", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders).toHaveLength(0);
  }, 15_000);

  it("assigning the Essential plan reveals only tier-1 lenders, including our tier-1 fixture", async () => {
    await admin.from("user_subscriptions").upsert(
      { user_id: userId, plan_id: essentialPlanId, assigned_by: userId },
      { onConflict: "user_id" }
    );
    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    // The shared catalog also contains real production Tier-1 lenders, so
    // this asserts containment + the tier invariant, not exact equality.
    expect(lenders.map((l) => l.name)).toContain(tier1Name);
    expect(lenders.every((l) => l.tierLevel <= 1)).toBe(true);
    expect(lenders.map((l) => l.name)).not.toContain(tier2Name);
    expect(lenders.map((l) => l.name)).not.toContain(tier3Name);
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
    expect(lenders.map((l) => l.name)).toContain(tier1Name);
    expect(lenders.every((l) => l.tierLevel <= 1)).toBe(true);
  }, 15_000);

  it("upgrading to Enterprise reveals every lender, including future ones", async () => {
    const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
    await admin.from("user_subscriptions").update({ plan_id: enterprise!.id }).eq("user_id", userId);

    // Simulate a brand-new lender added after the user upgraded.
    await admin
      .from("lenders")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: brandNewName, tier_level: 3, id: randomUUID() });

    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    const names = lenders.map((l) => l.name);
    for (const expected of [tier1Name, tier2Name, tier3Name, brandNewName]) {
      expect(names).toContain(expected);
    }
  }, 15_000);

  it("a second, unrelated user in a DIFFERENT organization sees the SAME shared platform catalog at the same tier", async () => {
    // This is the behavior the platform-catalog fix intentionally
    // guarantees: lender/program visibility is governed by subscription
    // tier only, never by which organization a signup happens to create.
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

      const { data: otherMembership } = await otherClient
        .from("memberships")
        .select("organization_id")
        .eq("user_id", otherCreated.user.id)
        .maybeSingle();
      const otherOrgId = otherMembership!.organization_id as string;
      expect(otherOrgId).not.toBe(organizationId); // genuinely a different organization

      const repo = new SupabaseRepository(otherClient, otherCreated.user.id);
      const lenders = await repo.listLenders(otherOrgId);
      const names = lenders.map((l) => l.name);
      // Same Enterprise tier as the first user post-upgrade -> same fixture
      // lenders visible, despite belonging to a completely different org.
      for (const expected of [tier1Name, tier2Name, tier3Name]) {
        expect(names).toContain(expected);
      }

      await admin.from("user_subscriptions").delete().eq("user_id", otherCreated.user.id);
      await admin.from("memberships").delete().eq("user_id", otherCreated.user.id);
      await admin.from("organizations").delete().eq("id", otherOrgId);
      await admin.from("users").delete().eq("id", otherCreated.user.id);
    } finally {
      await admin.auth.admin.deleteUser(otherCreated.user.id);
    }
  }, 30_000);
});
