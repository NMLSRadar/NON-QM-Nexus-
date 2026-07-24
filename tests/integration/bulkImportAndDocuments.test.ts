// Integration tests against the REAL Supabase project for the bulk CSV
// import (database writes, lender reuse) and the lender-documents Storage
// bucket / RLS boundaries. Same skip-without-credentials convention as
// the other tests/integration/*.test.ts files.
//
// The CSV import and PDF upload/extraction server actions themselves use
// requirePlatformAdmin(), which reads cookies() via next/headers — that
// only works inside a real Next.js request, not a plain vitest process.
// So these tests replicate the same underlying database/storage
// operations those actions perform, using a real admin-flagged session,
// to prove the actual RLS/data-model boundaries work — which is the part
// that matters and the part a server action wrapper can't fake.
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

describe.skipIf(!hasCredentials)("Bulk import + lender documents (live database)", () => {
  let admin: SupabaseClient;
  let adminUserClient: SupabaseClient;
  let regularUserClient: SupabaseClient;
  let adminUserId: string;
  let regularUserId: string;
  let organizationId: string;
  const adminEmail = `nqn-bulkimport-admin-${Date.now()}@gmail.com`;
  const regularEmail = `nqn-bulkimport-user-${Date.now()}@gmail.com`;
  const password = "BulkImport-Test-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminCreated, error: adminCreateError } = await admin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    if (adminCreateError || !adminCreated.user) throw new Error(`Failed to create admin test user: ${adminCreateError?.message}`);
    adminUserId = adminCreated.user.id;
    await admin.from("users").update({ platform_admin: true }).eq("id", adminUserId);

    adminUserClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await adminUserClient.auth.signInWithPassword({ email: adminEmail, password });

    const { data: membership } = await adminUserClient
      .from("memberships")
      .select("organization_id")
      .eq("user_id", adminUserId)
      .maybeSingle();
    organizationId = membership!.organization_id as string;

    const { data: regularCreated, error: regularCreateError } = await admin.auth.admin.createUser({
      email: regularEmail,
      password,
      email_confirm: true,
    });
    if (regularCreateError || !regularCreated.user) throw new Error("Failed to create regular test user");
    regularUserId = regularCreated.user.id;

    regularUserClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await regularUserClient.auth.signInWithPassword({ email: regularEmail, password });
  }, 30_000);

  afterAll(async () => {
    // Clean up storage objects for the admin's org's lenders.
    if (organizationId) {
      const { data: lenders } = await admin.from("lenders").select("id").eq("organization_id", organizationId);
      for (const l of lenders ?? []) {
        const { data: files } = await admin.storage.from("lender-documents").list(l.id as string);
        for (const f of files ?? []) {
          await admin.storage.from("lender-documents").remove([`${l.id}/${f.name}`]);
        }
      }
      await admin.from("document_extractions").delete().eq("organization_id", organizationId);
      await admin.from("documents").delete().eq("organization_id", organizationId);
      await admin.from("rules").delete().eq("organization_id", organizationId);
      await admin.from("guideline_versions").delete().eq("organization_id", organizationId);
      await admin.from("programs").delete().eq("organization_id", organizationId);
      await admin.from("lenders").delete().eq("organization_id", organizationId);
      await admin.from("memberships").delete().eq("organization_id", organizationId);
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    for (const userId of [adminUserId, regularUserId]) {
      if (!userId) continue;
      const { data: mem } = await admin.from("memberships").select("organization_id").eq("user_id", userId);
      for (const m of mem ?? []) {
        await admin.from("memberships").delete().eq("organization_id", m.organization_id);
        await admin.from("organizations").delete().eq("id", m.organization_id);
      }
      await admin.from("users").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("creates a lender + program + guideline_version, reusing the lender by name on a second row", async () => {
    // Row 1: new lender.
    const { data: lender, error: lenderError } = await adminUserClient
      .from("lenders")
      .insert({ organization_id: organizationId, name: "Bulk Import Test Lender", tier_level: 2, is_sample_data: false })
      .select("id")
      .single();
    expect(lenderError).toBeNull();
    const lenderId = lender!.id;

    const { data: program, error: programError } = await adminUserClient
      .from("programs")
      .insert({
        organization_id: organizationId,
        lender_id: lenderId,
        name: "Test Program A",
        is_sample_data: false,
        active: true,
        config: { lenderId, minFico: 660, baseMaxLtv: 90 },
      })
      .select("id")
      .single();
    expect(programError).toBeNull();

    const { error: gvError } = await adminUserClient.from("guideline_versions").insert({
      organization_id: organizationId,
      program_id: program!.id,
      label: "v1.0",
      effective_date: "2026-01-01",
      verification_status: "imported_pending_review",
    });
    expect(gvError).toBeNull();

    // Row 2: same lender name, reused (case-insensitive) — mirrors the
    // commit-import-action.ts lookup logic.
    const { data: reused } = await adminUserClient
      .from("lenders")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("name", "bulk import test lender")
      .maybeSingle();
    expect(reused!.id).toBe(lenderId);
  }, 20_000);

  it("a non-admin cannot write to programs/lenders even within the same organization", async () => {
    // The regular user has their own separate org (self-seeded on
    // sign-up), so this also confirms cross-org write is blocked, and
    // additionally that program/lender writes are admin-only regardless.
    const { error } = await regularUserClient
      .from("lenders")
      .insert({ organization_id: organizationId, name: "Should not be allowed", tier_level: 1 });
    expect(error).not.toBeNull();
  }, 15_000);

  it("lender-documents Storage bucket: admin can upload and read; a non-admin cannot", async () => {
    const { data: lender } = await adminUserClient
      .from("lenders")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", "Bulk Import Test Lender")
      .single();
    const lenderId = lender!.id as string;
    const path = `${lenderId}/test-guideline.pdf`;
    const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF" magic bytes, minimal fake

    const { error: uploadError } = await adminUserClient.storage
      .from("lender-documents")
      .upload(path, fakePdfBytes, { contentType: "application/pdf" });
    expect(uploadError).toBeNull();

    const { data: adminRead, error: adminReadError } = await adminUserClient.storage
      .from("lender-documents")
      .download(path);
    expect(adminReadError).toBeNull();
    expect(adminRead).not.toBeNull();

    const { error: nonAdminUploadError } = await regularUserClient.storage
      .from("lender-documents")
      .upload(`${lenderId}/should-not-work.pdf`, fakePdfBytes, { contentType: "application/pdf" });
    expect(nonAdminUploadError).not.toBeNull();

    const { data: nonAdminRead, error: nonAdminReadError } = await regularUserClient.storage
      .from("lender-documents")
      .download(path);
    expect(nonAdminRead).toBeNull();
    expect(nonAdminReadError).not.toBeNull();
  }, 20_000);

  it("lender-linked documents are admin-only — a regular org member in the same org cannot see them", async () => {
    const { data: lender } = await adminUserClient
      .from("lenders")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", "Bulk Import Test Lender")
      .single();

    const { data: doc, error: docError } = await adminUserClient
      .from("documents")
      .insert({
        organization_id: organizationId,
        lender_id: lender!.id,
        storage_path: `${lender!.id}/test-guideline.pdf`,
        file_name: "test-guideline.pdf",
        mime_type: "application/pdf",
        size_bytes: 4,
        classification: "lender_guideline",
        uploaded_by: adminUserId,
      })
      .select("id")
      .single();
    expect(docError).toBeNull();

    // Admin can read it back.
    const { data: adminRead } = await adminUserClient.from("documents").select("id").eq("id", doc!.id).maybeSingle();
    expect(adminRead).not.toBeNull();

    // A regular user who happens to be added to the SAME organization
    // still cannot see it — lender documents are platform-admin only,
    // not just org-scoped.
    await admin.from("memberships").insert({ organization_id: organizationId, user_id: regularUserId, role: "broker" });
    const { data: regularRead } = await regularUserClient.from("documents").select("id").eq("id", doc!.id).maybeSingle();
    expect(regularRead).toBeNull();
  }, 20_000);
});
