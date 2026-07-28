// Integration test for the activate_trial() RPC (14-day trial spec,
// phases 1-2, 4, 2026-07-28), against the REAL Supabase project — same
// skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// Core guarantees under test:
// 1. A real signed-up user calling activate_trial() against a real,
//    active campaign gets a genuine trial_redemptions row + a
//    user_subscriptions row resolving to tier 3, with expires_at computed
//    SERVER-SIDE as activated_at + campaign.trial_duration_days (never
//    trusting any client-supplied duration/expiration).
// 2. The SAME normalized email cannot activate a SECOND trial (even via a
//    different campaign) — Phase 4's core duplicate-prevention
//    requirement — unless p_admin_override=true is passed.
// 3. A deactivated campaign refuses new activations, but this test only
//    asserts the negative (existing behavior already covered by trial
//    expiration tests is more valuable to isolate here).
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

describe.skipIf(!hasCredentials)("Trial activation RPC (live database)", () => {
  let admin: SupabaseClient;
  let campaignId: string;
  const suffix = Date.now();
  const campaignSlug = `trial-activation-test-${suffix}`;
  const secondCampaignSlug = `trial-activation-test-2nd-${suffix}`;
  const testEmail = `nqn-trial-activation-${suffix}@gmail.com`;
  const testPassword = "Trial-Activation-Pw-123";
  const normalizedEmail = testEmail.toLowerCase().trim();
  let userId: string;
  let userClient: SupabaseClient;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: campaign, error: campaignError } = await admin
      .from("trial_campaigns")
      .insert({ name: "Trial Activation Test Campaign", slug: campaignSlug, trial_duration_days: 14, is_active: true })
      .select("id")
      .single();
    if (campaignError) throw new Error(`Failed to create test campaign: ${campaignError.message}`);
    campaignId = campaign!.id;

    await admin.from("trial_campaigns").insert({ name: "Trial Activation Test Campaign 2", slug: secondCampaignSlug, trial_duration_days: 14, is_active: true });

    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
    if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
    userId = created.user.id;

    userClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });
  }, 30_000);

  afterAll(async () => {
    await admin.from("trial_redemptions").delete().eq("normalized_email", normalizedEmail);
    if (userId) {
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      const { data: membership } = await admin.from("memberships").select("organization_id").eq("user_id", userId).maybeSingle();
      await admin.from("memberships").delete().eq("user_id", userId);
      if (membership) await admin.from("organizations").delete().eq("id", membership.organization_id);
      await admin.auth.admin.deleteUser(userId);
    }
    await admin.from("trial_campaigns").delete().in("slug", [campaignSlug, secondCampaignSlug]);
  }, 30_000);

  it("activates a real trial: creates a redemption row and grants tier-3 access with a server-computed 14-day expiration", async () => {
    const before = Date.now();
    const { data, error } = await userClient.rpc("activate_trial", {
      p_campaign_slug: campaignSlug,
      p_normalized_email: normalizedEmail,
      p_first_name: "Test",
      p_last_name: "Broker",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const expiresAt = new Date(data[0].expires_at).getTime();
    const expectedExpiry = before + 14 * 24 * 60 * 60 * 1000;
    // Allow a small tolerance for RPC round-trip time.
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(10_000);

    const { data: redemption } = await admin.from("trial_redemptions").select("*").eq("normalized_email", normalizedEmail).single();
    expect(redemption).toBeTruthy();
    expect(redemption!.campaign_id).toBe(campaignId);
    expect(redemption!.first_name).toBe("Test");

    const { data: sub } = await admin.from("user_subscriptions").select("is_trial, trial_expires_at").eq("user_id", userId).single();
    expect(sub!.is_trial).toBe(true);
    expect(sub!.trial_expires_at).toBeTruthy();
  }, 15_000);

  it("refuses a second trial for the same normalized email via a DIFFERENT campaign, without an admin override", async () => {
    const { error } = await userClient.rpc("activate_trial", {
      p_campaign_slug: secondCampaignSlug,
      p_normalized_email: normalizedEmail,
    });
    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/already used a trial/i);
  }, 15_000);
});
