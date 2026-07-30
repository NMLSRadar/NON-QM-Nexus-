// Stats integrity (live database): getAeMonthlyStats matches manually-
// inserted event fixtures exactly.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("AE monthly stats integrity (live database)", () => {
  let admin: SupabaseClient;
  let lenderId: string;
  let profileId: string;
  const suffix = Date.now();
  // A fixed month in the past so "now" (whenever this test runs) can
  // never accidentally land inside it and pick up unrelated real events.
  const fixedMonth = "2020-03";
  const fixedMonthStart = "2020-03-05T12:00:00.000Z";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: lender } = await admin.from("lenders").insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: `AE-Stats-Test Lender ${suffix}`, tier_level: 1 }).select("id").single();
    lenderId = lender!.id;
    const { data: profile } = await admin.from("ae_profiles").insert({ lender_id: lenderId, name: "Test Stats AE", email: `stats-${suffix}@example.com`, status: "claimed" }).select("id").single();
    profileId = profile!.id;

    // Manually-inserted event fixtures — exact counts the test will assert against.
    const events = [
      ...Array(7).fill("view"),
      ...Array(3).fill("click_phone"),
      ...Array(2).fill("click_email"),
    ];
    await admin.from("ae_profile_events").insert(events.map((event) => ({ ae_profile_id: profileId, event, created_at: fixedMonthStart })));

    // One event OUTSIDE the target month — must NOT be counted.
    await admin.from("ae_profile_events").insert({ ae_profile_id: profileId, event: "view", created_at: "2020-04-15T00:00:00.000Z" });
  });

  afterAll(async () => {
    await admin.from("ae_profile_events").delete().eq("ae_profile_id", profileId);
    await admin.from("ae_profiles").delete().eq("id", profileId);
    await admin.from("lenders").delete().eq("id", lenderId);
  });

  it("getAeMonthlyStats matches the manually-inserted fixtures exactly for the target month", async () => {
    const { getAeMonthlyStats } = await import("@/lib/ae/stats");
    const stats = await getAeMonthlyStats(profileId, fixedMonth);
    expect(stats.views).toBe(7);
    expect(stats.phoneClicks).toBe(3);
    expect(stats.emailClicks).toBe(2);
  }, 20_000);

  it("does not count an event outside the requested month", async () => {
    const { getAeMonthlyStats } = await import("@/lib/ae/stats");
    const aprilStats = await getAeMonthlyStats(profileId, "2020-04");
    // Only the one April view should count, not any of March's events.
    expect(aprilStats.views).toBe(1);
    expect(aprilStats.phoneClicks).toBe(0);
    expect(aprilStats.emailClicks).toBe(0);
  }, 20_000);

  it("isAllZero correctly identifies a genuinely zero-activity month", async () => {
    const { getAeMonthlyStats, isAllZero } = await import("@/lib/ae/stats");
    const emptyMonthStats = await getAeMonthlyStats(profileId, "2019-01");
    expect(isAllZero(emptyMonthStats)).toBe(true);
    const activeMonthStats = await getAeMonthlyStats(profileId, fixedMonth);
    expect(isAllZero(activeMonthStats)).toBe(false);
  }, 20_000);
});
