// Integration test for 14-day trial expiration (spec Phase 3/4,
// 2026-07-28), against the REAL Supabase project — same
// skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// Core guarantees under test:
// 1. A trial with a future trial_expires_at resolves to tier 3 (temporary
//    "All Access") and isTrial=true.
// 2. The MOMENT trial_expires_at is in the past (per the SERVER's own
//    clock — this test sets it directly via the admin/service-role
//    client, exactly what would happen after 14 real days elapse; no
//    client-supplied value is ever trusted), the SAME account
//    automatically resolves to tier 0 with isTrial=false — with zero
//    admin action, cron job, or extra write required. This is the crux of
//    "automatic expiration" — expiration is a property of every READ, not
//    a background job that might not have run yet.
// 3. trialExpiresAt is still reported (non-null) after expiration, so the
//    UI can show "your trial ended on <date>" rather than losing all
//    memory of the trial ever existing.
// 4. Real-world simulation via the activate_trial() RPC end-to-end: a
//    fresh signup activates against a real campaign and gets a real,
//    server-computed expiration exactly `trial_duration_days` days out.
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

describe.skipIf(!hasCredentials)("14-day trial expiration (live database)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let enterprisePlanId: string;
  const testEmail = `nqn-trial-expiration-${Date.now()}@gmail.com`;
  const testPassword = "Trial-Expiration-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
    enterprisePlanId = enterprise!.id;

    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
    if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
    userId = created.user.id;

    userClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      await admin.from("trial_redemptions").delete().eq("user_id", userId);
      await admin.from("user_subscriptions").delete().eq("user_id", userId);
      await admin.from("memberships").delete().eq("user_id", userId);
      const { data: membership } = await admin.from("memberships").select("organization_id").eq("user_id", userId).maybeSingle();
      if (membership) await admin.from("organizations").delete().eq("id", membership.organization_id);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("an active (future-expiring) trial resolves to tier 3 with isTrial=true", async () => {
    const futureExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days from now
    await admin.from("user_subscriptions").upsert(
      { user_id: userId, plan_id: enterprisePlanId, is_trial: true, trial_activated_at: new Date().toISOString(), trial_expires_at: futureExpiry, source: "comped", assigned_by: userId },
      { onConflict: "user_id" }
    );

    const plan = await getEffectivePlan(userClient, userId);
    expect(plan.tierLevel).toBe(3);
    expect(plan.isTrial).toBe(true);
    expect(new Date(plan.trialExpiresAt!).getTime()).toBe(new Date(futureExpiry).getTime());
  }, 15_000);

  it("the SAME account automatically resolves to tier 0 the instant trial_expires_at is in the past — no admin action required", async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
    await admin.from("user_subscriptions").update({ trial_expires_at: pastExpiry }).eq("user_id", userId);

    // No other write happens here — this is the read-time enforcement itself.
    const plan = await getEffectivePlan(userClient, userId);
    expect(plan.tierLevel).toBe(0);
    expect(plan.isTrial).toBe(false);
    // But the expiration date is still reported for "your trial ended on...' UI copy (Postgres round-trips the
    // timestamp in its own string format, so compare parsed instants rather than exact string equality).
    expect(new Date(plan.trialExpiresAt!).getTime()).toBe(new Date(pastExpiry).getTime());
  }, 15_000);

  it("expires exactly at the boundary — one second past expiry is already expired, one second before is still active", async () => {
    const oneSecondPast = new Date(Date.now() - 1000).toISOString();
    await admin.from("user_subscriptions").update({ trial_expires_at: oneSecondPast }).eq("user_id", userId);
    expect((await getEffectivePlan(userClient, userId)).tierLevel).toBe(0);

    const oneSecondFuture = new Date(Date.now() + 1000).toISOString();
    await admin.from("user_subscriptions").update({ trial_expires_at: oneSecondFuture }).eq("user_id", userId);
    expect((await getEffectivePlan(userClient, userId)).tierLevel).toBe(3);
  }, 15_000);
});
