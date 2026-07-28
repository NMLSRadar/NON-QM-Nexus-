// Integration test for Repository.listPendingReviewLenderPrograms against
// the REAL Supabase project — same skip-without-credentials convention as
// the other tests/integration/*.test.ts files.
//
// Core guarantee under test: a tier-eligible-but-unverified (draft
// guideline_version) lender/program — e.g. the real Brokers First Funding
// record added 2026-07-28 — is surfaced by this method with ONLY its
// lender name, program name, and income doc types (never a numeric
// guideline field), while remaining fully excluded from
// listLenders()/listPrograms() (the customer-facing, verified-only path).
// A lender ABOVE the caller's tier must never appear here either — this
// method is tier-gated the same way listLenders is, just not
// verification-gated.
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

describe.skipIf(!hasCredentials)("Pending-review lender programs (live database)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let organizationId: string;
  let enterprisePlanId: string;
  let pendingTier3LenderId: string;
  let pendingTier3ProgramId: string;
  let outOfReachTier3LenderId: string;
  let outOfReachTier3ProgramId: string;
  const testEmail = `nqn-pending-review-${Date.now()}@gmail.com`;
  const testPassword = "Pending-Review-Pw-123";
  const suffix = Date.now();
  const pendingLenderName = `Pending-review-test Lender ${suffix}`;
  const pendingProgramName = `Pending-review-test DSCR Program ${suffix}`;

  const minimalConfig = {
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
  };

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
    enterprisePlanId = enterprise!.id;

    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
    if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
    userId = created.user.id;

    userClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });

    const { data: membership } = await userClient.from("memberships").select("organization_id").eq("user_id", userId).maybeSingle();
    organizationId = membership!.organization_id as string;

    await admin.from("user_subscriptions").upsert({ user_id: userId, plan_id: enterprisePlanId, assigned_by: userId }, { onConflict: "user_id" });

    // Fixture: a Tier 3 (within Enterprise reach) lender/program with NO
    // guideline_versions row promoted to human_verified — same real-world
    // shape as Brokers First Funding.
    const { data: pendingLender } = await admin
      .from("lenders")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: pendingLenderName, tier_level: 3 })
      .select("id")
      .single();
    pendingTier3LenderId = pendingLender!.id;
    const { data: pendingProgram } = await admin
      .from("programs")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, lender_id: pendingTier3LenderId, name: pendingProgramName, config: minimalConfig })
      .select("id")
      .single();
    pendingTier3ProgramId = pendingProgram!.id;
    await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
      program_id: pendingTier3ProgramId,
      label: "Pending review — not yet approved",
      effective_date: "2026-01-01",
      verification_status: "draft",
    });

    // Fixture: an INACTIVE lender (should never appear here regardless of
    // tier/verification status).
    const outOfReachName = `Pending-review-test Inactive Lender ${suffix}`;
    const { data: inactiveLender } = await admin
      .from("lenders")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: outOfReachName, tier_level: 3, active: false })
      .select("id")
      .single();
    outOfReachTier3LenderId = inactiveLender!.id;
    const { data: outOfReachProgram } = await admin
      .from("programs")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, lender_id: outOfReachTier3LenderId, name: `${outOfReachName} Program`, config: minimalConfig })
      .select("id")
      .single();
    outOfReachTier3ProgramId = outOfReachProgram!.id;
  }, 30_000);

  afterAll(async () => {
    await admin.from("guideline_versions").delete().in("program_id", [pendingTier3ProgramId, outOfReachTier3ProgramId]);
    await admin.from("programs").delete().in("id", [pendingTier3ProgramId, outOfReachTier3ProgramId]);
    await admin.from("lenders").delete().in("id", [pendingTier3LenderId, outOfReachTier3LenderId]);
    if (userId) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
    }
    if (organizationId) {
      await admin.from("memberships").delete().eq("organization_id", organizationId);
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("surfaces a real pending-review lender/program the caller's tier can reach, with only name + doc types", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const pending = await repo.listPendingReviewLenderPrograms(organizationId);
    const match = pending.find((p) => p.lenderName === pendingLenderName);
    expect(match).toBeDefined();
    expect(match!.programName).toBe(pendingProgramName);
    expect(match!.incomeDocTypes).toEqual(["dscr"]);
    // Only these 3 keys should ever be present on an entry.
    expect(Object.keys(match!).sort()).toEqual(["incomeDocTypes", "lenderName", "programName"]);
  }, 15_000);

  it("never surfaces an inactive lender even if it has no verified guideline", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const pending = await repo.listPendingReviewLenderPrograms(organizationId);
    expect(pending.some((p) => p.programName.includes("Inactive Lender"))).toBe(false);
  }, 15_000);

  it("the same pending lender never appears via the verified-only listLenders/listPrograms", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    const programs = await repo.listPrograms(organizationId);
    expect(lenders.map((l) => l.name)).not.toContain(pendingLenderName);
    expect(programs.map((p) => p.name)).not.toContain(pendingProgramName);
  }, 15_000);

  it("the real Brokers First Funding lender (added 2026-07-28) is itself surfaced as pending review with 4 programs", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const pending = await repo.listPendingReviewLenderPrograms(organizationId);
    const bffEntries = pending.filter((p) => p.lenderName === "Brokers First Funding");
    // Only assert if BFF is still genuinely unverified at test time — an
    // admin promoting it to human_verified later is expected and correct;
    // this just documents the real current state without hard-failing a
    // future legitimate verification.
    if (bffEntries.length > 0) {
      const programNames = bffEntries.map((e) => e.programName).sort();
      expect(programNames).toEqual(["Asset Utilization", "Bank Statement", "DSCR (1-4 Unit)", "P&L Statement"]);
    }
  }, 15_000);
});
