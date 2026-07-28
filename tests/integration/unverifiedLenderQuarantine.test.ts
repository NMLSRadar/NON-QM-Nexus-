// Integration test for the external-audit "unverified lender quarantine"
// requirement (2026-07-28), against the REAL Supabase project — same
// skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// Core guarantee under test: a lender/program with NO human_verified
// guideline_version — whether it has no guideline_versions row at all, or
// one still sitting in ai_extracted_pending_review/imported_pending_review
// — must never appear via listLenders() or listPrograms() (the customer-
// facing, tier-gated queries used for matching and any advertised tier
// count), even for a fully-subscribed Enterprise-tier account. It MUST
// still appear via listAllLenders() (the admin-only, unfiltered visibility
// used by /admin/lenders and /admin/documents) — pending review is an
// admin-only state, not a customer-invisible one.
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

describe.skipIf(!hasCredentials)("Unverified lender quarantine (live database)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let organizationId: string;
  let enterprisePlanId: string;
  let unverifiedLenderId: string;
  let pendingLenderId: string;
  let unverifiedProgramId: string;
  let pendingProgramId: string;
  const testEmail = `nqn-quarantine-integration-${Date.now()}@gmail.com`;
  const testPassword = "Quarantine-Integration-Pw-123";
  const suffix = Date.now();
  // Tier 1 so it's within reach of every tier we test.
  const unverifiedLenderName = `Quarantine-test No-GV Lender ${suffix}`;
  const unverifiedProgramName = `Quarantine-test No-GV Program ${suffix}`;
  const pendingLenderName = `Quarantine-test Pending Lender ${suffix}`;
  const pendingProgramName = `Quarantine-test Pending Program ${suffix}`;
  const allTestLenderNames = [unverifiedLenderName, pendingLenderName];

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

    // Enterprise tier — the highest tier, so any lender still missing
    // from listLenders()/listPrograms() here is missing because it's
    // UNVERIFIED, never because of a tier restriction.
    await admin.from("user_subscriptions").upsert({ user_id: userId, plan_id: enterprisePlanId, assigned_by: userId }, { onConflict: "user_id" });

    // Fixture 1: a lender/program with NO guideline_versions row at all
    // (e.g. inserted directly, never run through the review workflow).
    const { data: unverifiedLender } = await admin
      .from("lenders")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: unverifiedLenderName, tier_level: 1 })
      .select("id")
      .single();
    unverifiedLenderId = unverifiedLender!.id;
    const { data: unverifiedProgram } = await admin
      .from("programs")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, lender_id: unverifiedLenderId, name: unverifiedProgramName, config: minimalConfig })
      .select("id")
      .single();
    unverifiedProgramId = unverifiedProgram!.id;

    // Fixture 2: a lender/program with a guideline_version still sitting
    // in ai_extracted_pending_review — an admin hasn't approved it yet.
    const { data: pendingLender } = await admin
      .from("lenders")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: pendingLenderName, tier_level: 1 })
      .select("id")
      .single();
    pendingLenderId = pendingLender!.id;
    const { data: pendingProgram } = await admin
      .from("programs")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, lender_id: pendingLenderId, name: pendingProgramName, config: minimalConfig })
      .select("id")
      .single();
    pendingProgramId = pendingProgram!.id;
    await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
      program_id: pendingProgramId,
      label: "Pending review — not yet approved",
      effective_date: "2026-01-01",
      verification_status: "ai_extracted_pending_review",
    });
  }, 30_000);

  afterAll(async () => {
    await admin.from("guideline_versions").delete().in("program_id", [unverifiedProgramId, pendingProgramId]);
    await admin.from("programs").delete().in("id", [unverifiedProgramId, pendingProgramId]);
    await admin.from("lenders").delete().eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).in("name", allTestLenderNames);
    if (userId) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("a fully-subscribed Enterprise account never sees an unverified lender (no guideline_versions row) via listLenders", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders.map((l) => l.name)).not.toContain(unverifiedLenderName);
  }, 15_000);

  it("a fully-subscribed Enterprise account never sees a PENDING-REVIEW lender via listLenders", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const lenders = await repo.listLenders(organizationId);
    expect(lenders.map((l) => l.name)).not.toContain(pendingLenderName);
  }, 15_000);

  it("neither the unverified nor the pending-review program ever evaluates via listPrograms", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const programs = await repo.listPrograms(organizationId);
    const names = programs.map((p) => p.name);
    expect(names).not.toContain(unverifiedProgramName);
    expect(names).not.toContain(pendingProgramName);
  }, 15_000);

  it("listAllLenders (admin-only visibility) still surfaces both — pending review is an admin-only state, not customer-invisible-forever", async () => {
    const repo = new SupabaseRepository(userClient, userId);
    const allLenders = await repo.listAllLenders(organizationId);
    const names = allLenders.map((l) => l.name);
    expect(names).toContain(unverifiedLenderName);
    expect(names).toContain(pendingLenderName);
  }, 15_000);
});
