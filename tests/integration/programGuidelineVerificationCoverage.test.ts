// Regression test for the 2026-07-29 bug: multiple lender-program ingestion
// scripts (GreenBox batch7/batch9, and the same pattern across 29 other
// lenders) inserted a `programs` row with full config data — LTV/FICO/
// loan-amount grids, doc types, source citations — but never inserted the
// corresponding `guideline_versions` row. Because listPrograms()/
// getCatalogForMatching() only surface a program once it has a
// human_verified guideline_version (see unverifiedLenderQuarantine.test.ts
// for that gate's own behavior), every one of those programs was silently
// invisible on its lender page and excluded from scenario matching for
// days — 70 real programs across 30 lenders, discovered only when a user
// noticed GreenBox showing "Programs (2)" instead of its real 11.
//
// unverifiedLenderQuarantine.test.ts proves the QUARANTINE GATE itself works
// correctly against synthetic fixtures (a program with zero guideline_versions
// SHOULD be hidden — that's correct, intentional behavior for genuinely
// unreviewed data). This test instead guards the other side of the same
// incident: that no ACTIVE, NON-SAMPLE program in the real platform catalog
// is sitting in that zero-guideline-version state by ingestion OMISSION.
// A zero-row program is only ever legitimate immediately after a human
// deliberately drafts one and before its first guideline_version is
// attached — for the shipped catalog, that transient state must not exist.
//
// Same skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
import { describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Program guideline-version verification coverage (live database)", () => {
  it("no active, non-sample platform-catalog program is missing every guideline_versions row", async () => {
    const admin: SupabaseClient = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: programs, error: programsError } = await admin
      .from("programs")
      .select("id, name, lender_id, lenders(name)")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .eq("active", true)
      .is("deleted_at", null);
    if (programsError) throw new Error(`Failed to list programs: ${programsError.message}`);

    const programIds = (programs ?? []).map((p) => p.id as string);
    expect(programIds.length).toBeGreaterThan(0);

    const { data: guidelineVersions, error: gvError } = await admin
      .from("guideline_versions")
      .select("program_id")
      .in("program_id", programIds);
    if (gvError) throw new Error(`Failed to list guideline_versions: ${gvError.message}`);

    const programIdsWithAnyGv = new Set((guidelineVersions ?? []).map((g) => g.program_id as string));
    const orphaned = (programs ?? []).filter((p) => !programIdsWithAnyGv.has(p.id as string));

    if (orphaned.length > 0) {
      const detail = orphaned
        .map((p) => `${(p.lenders as unknown as { name: string } | null)?.name ?? "unknown lender"} — ${p.name}`)
        .join("\n  - ");
      throw new Error(
        `${orphaned.length} active program(s) have NO guideline_versions row at all, so they are silently ` +
          `invisible to listPrograms()/getCatalogForMatching() (same bug fixed 2026-07-29 for GreenBox and ` +
          `29 other lenders — see scripts/fix_all_missing_guideline_verification.mjs):\n  - ${detail}`,
      );
    }
    expect(orphaned).toHaveLength(0);
  }, 20_000);

  it("every active, non-sample program that HAS a guideline_versions row has at least one human_verified or pending-review entry (not e.g. only 'archived'/'superseded')", async () => {
    const admin: SupabaseClient = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: programs, error: programsError } = await admin
      .from("programs")
      .select("id, name, lender_id, lenders(name)")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .eq("active", true)
      .is("deleted_at", null);
    if (programsError) throw new Error(`Failed to list programs: ${programsError.message}`);

    const programIds = (programs ?? []).map((p) => p.id as string);
    const { data: guidelineVersions, error: gvError } = await admin
      .from("guideline_versions")
      .select("program_id, verification_status")
      .in("program_id", programIds);
    if (gvError) throw new Error(`Failed to list guideline_versions: ${gvError.message}`);

    const liveStatuses = new Set(["human_verified", "ai_extracted_pending_review", "imported_pending_review", "draft"]);
    const byProgram = new Map<string, string[]>();
    for (const gv of guidelineVersions ?? []) {
      const list = byProgram.get(gv.program_id as string) ?? [];
      list.push(gv.verification_status as string);
      byProgram.set(gv.program_id as string, list);
    }

    const staleOnly = (programs ?? []).filter((p) => {
      const statuses = byProgram.get(p.id as string);
      return statuses && statuses.length > 0 && !statuses.some((s) => liveStatuses.has(s));
    });

    expect(staleOnly).toHaveLength(0);
  }, 20_000);
});
