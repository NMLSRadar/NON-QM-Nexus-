// Integration test for the "lenders always visible, guidelines gated by
// tier" requirement, against the REAL Supabase project — same
// skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// Core guarantee under test: Repository.listAllLenders() must return every
// lender regardless of the caller's subscription tier (VISIBILITY is never
// gated), while Repository.listPrograms() must remain tier-filtered
// (GUIDELINE data stays gated) — this is the real, server-side enforcement
// behind the Lenders page's locked-card UI, not just a client-side hint a
// user could bypass by editing the page.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";
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

describe.skipIf(!hasCredentials)("Lender visibility vs. guideline access (live database)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let organizationId: string;
  let essentialPlanId: string;
  let professionalPlanId: string;
  const lenderIds: Record<1 | 2 | 3, string> = { 1: "", 2: "", 3: "" };
  const testEmail = `nqn-lender-visibility-${Date.now()}@gmail.com`;
  const testPassword = "Lender-Visibility-Pw-123";
  const suffix = Date.now();
  const testLenderNamesByTier = { 1: `Visibility-test Lender T1 ${suffix}`, 2: `Visibility-test Lender T2 ${suffix}`, 3: `Visibility-test Lender T3 ${suffix}` } as const;
  const testProgramNamesByTier = { 1: `Visibility-test Program T1 ${suffix}`, 2: `Visibility-test Program T2 ${suffix}`, 3: `Visibility-test Program T3 ${suffix}` } as const;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: essential } = await admin.from("membership_plans").select("id").eq("key", "essential").single();
    essentialPlanId = essential!.id;
    const { data: professional } = await admin.from("membership_plans").select("id").eq("key", "professional").single();
    professionalPlanId = professional!.id;

    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
    if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
    userId = created.user.id;

    userClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });

    const { data: membership } = await userClient.from("memberships").select("organization_id").eq("user_id", userId).maybeSingle();
    organizationId = membership!.organization_id as string;

    for (const tier of [1, 2, 3] as const) {
      const { data: lender } = await admin
        .from("lenders")
        .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: testLenderNamesByTier[tier], tier_level: tier })
        .select("id")
        .single();
      lenderIds[tier] = lender!.id;
      const { data: program, error: programError } = await admin
        .from("programs")
        .insert({
          organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
          lender_id: lenderIds[tier],
          name: testProgramNamesByTier[tier],
          config: {
            incomeDocTypes: ["dscr"],
            loanPurposes: ["purchase"],
            occupancies: ["investment"],
            propertyTypes: ["single_family"],
            eligibleStates: "ALL",
            citizenshipEligible: ["us_citizen"],
            vestingEligible: ["individual"],
            minLoanAmount: 100000,
            maxLoanAmount: 1000000,
            minFico: 660,
            baseMaxLtv: 80,
            minReservesMonths: 0,
            interestOnlyAvailable: false,
            prepaymentPenaltyOptions: [],
            guidelineVersionLabel: "v1",
            effectiveDate: "2026-01-01",
            sourceCitation: "test fixture",
          },
        })
        .select("id")
        .single();
      if (programError || !program) throw new Error(`Failed to insert test program: ${programError?.message}`);
      // External-audit fix (2026-07-28) made listPrograms verified-only —
      // this disposable test fixture needs a human_verified
      // guideline_version to exercise TIER visibility (not verification,
      // which isn't what this suite tests).
      const { error: gvError } = await admin.from("guideline_versions").insert({
        organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
        program_id: program.id,
        label: "Test fixture — verified",
        effective_date: "2026-01-01",
        verification_status: "human_verified",
      });
      if (gvError) throw new Error(`Failed to insert test guideline_version: ${gvError.message}`);
    }
  }, 30_000);

  afterAll(async () => {
    const { data: testPrograms } = await admin
      .from("programs")
      .select("id")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .in("name", Object.values(testProgramNamesByTier));
    const testProgramIds = (testPrograms ?? []).map((p) => p.id as string);
    if (testProgramIds.length > 0) {
      await admin.from("guideline_versions").delete().in("program_id", testProgramIds);
    }
    await admin.from("programs").delete().eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).in("name", Object.values(testProgramNamesByTier));
    await admin.from("lenders").delete().eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).in("name", Object.values(testLenderNamesByTier));
    if (userId) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("a user with NO subscription sees ALL 3 tiers of lenders via listAllLenders, but zero programs via listPrograms", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const allLenders = await repo.listAllLenders(organizationId);
    const names = allLenders.map((l) => l.name);
    for (const expected of Object.values(testLenderNamesByTier)) expect(names).toContain(expected);

    // listLenders (the tier-gated method, still used elsewhere e.g. scenario
    // matching) correctly returns NONE of our fixtures with no active plan.
    const gatedLenders = await repo.listLenders(organizationId);
    const gatedNames = gatedLenders.map((l) => l.name);
    for (const notExpected of Object.values(testLenderNamesByTier)) expect(gatedNames).not.toContain(notExpected);

    // Guideline/program data must be completely absent — not merely hidden
    // by the UI — for a user with no active plan.
    const programs = await repo.listPrograms(organizationId);
    const programNames = programs.map((p) => p.name);
    for (const notExpected of Object.values(testProgramNamesByTier)) expect(programNames).not.toContain(notExpected);
  }, 15_000);

  it("a Tier 1 subscriber still sees all 3 tiers of lenders, but only Tier 1 programs", async () => {
    await admin.from("user_subscriptions").upsert({ user_id: userId, plan_id: essentialPlanId, assigned_by: userId }, { onConflict: "user_id" });

    const repo = new SupabaseRepository(userClient, userId);
    const allLenders = await repo.listAllLenders(organizationId);
    const names = allLenders.map((l) => l.name);
    for (const expected of Object.values(testLenderNamesByTier)) expect(names).toContain(expected);

    const programs = await repo.listPrograms(organizationId);
    const testProgramNames = programs.map((p) => p.name);
    expect(testProgramNames).toContain(testProgramNamesByTier[1]);
    expect(testProgramNames).not.toContain(testProgramNamesByTier[2]);
    expect(testProgramNames).not.toContain(testProgramNamesByTier[3]);
  }, 15_000);

  it("a Tier 2 subscriber still sees all 3 tiers of lenders, but only Tier 1+2 programs (not Tier 3)", async () => {
    await admin.from("user_subscriptions").upsert({ user_id: userId, plan_id: professionalPlanId, assigned_by: userId }, { onConflict: "user_id" });

    const repo = new SupabaseRepository(userClient, userId);
    const allLenders = await repo.listAllLenders(organizationId);
    const names = allLenders.map((l) => l.name);
    for (const expected of Object.values(testLenderNamesByTier)) expect(names).toContain(expected);

    const programs = await repo.listPrograms(organizationId);
    const testProgramNames = programs.map((p) => p.name);
    expect(testProgramNames).toContain(testProgramNamesByTier[1]);
    expect(testProgramNames).toContain(testProgramNamesByTier[2]);
    expect(testProgramNames).not.toContain(testProgramNamesByTier[3]);
  }, 15_000);
});
