// Confirms the real-catalog side of the 2026-07-29 lien-position fix and
// the newly-added Acra Lending ITIN program (see
// scripts/lien_position_tagging_2026_07_29.mjs and
// scripts/acra_itin_program_2026_07_29.mjs).
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

describe.skipIf(!hasCredentials)("Lien position tagging + Acra ITIN program (live database)", () => {
  const getAdmin = (): SupabaseClient =>
    createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  it("the 4 real standalone-second-mortgage programs are tagged lienPosition=standalone_second", async () => {
    const admin = getAdmin();
    const ids = [
      "6a0a6221-293c-4ac9-965d-41511eaebb2a", // GreenBox CES
      "0316f799-e6cc-48fe-a32f-274617423468", // FundLoans Aspire
      "2765d7a1-0665-4d51-8bc0-539a75d3307a", // FundLoans Aspire X
      "d5f8734a-7cea-4c64-856d-45531e1b50a0", // Verus Closed End Second
    ];
    const { data: programs } = await admin.from("programs").select("id, name, config").in("id", ids);
    expect(programs).toHaveLength(4);
    for (const p of programs ?? []) {
      expect((p.config as { lienPosition?: string }).lienPosition, `${p.name} should be tagged standalone_second`).toBe("standalone_second");
    }
  }, 15_000);

  it("an ordinary first-lien program in the catalog is NOT tagged standalone_second (spot check)", async () => {
    const admin = getAdmin();
    const { data: lender } = await admin.from("lenders").select("id").eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).ilike("name", "%FundLoans%").single();
    const { data: program } = await admin.from("programs").select("config").eq("lender_id", lender!.id).eq("name", "Spectrum DSCR / No Ratio").single();
    expect((program!.config as { lienPosition?: string }).lienPosition).toBeUndefined();
  }, 15_000);

  it("Acra Lending's real ITIN program exists, is human_verified, and covers the real multi-doc-type bundle", async () => {
    const admin = getAdmin();
    const { data: lender } = await admin.from("lenders").select("id").eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).ilike("name", "%Acra%").single();
    const { data: program } = await admin.from("programs").select("id, config").eq("lender_id", lender!.id).eq("name", "ITIN").maybeSingle();
    expect(program).toBeTruthy();
    const config = program!.config as { incomeDocTypes: string[]; citizenshipEligible: string[]; minFico: number; baseMaxLtv: number };
    expect(config.citizenshipEligible).toEqual(["itin"]);
    expect(config.incomeDocTypes).toEqual(expect.arrayContaining(["full_doc", "bank_statement", "1099", "pnl_only", "asset_depletion"]));
    expect(config.minFico).toBe(640);
    expect(config.baseMaxLtv).toBe(75);

    const { data: gv } = await admin.from("guideline_versions").select("verification_status").eq("program_id", program!.id);
    expect((gv ?? []).map((g) => g.verification_status)).toContain("human_verified");
  }, 15_000);
});
