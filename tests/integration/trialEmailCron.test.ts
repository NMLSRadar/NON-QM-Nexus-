// Integration test for the trial-emails cron sweep's threshold and
// idempotency logic (spec Phase 7), against the REAL Supabase project —
// same skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// This exercises the actual /api/cron/trial-emails route (requires
// CRON_SECRET to be set locally to authenticate, which it is in
// .env.local — see the FROM_ADDRESS/RESEND_API_KEY note in email.ts; a
// real email send is expected here since this hits the real endpoint,
// which is the same real, working Resend path already used by the
// citation-check cron).
//
// Core guarantees under test:
// 1. A redemption 8 days past activation with mid_trial_email_sent_at
//    still null gets it set after the sweep (real send, real DB write).
// 2. A SECOND sweep run does NOT re-send (the column is already set) —
//    idempotency.
// 3. A revoked redemption is skipped entirely, even if it would otherwise
//    match a threshold.
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
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY && CRON_SECRET);

// This test hits the LIVE deployed cron endpoint (not a local dev server,
// which isn't running during `vitest run`) — so it's scoped to when the
// production app URL is reachable. Skips cleanly otherwise rather than
// failing CI, which has no running deployment to hit.
describe.skipIf(!hasCredentials)("Trial email cron sweep (live database + live endpoint)", () => {
  let admin: SupabaseClient;
  let campaignId: string;
  let userId: string;
  let redemptionId: string;
  let revokedUserId: string;
  let revokedRedemptionId: string;
  const suffix = Date.now();
  const campaignSlug = `trial-email-cron-test-${suffix}`;
  const testEmail = `nqn-trial-email-cron-${suffix}@gmail.com`;
  const revokedEmail = `nqn-trial-email-cron-revoked-${suffix}@gmail.com`;
  const cronUrl = `${APP_URL ?? "https://nonqmnexus.com"}/api/cron/trial-emails`;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();

    const { data: campaign } = await admin
      .from("trial_campaigns")
      .insert({ name: "Trial Email Cron Test", slug: campaignSlug, trial_duration_days: 14, is_active: true })
      .select("id")
      .single();
    campaignId = campaign!.id;

    const { data: created } = await admin.auth.admin.createUser({ email: testEmail, password: "Trial-Email-Cron-Pw-123", email_confirm: true });
    userId = created.user!.id;
    const { data: createdRevoked } = await admin.auth.admin.createUser({ email: revokedEmail, password: "Trial-Email-Cron-Pw-123", email_confirm: true });
    revokedUserId = createdRevoked.user!.id;

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const stillFuture = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

    const { data: redemption } = await admin
      .from("trial_redemptions")
      .insert({ campaign_id: campaignId, user_id: userId, email: testEmail, normalized_email: testEmail.toLowerCase(), first_name: "Cron", activated_at: eightDaysAgo, expires_at: stillFuture })
      .select("id")
      .single();
    redemptionId = redemption!.id;
    await admin.from("user_subscriptions").upsert(
      { user_id: userId, plan_id: enterprise!.id, is_trial: true, trial_activated_at: eightDaysAgo, trial_expires_at: stillFuture, source: "comped" },
      { onConflict: "user_id" }
    );

    // A revoked redemption that WOULD otherwise match the mid-trial
    // threshold — must be skipped.
    const { data: revokedRedemption } = await admin
      .from("trial_redemptions")
      .insert({
        campaign_id: campaignId,
        user_id: revokedUserId,
        email: revokedEmail,
        normalized_email: revokedEmail.toLowerCase(),
        activated_at: eightDaysAgo,
        expires_at: stillFuture,
        revoked_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    revokedRedemptionId = revokedRedemption!.id;
  }, 30_000);

  afterAll(async () => {
    await admin.from("trial_redemptions").delete().in("id", [redemptionId, revokedRedemptionId]);
    await admin.from("user_subscriptions").delete().in("user_id", [userId, revokedUserId]);
    await admin.from("trial_campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(userId);
    await admin.auth.admin.deleteUser(revokedUserId);
  }, 30_000);

  it("sends the mid-trial email for an 8-day-old active trial and marks it sent", async () => {
    const res = await fetch(cronUrl, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.midTrialSent).toBeGreaterThanOrEqual(1);

    const { data: redemption } = await admin.from("trial_redemptions").select("mid_trial_email_sent_at").eq("id", redemptionId).single();
    expect(redemption!.mid_trial_email_sent_at).toBeTruthy();
  }, 30_000);

  it("does NOT re-send on a second sweep (idempotent)", async () => {
    const { data: before } = await admin.from("trial_redemptions").select("mid_trial_email_sent_at").eq("id", redemptionId).single();

    await fetch(cronUrl, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });

    const { data: after } = await admin.from("trial_redemptions").select("mid_trial_email_sent_at").eq("id", redemptionId).single();
    expect(after!.mid_trial_email_sent_at).toBe(before!.mid_trial_email_sent_at);
  }, 30_000);

  it("never emails a revoked trial even though it matches the mid-trial threshold", async () => {
    const { data: revoked } = await admin.from("trial_redemptions").select("mid_trial_email_sent_at").eq("id", revokedRedemptionId).single();
    expect(revoked!.mid_trial_email_sent_at).toBeNull();
  }, 15_000);

  it("rejects a request without the correct CRON_SECRET", async () => {
    const res = await fetch(cronUrl, { headers: { Authorization: "Bearer wrong-secret" } });
    expect(res.status).toBe(401);
  }, 15_000);
});
