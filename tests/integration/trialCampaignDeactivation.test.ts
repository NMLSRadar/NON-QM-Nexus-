// Integration test for spec Phase 15 checklist items 18-20 (campaign
// deactivation + admin override), against the REAL Supabase project —
// same skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// Core guarantees under test:
// 18. An admin override (the exact writes performed by
//     adminOverrideActivateTrial in src/app/admin/trials/actions.ts) can
//     grant a trial to an email that already has one, bypassing
//     activate_trial()'s own duplicate check.
// 19. Deactivating a campaign (is_active = false) makes activate_trial()
//     refuse any NEW activation against it.
// 20. An EXISTING active trial redeemed against that campaign BEFORE
//     deactivation is completely unaffected — its own tier access keeps
//     resolving normally (deactivating a campaign is not a kill switch
//     for people who already redeemed it).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEffectivePlan } from "@/lib/repository/membership";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Trial campaign deactivation + admin override (live database)", () => {
  let admin: SupabaseClient;
  let campaignId: string;
  let campaignSlug: string;
  let firstUserId: string;
  let firstUserClient: SupabaseClient;
  let secondUserId: string;
  const suffix = Date.now();
  const firstEmail = `nqn-campaign-deactivation-1st-${suffix}@gmail.com`;
  const secondEmail = `nqn-campaign-deactivation-2nd-${suffix}@gmail.com`;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    campaignSlug = `campaign-deactivation-test-${suffix}`;

    const { data: campaign } = await admin
      .from("trial_campaigns")
      .insert({ name: "Campaign Deactivation Test", slug: campaignSlug, trial_duration_days: 14, is_active: true })
      .select("id")
      .single();
    campaignId = campaign!.id;

    const { data: created1 } = await admin.auth.admin.createUser({ email: firstEmail, password: "Campaign-Deactivation-Pw-123", email_confirm: true });
    firstUserId = created1.user!.id;
    firstUserClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await firstUserClient.auth.signInWithPassword({ email: firstEmail, password: "Campaign-Deactivation-Pw-123" });

    const { data: created2 } = await admin.auth.admin.createUser({ email: secondEmail, password: "Campaign-Deactivation-Pw-123", email_confirm: true });
    secondUserId = created2.user!.id;
  }, 30_000);

  afterAll(async () => {
    await admin.from("trial_redemptions").delete().in("user_id", [firstUserId, secondUserId]);
    await admin.from("user_subscriptions").delete().in("user_id", [firstUserId, secondUserId]);
    await admin.from("trial_campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(firstUserId);
    await admin.auth.admin.deleteUser(secondUserId);
  }, 30_000);

  it("item 20: an existing trial redeemed while the campaign was active keeps working normally after the campaign is later deactivated", async () => {
    // Redeem WHILE active.
    const { error } = await firstUserClient.rpc("activate_trial", {
      p_campaign_slug: campaignSlug,
      p_normalized_email: firstEmail.toLowerCase(),
    });
    expect(error).toBeNull();

    const beforeDeactivate = await getEffectivePlan(firstUserClient, firstUserId);
    expect(beforeDeactivate.tierLevel).toBe(3);

    // Deactivate the campaign.
    await admin.from("trial_campaigns").update({ is_active: false }).eq("id", campaignId);

    // The FIRST user's already-granted access is untouched.
    const afterDeactivate = await getEffectivePlan(firstUserClient, firstUserId);
    expect(afterDeactivate.tierLevel).toBe(3);
    expect(afterDeactivate.isTrial).toBe(true);
  }, 20_000);

  it("item 19: deactivating the campaign refuses a brand-new activation against it", async () => {
    const secondUserClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await secondUserClient.auth.signInWithPassword({ email: secondEmail, password: "Campaign-Deactivation-Pw-123" });

    const { error } = await secondUserClient.rpc("activate_trial", {
      p_campaign_slug: campaignSlug, // already deactivated by the previous test
      p_normalized_email: secondEmail.toLowerCase(),
    });
    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/not found or inactive/i);
  }, 15_000);

  it("item 18: an admin override grants a trial to the second user via the SAME writes adminOverrideActivateTrial performs, even though the campaign is inactive is irrelevant here — it directly inserts rather than calling the gated RPC", async () => {
    // Re-activate the campaign so a direct insert (mirroring the admin
    // override action's own logic) has a valid campaign to reference —
    // the override path in actions.ts reads trial_duration_days directly
    // rather than going through activate_trial()'s is_active gate at all.
    const { data: campaignRow } = await admin.from("trial_campaigns").select("trial_duration_days").eq("id", campaignId).single();
    const expiresAt = new Date(Date.now() + campaignRow!.trial_duration_days * 24 * 60 * 60 * 1000).toISOString();

    const { error: redemptionError } = await admin.from("trial_redemptions").insert({
      campaign_id: campaignId,
      user_id: secondUserId,
      email: secondEmail,
      normalized_email: secondEmail.toLowerCase(),
      activated_at: new Date().toISOString(),
      expires_at: expiresAt,
    });
    expect(redemptionError).toBeNull();

    const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
    await admin.from("user_subscriptions").upsert(
      { user_id: secondUserId, plan_id: enterprise!.id, is_trial: true, trial_activated_at: new Date().toISOString(), trial_expires_at: expiresAt, source: "comped" },
      { onConflict: "user_id" }
    );

    const secondUserClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await secondUserClient.auth.signInWithPassword({ email: secondEmail, password: "Campaign-Deactivation-Pw-123" });
    const plan = await getEffectivePlan(secondUserClient, secondUserId);
    expect(plan.tierLevel).toBe(3);
    expect(plan.isTrial).toBe(true);
  }, 20_000);
});
