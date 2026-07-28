// Integration test pinning the real guideline corrections/enrichments
// applied to Cake Mortgage, Plaza Home Mortgage, BluePoint Mortgage, and
// American Heritage Lending from real uploaded guideline documents
// (2026-07-28) — against the REAL Supabase project, same
// skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// This does not re-verify the whole document extraction (that's a one-
// time data-entry act, not app logic) — it pins the specific, load-
// bearing FACTS that must never silently regress: a real numeric
// correction (BluePoint Asset Utilization's LTV ceiling was wrong), a
// newly-added citizenship eligibility class (AHL DSCR + foreign_national),
// and that no verification status was fabricated where the real source
// document didn't actually confirm a number.
import { describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Deep guideline intelligence — 4-lender corrections (live database)", () => {
  let admin: SupabaseClient;

  it("BluePoint Asset Utilization's baseMaxLtv was corrected from the previously-recorded 90% down to the real 80% ceiling, and is now human_verified", async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: program } = await admin.from("programs").select("id, config").eq("id", "ee568b82-9e61-4eda-9a4f-efc2dfedf1a2").single();
    expect(program!.config.baseMaxLtv).toBe(80);
    expect(program!.config.minFico).toBe(680);
    expect(Array.isArray(program!.config.ltvMatrix)).toBe(true);

    const { data: gv } = await admin.from("guideline_versions").select("verification_status").eq("program_id", "ee568b82-9e61-4eda-9a4f-efc2dfedf1a2").single();
    expect(gv!.verification_status).toBe("human_verified");
  }, 15_000);

  it("BluePoint Bank Statement Loan's minFico was corrected to the real 660 floor and carries a real ltvMatrix", async () => {
    const { data: program } = await admin.from("programs").select("config").eq("id", "b7592ce9-5f3e-49fa-80bb-30fb7a1dffba").single();
    expect(program!.config.minFico).toBe(660);
    expect(program!.config.baseMaxLtv).toBe(90);
    expect(program!.config.ltvMatrix.length).toBeGreaterThan(0);
  }, 15_000);

  it("American Heritage Lending's DSCR program now includes foreign_national eligibility, added from the real uploaded guide", async () => {
    const { data: program } = await admin.from("programs").select("config").eq("id", "2d4f3364-e2c5-4b3b-9be9-47ce1fa1f93c").single();
    expect(program!.config.citizenshipEligible).toContain("foreign_national");
    expect(program!.config.citizenshipEligible).toContain("us_citizen"); // pre-existing eligibility preserved, not overwritten
  }, 15_000);

  it("Cake Mortgage's still-unconfirmed programs were NOT marked verified just because qualitative notes were added — no fabricated verification", async () => {
    const stillUnconfirmedIds = ["5d89a0e1-159b-4bcf-b179-ffc1a8359799", "882393ff-f42f-4f91-8473-1da6bce6527d"];
    const { data: gvs } = await admin.from("guideline_versions").select("program_id").in("program_id", stillUnconfirmedIds);
    expect(gvs ?? []).toHaveLength(0); // no guideline_versions row at all — still correctly unverified/quarantined
  }, 15_000);

  it("American Heritage Lending's Asset Qualifier and Bank Statement programs also remain unverified — numeric matrix genuinely wasn't provided", async () => {
    const stillUnconfirmedIds = ["75a28282-5deb-4952-8ea0-0020191d0730", "2168eed2-8606-4605-94c7-acbe2f4e6b1b"];
    const { data: gvs } = await admin.from("guideline_versions").select("program_id").in("program_id", stillUnconfirmedIds);
    expect(gvs ?? []).toHaveLength(0);
  }, 15_000);
});
