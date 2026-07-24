// Dedicated audit test: proves no non-admin path can write to the lender
// catalog (lenders/programs/guideline_versions/rules) or the
// lender-documents Storage bucket / lender-linked documents rows.
//
// AUDIT FINDING (fixed alongside this test): the original catalog-write
// RLS policies (rls-policies.sql) granted write access to any user with
// org-level role 'underwriter' or 'org_admin' — and every regular sign-up
// is auto-granted 'org_admin' of their own org by the onboarding trigger.
// So, in practice, EVERY regular user could write directly to these
// tables via the API, completely bypassing the admin-only CSV/PDF-import
// UI and server actions. Fixed in supabase/lender-catalog-write-lockdown.sql
// (writes now require public.is_platform_admin()); this test guards
// against a regression.
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

describe.skipIf(!hasCredentials)("Admin-only upload audit (live database)", () => {
  let admin: SupabaseClient;
  let regularClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let regularUserId: string;
  let organizationId: string;
  const email = `nqn-upload-audit-${Date.now()}@gmail.com`;
  const password = "Upload-Audit-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    anonClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !created.user) throw new Error(`Failed to create test user: ${error?.message}`);
    regularUserId = created.user.id;

    regularClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await regularClient.auth.signInWithPassword({ email, password });

    const { data: membership } = await regularClient
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", regularUserId)
      .maybeSingle();
    organizationId = membership!.organization_id as string;
    // Confirms the premise: this plain sign-up really is org_admin of
    // their own org, which is exactly the role the old policy trusted.
    expect(membership!.role).toBe("org_admin");
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
    if (regularUserId) {
      await admin.from("users").delete().eq("id", regularUserId);
      await admin.auth.admin.deleteUser(regularUserId);
    }
  }, 30_000);

  it("a regular org_admin user cannot insert a lender directly via the API", async () => {
    const { error } = await regularClient
      .from("lenders")
      .insert({ organization_id: organizationId, name: "Should be blocked", tier_level: 1 });
    expect(error).not.toBeNull();
  }, 15_000);

  it("a regular org_admin user cannot insert a program directly via the API", async () => {
    const { error } = await regularClient
      .from("programs")
      .insert({ organization_id: organizationId, lender_id: "00000000-0000-0000-0000-000000000000", name: "x", config: {} });
    expect(error).not.toBeNull();
  }, 15_000);

  it("a regular org_admin user cannot insert a guideline_version directly via the API", async () => {
    const { error } = await regularClient.from("guideline_versions").insert({
      organization_id: organizationId,
      program_id: "00000000-0000-0000-0000-000000000000",
      label: "x",
      effective_date: "2026-01-01",
      verification_status: "draft",
    });
    expect(error).not.toBeNull();
  }, 15_000);

  it("a regular org_admin user cannot insert a rule directly via the API", async () => {
    const { error } = await regularClient.from("rules").insert({
      organization_id: organizationId,
      program_id: "00000000-0000-0000-0000-000000000000",
      guideline_version_id: "00000000-0000-0000-0000-000000000000",
      category: "x",
      name: "x",
      definition: {},
      severity: "soft",
      user_explanation: "x",
      verification_status: "draft",
    });
    expect(error).not.toBeNull();
  }, 15_000);

  it("an unauthenticated (anon) request cannot insert a lender either", async () => {
    const { error } = await anonClient
      .from("lenders")
      .insert({ organization_id: organizationId, name: "Should be blocked (anon)", tier_level: 1 });
    expect(error).not.toBeNull();
  }, 15_000);

  it("a regular user cannot upload to the lender-documents Storage bucket", async () => {
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const { error } = await regularClient.storage
      .from("lender-documents")
      .upload(`${organizationId}/should-not-work.pdf`, fakePdf, { contentType: "application/pdf" });
    expect(error).not.toBeNull();
  }, 15_000);

  it("an unauthenticated (anon) request cannot upload to the lender-documents Storage bucket either", async () => {
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const { error } = await anonClient.storage
      .from("lender-documents")
      .upload(`${organizationId}/anon-should-not-work.pdf`, fakePdf, { contentType: "application/pdf" });
    expect(error).not.toBeNull();
  }, 15_000);

  it("getCatalog() reads the shared platform catalog directly — no per-organization self-seeding step anymore", async () => {
    // Superseded test: self-seeding a demo catalog into each new org was
    // removed once lenders/programs/rules became a single shared platform
    // catalog (see src/lib/platformCatalog.ts) — reads always target the
    // one canonical catalog organization regardless of the caller's own
    // org, so there is nothing left to seed into a brand-new org's own
    // (permanently empty) lenders table.
    const { SupabaseRepository } = await import("@/lib/repository/supabaseRepository");
    const repo = new SupabaseRepository(regularClient, regularUserId);
    const catalog = await repo.getCatalog(organizationId);
    // Tier-filtered to 0 (no plan), so the repository call returns no
    // lenders — this organization's OWN lenders table stays empty forever.
    expect(catalog.lenders).toHaveLength(0);

    const { data: actualLenders } = await admin.from("lenders").select("id").eq("organization_id", organizationId);
    expect((actualLenders ?? []).length).toBe(0);
  }, 20_000);
});
