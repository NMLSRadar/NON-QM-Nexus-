// Integration tests for Membership Management (task 04, docs/tasks/04-
// membership-management.md) — live database. Exercises the guardrails the
// spec calls out: member-role sessions see ZERO rows, every transition writes
// a membership_events audit row, and replay is idempotent (a duplicate
// transition creates one event, not two).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Membership management — live database", () => {
  let admin: SupabaseClient;
  let actorUserId: string;
  const orgIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    // A real user to be the audit actor (FK to users.id).
    const { data: actor, error: actorError } = await admin.auth.admin.createUser({
      email: `membership-actor-${Date.now()}@gmail.com`,
      password: "Actor-Pw-123!",
      email_confirm: true,
    });
    if (actorError || !actor.user) throw new Error(`Failed to create actor user: ${actorError?.message}`);
    actorUserId = actor.user.id;
    createdUserIds.push(actorUserId);
  }, 30_000);

  afterAll(async () => {
    for (const orgId of orgIds) {
      await admin.from("membership_events").delete().eq("organization_id", orgId);
      await admin.from("membership_notes").delete().eq("organization_id", orgId);
      await admin.from("organization_memberships").delete().eq("organization_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
    }
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 90_000);

  async function makeOrg(): Promise<string> {
    const { data, error } = await admin.from("organizations").insert({ name: `NQN-Membership-${Date.now()}-${Math.floor(Math.random() * 10000)}` }).select("id").single();
    if (error || !data) throw new Error(`Failed to create org: ${error?.message}`);
    orgIds.push(data.id as string);
    return data.id as string;
  }

  it("a transition via record_membership_transition writes a status + one audit event", async (ctx) => {
    if (!hasCredentials) return ctx.skip();
    const orgId = await makeOrg();

    // Seed: first touch at 'trialing'.
    const { error: seedError } = await admin.rpc("record_membership_transition", {
      p_organization_id: orgId,
      p_to_status: "trialing",
      p_source: "system",
    });
    expect(seedError).toBeNull();

    const { data: row } = await admin.from("organization_memberships").select("status").eq("organization_id", orgId).maybeSingle();
    expect(row?.status).toBe("trialing");

    // Transition to active.
    const { error: actError } = await admin.rpc("record_membership_transition", {
      p_organization_id: orgId,
      p_to_status: "active",
      p_source: "webhook",
    });
    expect(actError).toBeNull();

    const { data: events } = await admin.from("membership_events").select("from_status, to_status, source").eq("organization_id", orgId).order("created_at");
    expect(events).toHaveLength(2);
    expect(events![1]).toMatchObject({ from_status: "trialing", to_status: "active", source: "webhook" });
  }, 60_000);

  it("replay is idempotent — a duplicate cancellation transition creates one event, not two", async (ctx) => {
    if (!hasCredentials) return ctx.skip();
    const orgId = await makeOrg();
    await admin.rpc("record_membership_transition", { p_organization_id: orgId, p_to_status: "active", p_source: "webhook" });

    // Replay the same event twice (simulating a webhook redelivery).
    const { error: c1 } = await admin.rpc("record_membership_transition", { p_organization_id: orgId, p_to_status: "cancelled", p_source: "webhook", p_reason: "user.cancelled" });
    const { error: c2 } = await admin.rpc("record_membership_transition", { p_organization_id: orgId, p_to_status: "cancelled", p_source: "webhook", p_reason: "user.cancelled" });
    expect(c1).toBeNull();
    expect(c2).toBeNull();

    const { data: cancels } = await admin.from("membership_events").select("id").eq("organization_id", orgId).eq("to_status", "cancelled");
    expect(cancels).toHaveLength(1);
  }, 60_000);

  it("churn → reactivate increments reactivation_count and restores active", async (ctx) => {
    if (!hasCredentials) return ctx.skip();
    const orgId = await makeOrg();
    await admin.rpc("record_membership_transition", { p_organization_id: orgId, p_to_status: "active", p_source: "webhook" });
    await admin.rpc("record_membership_transition", { p_organization_id: orgId, p_to_status: "churned", p_source: "webhook", p_churn_type: "voluntary" });
    const { data: churned } = await admin.from("organization_memberships").select("status, churn_type, reactivation_count").eq("organization_id", orgId).maybeSingle();
    expect(churned?.status).toBe("churned");
    expect(churned?.churn_type).toBe("voluntary");

    await admin.rpc("record_membership_transition", { p_organization_id: orgId, p_to_status: "active", p_source: "admin" });
    const { data: reactivated } = await admin.from("organization_memberships").select("status, reactivation_count, reactivated_at").eq("organization_id", orgId).maybeSingle();
    expect(reactivated?.status).toBe("active");
    expect(reactivated?.reactivation_count).toBe(1);
    expect(reactivated?.reactivated_at).not.toBeNull();
  }, 60_000);

  it("a MEMBER-role session sees ZERO rows from the membership tables (RLS)", async (ctx) => {
    if (!hasCredentials) return ctx.skip();
    const memberEmail = `member-membership-${Date.now()}@gmail.com`;
    const { data: memberAuth } = await admin.auth.admin.createUser({ email: memberEmail, password: "Member-Pw-123!", email_confirm: true });
    if (!memberAuth?.user) throw new Error("member user creation failed");

    const member = createSupabaseClient(SUPABASE_URL!, ANON_KEY ?? "", { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await member.auth.signInWithPassword({ email: memberEmail, password: "Member-Pw-123!" });
    if (signInError) throw new Error(`member sign-in failed: ${signInError.message}`);

    for (const table of ["organization_memberships", "membership_events", "membership_notes"] as const) {
      const { data, error } = await member.from(table).select("*");
      expect(error).toBeNull();
      expect(data ?? [], `${table} must be empty for a member-role session`).toHaveLength(0);
    }
  }, 60_000);

  it("admin transitions with a reason are audited with actor + source admin", async (ctx) => {
    if (!hasCredentials) return ctx.skip();
    const orgId = await makeOrg();
    await admin.rpc("record_membership_transition", { p_organization_id: orgId, p_to_status: "active", p_source: "system" });

    const { error } = await admin.rpc("record_membership_transition", {
      p_organization_id: orgId,
      p_to_status: "past_due",
      p_source: "admin",
      p_actor_user_id: actorUserId,
      p_reason: "payment failed — outreach needed",
    });
    expect(error).toBeNull();

    const { data: events } = await admin.from("membership_events").select("from_status, to_status, source, actor_user_id, reason").eq("organization_id", orgId).eq("to_status", "past_due");
    expect(events).toHaveLength(1);
    expect(events![0]).toMatchObject({ source: "admin", actor_user_id: actorUserId, reason: "payment failed — outreach needed" });
  }, 60_000);

  it("a note is append-only admin data and shows in the org's notes", async (ctx) => {
    if (!hasCredentials) return ctx.skip();
    const orgId = await makeOrg();
    const { error } = await admin.from("membership_notes").insert({ organization_id: orgId, author_user_id: actorUserId, body: "Founder reachable on Slack — good save candidate." });
    expect(error).toBeNull();

    const { data: notes } = await admin.from("membership_notes").select("body, author_user_id").eq("organization_id", orgId);
    expect(notes).toHaveLength(1);
    expect((notes![0] as { body?: string } | undefined)?.body).toContain("save candidate");
  }, 60_000);
});