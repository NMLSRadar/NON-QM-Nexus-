// Integration tests for (a) admin-comped org subscriptions (identical
// grant to a Stripe one, but audited) and (b) billing-admin continuity
// (the last org_admin on an org with an active subscription can't remove
// themselves), against the REAL Supabase project.
//
// Same convention as tests/integration/trialAdminActions.test.ts: exercises
// the underlying service-role writes directly for the admin-gated action
// (src/app/admin/teams/actions.ts's compOrgSubscription performs exactly
// these writes after requirePlatformAdmin() succeeds — its own cookie-based
// admin gating isn't re-verified here, matching that existing convention),
// but calls checkLastAdminContinuity() directly since it's a plain
// exported helper with no auth of its own (src/app/account/team/actions.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkLastAdminContinuity } from "@/lib/orgContinuity";
import { probeTeamSchemaReady } from "./teamMembershipSchemaProbe";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Comped org subscriptions + billing-admin continuity (live database)", () => {
  let admin: SupabaseClient;
  let schemaReady = false;
  let enterprisePlanId: string;
  let orgId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    schemaReady = await probeTeamSchemaReady(admin);
    if (!schemaReady) return;

    const { data: enterprise } = await admin.from("membership_plans").select("id").eq("key", "enterprise").single();
    enterprisePlanId = enterprise!.id as string;

    const { data: org } = await admin.from("organizations").insert({ name: `NQN Comp+Continuity Test ${Date.now()}` }).select("id").single();
    orgId = org!.id as string;
  }, 30_000);

  afterAll(async () => {
    if (!schemaReady) return;
    await admin.from("audit_logs").delete().eq("organization_id", orgId);
    await admin.from("org_subscriptions").delete().eq("organization_id", orgId);
    await admin.from("memberships").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("grants a comped org subscription identically to a Stripe one, with an audit_logs entry", async (ctx) => {
    if (!schemaReady) return ctx.skip();

    // Mirrors src/app/admin/teams/actions.ts's compOrgSubscription() exactly.
    const platformAdminActorId = orgId; // any real uuid works for this FK-less audit column
    const { error: insertError } = await admin.from("org_subscriptions").insert({
      organization_id: orgId,
      plan_id: enterprisePlanId,
      seat_count: 5,
      status: "active",
      source: "comped",
    });
    expect(insertError).toBeNull();

    await admin.from("audit_logs").insert({
      organization_id: orgId,
      actor_user_id: platformAdminActorId,
      action: "org_subscription.comped_granted",
      entity_type: "org_subscriptions",
      metadata: { plan_id: enterprisePlanId, seat_count: 5 },
    });

    const { data: row } = await admin.from("org_subscriptions").select("*").eq("organization_id", orgId).eq("status", "active").single();
    expect(row!.source).toBe("comped");
    expect(row!.seat_count).toBe(5);
    expect(row!.stripe_subscription_id).toBeNull();

    const { data: auditRow } = await admin
      .from("audit_logs")
      .select("*")
      .eq("organization_id", orgId)
      .eq("action", "org_subscription.comped_granted")
      .maybeSingle();
    expect(auditRow, "a comped grant must leave an audit_logs entry").not.toBeNull();
  });

  it("refuses to remove the only org_admin while the org has an active subscription", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const { data: user, error } = await admin.auth.admin.createUser({
      email: `nqn-continuity-lone-admin-${Date.now()}@gmail.com`,
      password: "Continuity-Pw-123",
      email_confirm: true,
    });
    if (error || !user.user) throw new Error(`Failed to create test user: ${error?.message}`);
    createdUserIds.push(user.user.id);

    const { data: membership } = await admin
      .from("memberships")
      .insert({ organization_id: orgId, user_id: user.user.id, role: "org_admin" })
      .select("id")
      .single();

    // The active comped subscription from the previous test is still in
    // place — this is the only org_admin, so removal must be refused.
    const refusal = await checkLastAdminContinuity(orgId, membership!.id as string);
    expect(refusal).not.toBeNull();
    expect(refusal).toMatch(/only admin/i);
  });

  it("allows removal once a SECOND org_admin exists", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    const { data: secondAdmin, error } = await admin.auth.admin.createUser({
      email: `nqn-continuity-second-admin-${Date.now()}@gmail.com`,
      password: "Continuity-Pw-123",
      email_confirm: true,
    });
    if (error || !secondAdmin.user) throw new Error(`Failed to create second admin: ${error?.message}`);
    createdUserIds.push(secondAdmin.user.id);
    await admin.from("memberships").insert({ organization_id: orgId, user_id: secondAdmin.user.id, role: "org_admin" });

    const { data: firstMembership } = await admin.from("memberships").select("id").eq("organization_id", orgId).eq("role", "org_admin").order("created_at", { ascending: true }).limit(1).single();

    const refusal = await checkLastAdminContinuity(orgId, firstMembership!.id as string);
    expect(refusal, "with a second org_admin present, removal of the first must be allowed").toBeNull();
  });

  it("allows removal once the org's subscription is no longer active (no billing continuity to protect)", async (ctx) => {
    if (!schemaReady) return ctx.skip();
    await admin.from("org_subscriptions").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("organization_id", orgId);
    await admin.from("memberships").delete().eq("organization_id", orgId).neq("role", "org_admin");
    // Leave exactly one org_admin (the lone one from the earlier test) with no active subscription.
    const { data: remainingAdmins } = await admin.from("memberships").select("id").eq("organization_id", orgId).eq("role", "org_admin");
    // Remove every admin but one to get back to a single remaining org_admin.
    for (const row of (remainingAdmins ?? []).slice(1)) {
      await admin.from("memberships").delete().eq("id", row.id as string);
    }
    const { data: soleAdmin } = await admin.from("memberships").select("id").eq("organization_id", orgId).eq("role", "org_admin").single();

    const refusal = await checkLastAdminContinuity(orgId, soleAdmin!.id as string);
    expect(refusal).toBeNull();
  });
});
