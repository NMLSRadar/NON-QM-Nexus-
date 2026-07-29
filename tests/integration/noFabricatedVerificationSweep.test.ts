// Permanent regression test against a REAL production data-integrity bug
// found and fixed 2026-07-28/29: a concurrent bulk-verification script
// (scripts/fix_all_missing_guideline_verification.mjs,
// scripts/fix_greenbox_missing_guideline_verification.mjs) correctly
// identified a real bug — many earlier-ingested programs had real,
// sourced config data but were missing their guideline_versions row
// entirely, making them invisible to customers despite being genuinely
// real. But its check (does config have guidelineVersionLabel +
// effectiveDate?) didn't also confirm the core numeric fields (minFico,
// baseMaxLtv) were non-zero — so it swept up 13 programs that were
// DELIBERATELY left with placeholder 0/0 values (a real "pending
// guideline review" signal used throughout this session, e.g. Cake
// Mortgage/American Heritage Lending's still-unconfirmed programs) and
// incorrectly marked them human_verified.
//
// This is a live, whole-catalog sweep — not a fixture test — because the
// exact failure mode is catalog-wide (any future ingestion or bulk-fix
// script could reintroduce it), and the fixture-based tests in
// deepGuidelineIntelligence4Lenders.test.ts only cover the 4 specific
// programs from that earlier pass, not the whole platform.
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

describe.skipIf(!hasCredentials)("No fabricated verification — whole-catalog sweep (live database)", () => {
  it("no active, non-sample program with human_verified status has a genuinely unconfirmed (minFico=0 AND baseMaxLtv=0) config", async () => {
    const admin: SupabaseClient = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: programs, error: programsError } = await admin
      .from("programs")
      .select("id, name, lender_id, config")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("active", true)
      .eq("is_sample_data", false);
    if (programsError) throw new Error(programsError.message);

    const { data: verifiedGvs, error: gvError } = await admin
      .from("guideline_versions")
      .select("program_id")
      .eq("verification_status", "human_verified");
    if (gvError) throw new Error(gvError.message);
    const verifiedProgramIds = new Set((verifiedGvs ?? []).map((g) => g.program_id));

    const { data: lenders } = await admin.from("lenders").select("id, name").eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID);
    const lenderName = Object.fromEntries((lenders ?? []).map((l) => [l.id, l.name as string]));

    const violations = (programs ?? []).filter((p) => {
      const config = p.config as { minFico?: number; baseMaxLtv?: number };
      return verifiedProgramIds.has(p.id) && (config.minFico ?? 0) === 0 && (config.baseMaxLtv ?? 0) === 0;
    });

    if (violations.length > 0) {
      const detail = violations.map((p) => `${lenderName[p.lender_id as string] ?? "unknown lender"} — ${p.name} (${p.id})`).join("\n  ");
      throw new Error(`Found ${violations.length} program(s) marked human_verified with genuinely unconfirmed (0/0) minFico/baseMaxLtv — never fabricate verification:\n  ${detail}`);
    }
    expect(violations).toHaveLength(0);
  }, 30_000);
});
