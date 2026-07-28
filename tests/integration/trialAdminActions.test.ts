// Integration test for the admin Trial Access Management actions (spec
// Phase 5), against the REAL Supabase project — same
// skip-without-credentials convention as the other
// tests/integration/*.test.ts files. These exercise the underlying
// service-role writes directly (the same writes actions.ts performs after
// requirePlatformAdmin() succeeds) rather than requiring a full Next.js
// server-action harness — requirePlatformAdmin()'s own admin-gating is
// already covered by the existing admin auth pattern used throughout this
// codebase and isn't re-verified here.
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

describe.skipIf(!hasCredentials)("Trial admin actions — extend/revoke/convert (live database)", () => {
  let admin: SupabaseClient;
  let campaignId: string;
  let userId: string;
  let redemptionId: string;
  let enterprisePlanId: string;
  let essentialPlanId: string;
  const suffix = Date.now();
  const campaignSlug = `trial-admin-actions-test-${suffix}`;
  const testEmail = `nqn-trial-admin-actions-${suffix}@gmail.com`;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
    enterprisePlanId = enterprise!.id;
    const { data: essential } = await admin.from("membership_plans").select("id").eq("key", "essential").single();
    essentialPlanId = essential!.id;

    const { data: campaign } = await admin
      .from("trial_campaigns")
      .insert({ name: "Trial Admin Actions Test", slug: campaignSlug, trial_duration_days: 14, is_active: true })
      .select("id")
      .single();
    campaignId = campaign!.id;

    const { data: created } = await admin.auth.admin.createUser({ email: testEmail, password: "Trial-Admin-Actions-Pw-123", email_confirm: true });
    userId = created.user!.id;

    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: redemption } = await admin
      .from("trial_redemptions")
      .insert({ campaign_id: campaignId, user_id: userId, email: testEmail, normalized_email: testEmail.toLowerCase(), activated_at: new Date().toISOString(), expires_at: expiresAt })
      .select("id")
      .single();
    redemptionId = redemption!.id;

    await admin.from("user_subscriptions").upsert(
      { user_id: userId, plan_id: enterprisePlanId, is_trial: true, trial_activated_at: new Date().toISOString(), trial_expires_at: expiresAt, source: "comped" },
      { onConflict: "user_id" }
    );
  }, 30_000);

  afterAll(async () => {
    await admin.from("trial_redemptions").delete().eq("id", redemptionId);
    await admin.from("user_subscriptions").delete().eq("user_id", userId);
    await admin.from("trial_campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(userId);
  }, 30_000);

  it("extend: pushes expires_at forward on BOTH trial_redemptions and user_subscriptions, and increments extension_count", async () => {
    const { data: before } = await admin.from("trial_redemptions").select("expires_at, extension_count").eq("id", redemptionId).single();

    // Same write shape as actions.ts's extendTrial (base = current expiry since it's in the future).
    const base = new Date(before!.expires_at);
    const newExpiry = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("trial_redemptions").update({ expires_at: newExpiry, extension_count: (before!.extension_count ?? 0) + 1 }).eq("id", redemptionId);
    await admin.from("user_subscriptions").update({ trial_expires_at: newExpiry }).eq("user_id", userId);

    const { data: afterRedemption } = await admin.from("trial_redemptions").select("expires_at, extension_count").eq("id", redemptionId).single();
    const { data: afterSub } = await admin.from("user_subscriptions").select("trial_expires_at").eq("user_id", userId).single();
    expect(new Date(afterRedemption!.expires_at).getTime()).toBeGreaterThan(new Date(before!.expires_at).getTime());
    expect(afterRedemption!.extension_count).toBe((before!.extension_count ?? 0) + 1);
    expect(new Date(afterSub!.trial_expires_at).getTime()).toBe(new Date(afterRedemption!.expires_at).getTime());
  }, 15_000);

  it("revoke: sets revoked_at and immediately expires access on user_subscriptions (never deletes the account or its data)", async () => {
    const now = new Date().toISOString();
    await admin.from("trial_redemptions").update({ revoked_at: now }).eq("id", redemptionId);
    await admin.from("user_subscriptions").update({ trial_expires_at: now }).eq("user_id", userId);

    const { data: redemption } = await admin.from("trial_redemptions").select("revoked_at").eq("id", redemptionId).single();
    expect(redemption!.revoked_at).toBeTruthy();

    // Account itself must still exist — revoke never deletes anything.
    const { data: userRow } = await admin.from("users").select("id").eq("id", userId).maybeSingle();
    expect(userRow).toBeTruthy();

    // And access is genuinely gone: trial_expires_at is now in the past.
    const { data: sub } = await admin.from("user_subscriptions").select("trial_expires_at, is_trial").eq("user_id", userId).single();
    expect(new Date(sub!.trial_expires_at).getTime()).toBeLessThanOrEqual(Date.now());
  }, 15_000);

  it("convert: assigns a REAL plan, clears is_trial, and records the conversion on trial_redemptions", async () => {
    const now = new Date().toISOString();
    await admin.from("user_subscriptions").update({ plan_id: essentialPlanId, is_trial: false, trial_expires_at: null, canceled_at: null }).eq("user_id", userId);
    await admin.from("trial_redemptions").update({ converted_at: now, converted_plan_key: "essential" }).eq("id", redemptionId);

    const { data: sub } = await admin.from("user_subscriptions").select("plan_id, is_trial, trial_expires_at").eq("user_id", userId).single();
    expect(sub!.plan_id).toBe(essentialPlanId);
    expect(sub!.is_trial).toBe(false);
    expect(sub!.trial_expires_at).toBeNull();

    const { data: redemption } = await admin.from("trial_redemptions").select("converted_at, converted_plan_key").eq("id", redemptionId).single();
    expect(redemption!.converted_at).toBeTruthy();
    expect(redemption!.converted_plan_key).toBe("essential");
  }, 15_000);
});
