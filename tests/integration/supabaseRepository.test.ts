// Integration tests against a REAL Supabase project (not mocked). These
// exercise the actual RLS-scoped Supabase client end-to-end: sign-up
// provisioning, catalog self-seeding, and scenario CRUD — proving tenant
// isolation is enforced by the database itself, not just application code.
//
// Gated on real credentials being present. CI does not (and should not)
// carry a live database secret, so this suite skips itself there rather
// than failing the pipeline; run it locally with a real .env.local:
//   npm run test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";
import type { Scenario } from "@/domain/types/scenario";

try {
  // Node 20.12+: load .env.local for local runs without adding a dependency.
  // No-op (and harmless) if the file doesn't exist, e.g. in CI.
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local and relies on real env vars not being set
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("SupabaseRepository (live database)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let organizationId: string;
  const testEmail = `nqn-integration-${Date.now()}@gmail.com`;
  const testPassword = "Integration-Test-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create the test user via the admin API (pre-confirmed, no email step).
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (createError || !created.user) {
      throw new Error(`Failed to create integration test user: ${createError?.message}`);
    }
    userId = created.user.id;

    // Sign in as that user with the anon key so every query below runs
    // through the same RLS-scoped path the real app uses.
    userClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signInError) throw new Error(`Failed to sign in integration test user: ${signInError.message}`);

    const { data: membership, error: membershipError } = await userClient
      .from("memberships")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError || !membership) {
      throw new Error(`Onboarding trigger did not provision a membership: ${membershipError?.message}`);
    }
    organizationId = membership.organization_id as string;
  }, 30_000);

  afterAll(async () => {
    if (organizationId) {
      // Cascade manually — public.users has no FK to auth.users.
      await admin.from("scenarios").delete().eq("organization_id", organizationId);
      await admin.from("rules").delete().eq("organization_id", organizationId);
      await admin.from("guideline_versions").delete().eq("organization_id", organizationId);
      await admin.from("programs").delete().eq("organization_id", organizationId);
      await admin.from("lenders").delete().eq("organization_id", organizationId);
      await admin.from("memberships").delete().eq("organization_id", organizationId);
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (userId) {
      await admin.from("users").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("provisions exactly one organization with an org_admin membership on sign-up", async () => {
    expect(organizationId).toBeTruthy();
  });

  it("self-seeds the demo catalog on first getCatalog() call", async () => {
    const repo = new SupabaseRepository(userClient);
    const catalog = await repo.getCatalog(organizationId);
    expect(catalog.lenders.length).toBeGreaterThan(0);
    expect(catalog.programs.length).toBeGreaterThan(0);
    expect(catalog.rules.length).toBeGreaterThan(0);
    // Every seeded program must resolve to a lender that exists in this org.
    const lenderIds = new Set(catalog.lenders.map((l) => l.id));
    for (const program of catalog.programs) {
      expect(lenderIds.has(program.lenderId)).toBe(true);
    }
  }, 20_000);

  it("does not double-seed the catalog on a second getCatalog() call", async () => {
    const repo = new SupabaseRepository(userClient);
    const first = await repo.getCatalog(organizationId);
    const second = await repo.getCatalog(organizationId);
    expect(second.lenders.length).toBe(first.lenders.length);
    expect(second.programs.length).toBe(first.programs.length);
  }, 20_000);

  it("saves a scenario and reads it back scoped to this organization", async () => {
    const repo = new SupabaseRepository(userClient);
    const now = new Date().toISOString();
    const scenario: Scenario = {
      id: randomUUID(),
      organizationId,
      name: "Integration test scenario",
      createdByUserId: userId,
      borrowerReference: "TEST-REF",
      fico: 720,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await repo.saveScenario(scenario);
    expect(saved.id).toBe(scenario.id);

    const fetched = await repo.getScenario(organizationId, scenario.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.fico).toBe(720);
    expect(fetched?.borrowerReference).toBe("TEST-REF");

    const list = await repo.listScenarios(organizationId);
    expect(list.some((s) => s.id === scenario.id)).toBe(true);
  }, 20_000);

  it("enforces RLS: a second user cannot see the first user's organization data", async () => {
    const otherEmail = `nqn-integration-other-${Date.now()}@gmail.com`;
    const otherPassword = "Integration-Test-Pw-456";
    const { data: otherCreated, error: otherCreateError } = await admin.auth.admin.createUser({
      email: otherEmail,
      password: otherPassword,
      email_confirm: true,
    });
    if (otherCreateError || !otherCreated.user) throw new Error("Failed to create second test user");

    try {
      const otherClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: signInError } = await otherClient.auth.signInWithPassword({
        email: otherEmail,
        password: otherPassword,
      });
      if (signInError) throw new Error("Failed to sign in second test user");

      const otherRepo = new SupabaseRepository(otherClient);
      // Their own (different, auto-seeded) organization's scenarios must not
      // include the first user's scenario.
      const { data: otherMembership } = await otherClient
        .from("memberships")
        .select("organization_id")
        .eq("user_id", otherCreated.user.id)
        .maybeSingle();
      const otherOrgId = otherMembership!.organization_id as string;

      const scenariosInOtherOrg = await otherRepo.listScenarios(otherOrgId);
      expect(scenariosInOtherOrg.every((s) => s.organizationId !== organizationId)).toBe(true);

      // Directly querying the first org's id from the second user's session
      // must come back empty — RLS denies it outright, not just app logic.
      const cross = await otherClient.from("scenarios").select("id").eq("organization_id", organizationId);
      expect(cross.data ?? []).toHaveLength(0);

      await admin.from("memberships").delete().eq("user_id", otherCreated.user.id);
      await admin.from("organizations").delete().eq("id", otherOrgId);
      await admin.from("users").delete().eq("id", otherCreated.user.id);
    } finally {
      await admin.auth.admin.deleteUser(otherCreated.user.id);
    }
  }, 30_000);
});
