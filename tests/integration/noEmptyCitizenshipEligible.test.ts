// Permanent regression test against a REAL production bug found
// 2026-07-29: a bulk "fix" script (scripts/itin_lender_restriction_2026_07_29.mjs)
// removed "itin" from Program.citizenshipEligible for every lender NOT on
// its own hardcoded 7-name allowlist — which stripped 5 real, already
// sourced-and-verified ITIN programs down to an EMPTY citizenshipEligible
// array, including a straight lender-name mix-up ("LoanStream Mortgage",
// a real distinct lender, vs the allowlisted "LendSure Mortgage Corp.").
// An empty citizenshipEligible array is NEVER a legitimate state for an
// active, non-sample program — every real program is eligible for AT
// LEAST one citizenship class — so this is a durable whole-catalog sweep,
// not a fixture test, since the exact failure mode (a blanket allowlist-
// driven bulk edit) is catalog-wide and could recur from any future script.
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

describe.skipIf(!hasCredentials)("No empty citizenshipEligible arrays — whole-catalog sweep (live database)", () => {
  it("no active, non-sample program has a citizenshipEligible array of length 0", async () => {
    const admin: SupabaseClient = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: programs, error: programsError } = await admin
      .from("programs")
      .select("id, name, lender_id, config")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("active", true)
      .eq("is_sample_data", false);
    if (programsError) throw new Error(programsError.message);

    const { data: lenders } = await admin.from("lenders").select("id, name").eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID);
    const lenderName = Object.fromEntries((lenders ?? []).map((l) => [l.id, l.name as string]));

    const violations = (programs ?? []).filter((p) => {
      const config = p.config as { citizenshipEligible?: string[] };
      return (config.citizenshipEligible ?? []).length === 0;
    });

    if (violations.length > 0) {
      const detail = violations.map((p) => `${lenderName[p.lender_id as string] ?? "unknown lender"} — ${p.name} (${p.id})`).join("\n  ");
      throw new Error(
        `Found ${violations.length} active program(s) with an EMPTY citizenshipEligible array — this is never a legitimate state (every real program is eligible for at least one citizenship class); it means a bulk edit incorrectly stripped citizenship data:\n  ${detail}`,
      );
    }
    expect(violations).toHaveLength(0);
  }, 30_000);

  it("LoanStream Mortgage's real ITIN program is distinct from LendSure Mortgage Corp. and retains itin citizenship eligibility", async () => {
    const admin: SupabaseClient = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: lender } = await admin.from("lenders").select("id, name").eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).ilike("name", "%LoanStream%").single();
    expect(lender?.name).not.toContain("LendSure");
    const { data: program } = await admin.from("programs").select("config").eq("lender_id", lender!.id).eq("name", "ITIN").maybeSingle();
    expect(program).toBeTruthy();
    expect((program!.config as { citizenshipEligible: string[] }).citizenshipEligible).toContain("itin");
  }, 15_000);
});
