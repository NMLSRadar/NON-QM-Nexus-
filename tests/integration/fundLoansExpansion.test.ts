// FundLoans program expansion (2026-07-29): WVOE, Non-QM full
// documentation, super-jumbo, standalone second-mortgage, and asset-only/
// asset-allowance/asset-depletion variants. See
// scripts/fundloans_expansion_2026_07_29.mjs for full sourcing.
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

describe.skipIf(!hasCredentials)("FundLoans program expansion (live database)", () => {
  const getAdmin = (): SupabaseClient =>
    createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  async function fetchProgram(name: string) {
    const admin = getAdmin();
    const { data: lender } = await admin.from("lenders").select("id").eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID).ilike("name", "%FundLoans%").single();
    const { data: program } = await admin.from("programs").select("id, config").eq("lender_id", lender!.id).eq("name", name).maybeSingle();
    return program;
  }

  async function verificationStatus(programId: string) {
    const admin = getAdmin();
    const { data } = await admin.from("guideline_versions").select("verification_status").eq("program_id", programId);
    return (data ?? []).map((g) => g.verification_status as string);
  }

  it("WVOE program is real, verified, and carries its own confirmed LTV/FICO distinct from other doc types", async () => {
    const program = await fetchProgram("WVOE — Written Verification of Employment");
    expect(program).toBeTruthy();
    expect(program!.config.incomeDocTypes).toEqual(["wvoe_only"]);
    expect(program!.config.minFico).toBe(680);
    expect(program!.config.baseMaxLtv).toBe(80);
    expect(program!.config.occupancies).toEqual(["primary"]);
    const statuses = await verificationStatus(program!.id);
    expect(statuses).toContain("human_verified");
  }, 15_000);

  it("Montage Prime is corrected to its real $300K-$6M Full Doc + Asset Qualification scope (not the previous $2M ceiling)", async () => {
    const program = await fetchProgram("Montage Prime — Full Doc + Asset Qualification");
    expect(program).toBeTruthy();
    expect(program!.config.maxLoanAmount).toBe(6_000_000);
    expect(program!.config.incomeDocTypes).toEqual(expect.arrayContaining(["full_doc", "asset_depletion"]));
  }, 15_000);

  it("the 60-Month Asset Allowance is a real, distinct program from Full Doc + Asset Qualification (asset-supplement, not sole-source)", async () => {
    const program = await fetchProgram("Montage Prime — 60-Month Asset Allowance");
    expect(program).toBeTruthy();
    expect(program!.config.incomeDocTypes).toEqual(["asset_depletion"]);
    const statuses = await verificationStatus(program!.id);
    expect(statuses).toContain("human_verified");
  }, 15_000);

  it("Arete (super-jumbo-adjacent portfolio Full Doc/Alt Doc/DSCR) and Jumbo Full Doc are real categories but remain UNVERIFIED — no fabricated LTV/FICO", async () => {
    for (const name of ["Arete — Full Doc / Alt Doc / DSCR", "Jumbo Full Doc (Super-Jumbo Non-QM)"]) {
      const program = await fetchProgram(name);
      expect(program).toBeTruthy();
      expect(program!.config.minFico).toBe(0);
      expect(program!.config.baseMaxLtv).toBe(0);
      const statuses = await verificationStatus(program!.id);
      expect(statuses).not.toContain("human_verified");
    }
  }, 15_000);

  it("standalone second-mortgage doc-type coverage: Aspire and Aspire X together span bank statement, P&L, full doc, asset depletion, and DSCR for second liens", async () => {
    const aspire = await fetchProgram("Aspire — Standalone Second Mortgage");
    const aspireX = await fetchProgram("Aspire X — Standalone Second Mortgage");
    expect(aspire).toBeTruthy();
    expect(aspireX).toBeTruthy();
    const combined = new Set([...(aspire!.config.incomeDocTypes as string[]), ...(aspireX!.config.incomeDocTypes as string[])]);
    for (const docType of ["bank_statement", "pnl_only", "full_doc", "asset_depletion", "dscr", "wvoe_only"]) {
      expect(combined.has(docType)).toBe(true);
    }
  }, 15_000);
});
