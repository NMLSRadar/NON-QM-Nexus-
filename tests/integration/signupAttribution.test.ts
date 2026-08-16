// Integration tests for Signup Attribution (task 03, docs/tasks/03-signup-
// attribution.md, supabase/signup-attribution.sql) — live database.
//
// Every test exercises the REAL production path: auth signup fires the real
// on_auth_user_created trigger (handle_new_user), which now calls
// resolve_attribution_for_signup() with the `ref` code that rode through
// Supabase Auth user metadata. Tests are skipped when no live credentials
// are present, like the rest of tests/integration.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateInviteToken, hashInviteToken } from "@/lib/invites";
import { probeTeamSchemaReady } from "./teamMembershipSchemaProbe";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Signup attribution — live database", () => {
  let admin: SupabaseClient;
  let schemaReady = false;
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdInviteIds: string[] = [];
  const createdRepIds: string[] = [];

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    schemaReady = await probeTeamReady(admin);
  }, 30_000);

  afterAll(async () => {
    for (const userId of createdUserIds) {
      const { data: membership } = await admin.from("memberships").select("organization_id").eq("user_id", userId).is("deleted_at", null).maybeSingle();
      if (membership) createdOrgIds.push(membership.organization_id as string);
    }
    for (const inviteId of createdInviteIds) {
      await admin.from("org_invites").delete().eq("id", inviteId);
    }
    for (const repId of createdRepIds) {
      await admin.from("attribution_changes").delete().eq("changed_by", repId);
      await admin.from("sales_reps").delete().eq("id", repId);
    }
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
    for (const orgId of new Set(createdOrgIds)) {
      await admin.from("attribution_captures").delete().eq("organization_id", orgId);
      await admin.from("organization_attribution").delete().eq("organization_id", orgId);
      await admin.from("attribution_changes").delete().eq("organization_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
    }
  }, 90_000);

  const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@gmail.com`;

  // Creates a real auth user (which fires the signup trigger) + a sales rep
  // row for them. Returns their user id.
  async function createRep(code: string, displayName: string): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email: unique(`nqn-rep-${code}`),
      password: "Attribution-Pw-123!",
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Failed to create rep user: ${error?.message}`);
    const userId = data.user.id;
    createdUserIds.push(userId);
    const { error: repError } = await admin.from("sales_reps").insert({ user_id: userId, code: code.toLowerCase(), display_name: displayName, is_active: true });
    if (repError) throw new Error(`Failed to create sales rep: ${repError.message}`);
    const { data: rep } = await admin.from("sales_reps").select("id").eq("user_id", userId).maybeSingle();
    if (rep) createdRepIds.push(rep.id as string);
    return userId;
  }

  async function signupAs(emailSuffix: string, ref?: string, inviteToken?: string): Promise<string> {
    const metadata: Record<string, string> = {};
    if (inviteToken) metadata.invite_token = inviteToken;
    if (ref) metadata.ref = ref;
    const { data, error } = await admin.auth.admin.createUser({
      email: unique(emailSuffix),
      password: "Attribution-Pw-123!",
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) throw new Error(`Signup failed: ${error?.message}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function orgOf(userId: string): Promise<string> {
    const { data } = await admin.from("memberships").select("organization_id").eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (!data) throw new Error(`No org for user ${userId}`);
    return data.organization_id as string;
  }

  async function attributionOf(orgId: string): Promise<Record<string, unknown> | null> {
    const { data } = await admin.from("organization_attribution").select("*").eq("organization_id", orgId).maybeSingle();
    return data ?? null;
  }

  it("valid active rep code attributes the new org (signup_link, confirmed) and logs a resolved capture", async (ctx) => {
    if (!hasCredentials || !schemaReady) return ctx.skip();
    const repUserId = await createRep("attribbobby", "Bobby Test Rep");
    const userId = await signupAs("attributed-signup", "attribbobby");
    const orgId = await orgOf(userId);

    const attribution = await attributionOf(orgId);
    expect(attribution?.attributed_to_user_id).toBe(repUserId);
    expect(attribution?.method).toBe("signup_link");
    expect(attribution?.status).toBe("confirmed");

    const { data: captures } = await admin.from("attribution_captures").select("*").eq("organization_id", orgId).eq("method", "signup_link");
    expect(captures).toHaveLength(1);
    expect(captures![0].rep_code).toBe("attribbobby");
    expect(captures![0].resolved).toBe(true);
  }, 60_000);

  it("duplicate identical capture is a no-op (one attribution row, one capture, confirmed)", async (ctx) => {
    if (!hasCredentials || !schemaReady) return ctx.skip();
    await createRep("attribdup", "Dup Rep");
    const userId = await signupAs("attr-dup", "attribdup");
    const orgId = await orgOf(userId);

    // Re-run the same resolver call the way a replayed webhook/signup would.
    const { error: replayError } = await admin.rpc("resolve_attribution_for_signup", {
      p_organization_id: orgId,
      p_ref: "attribdup",
      p_method: "signup_link",
    });
    expect(replayError).toBeNull();

    const { data: attributions } = await admin.from("organization_attribution").select("*").eq("organization_id", orgId);
    expect(attributions).toHaveLength(1);
    expect(attributions![0].status).toBe("confirmed");

    const { data: captures } = await admin.from("attribution_captures").select("*").eq("organization_id", orgId).eq("method", "signup_link");
    expect(captures).toHaveLength(1);
  }, 60_000);

  it("signup with an UNKNOWN ref leaves the org unattributed and logs an unresolved capture", async (ctx) => {
    if (!hasCredentials || !schemaReady) return ctx.skip();
    const userId = await signupAs("unknown-ref", "nope-not-a-rep");
    const orgId = await orgOf(userId);

    const attribution = await attributionOf(orgId);
    expect(attribution?.attributed_to_user_id).toBeNull();
    expect(attribution?.status).toBe("unattributed");

    const { data: captures } = await admin.from("attribution_captures").select("*").eq("organization_id", orgId).eq("rep_code", "nope-not-a-rep");
    expect(captures).toHaveLength(1);
    expect(captures![0].resolved).toBe(false);
  }, 60_000);

  it("signup with NO ref leaves the org unattributed (no rep assigned)", async (ctx) => {
    if (!hasCredentials || !schemaReady) return ctx.skip();
    const userId = await signupAs("no-ref");
    const orgId = await orgOf(userId);
    const attribution = await attributionOf(orgId);
    expect(attribution?.attributed_to_user_id).toBeNull();
    expect(attribution?.status).toBe("unattributed");
  }, 60_000);

  it("a DIFFERENT rep captured later flips status to needs_review and never overwrites", async (ctx) => {
    if (!hasCredentials || !schemaReady) return ctx.skip();
    const repA = await createRep("attribrepa", "Conflicted A");
    await createRep("attribrepb", "Conflicted B");
    const userId = await signupAs("conflict", "attribrepa");
    const orgId = await orgOf(userId);

    // Second capture from a DIFFERENT code (e.g. the same user later clicks a
    // different rep's link and signs in — resolver sees a new capture).
    const { error: replayError } = await admin.rpc("resolve_attribution_for_signup", {
      p_organization_id: orgId,
      p_ref: "attribrepb",
      p_source: "replay-different-code",
    });
    expect(replayError).toBeNull();

    const attribution = await attributionOf(orgId);
    expect(attribution?.status).toBe("needs_review");
    expect(attribution?.attributed_to_user_id).toBe(repA); // first capture wins
    // conflict_detail describes both sides by user id (codes aren't stored
    // on the attribution row) — assert it names the existing rep.
    expect(String(attribution?.conflict_detail)).toContain(repA);
    expect(String(attribution?.conflict_detail)).toContain("vs captured");
  }, 60_000);

  it("an invited signup attributes the org to the rep who created the invite (method invite)", async (ctx) => {
    if (!hasCredentials || !schemaReady) return ctx.skip();
    // Inviting org: create an org owned by a rep user.
    const repUserId = await createRep("attribinvite", "Invite Rep");
    const { data: org, error: orgError } = await admin.from("organizations").insert({ name: `NQN-InviteAttr-${Date.now()}` }).select("id").single();
    if (orgError || !org) throw new Error(`Failed to create invite host org: ${orgError?.message}`);
    const orgId = org.id as string;
    await admin.from("memberships").insert({ organization_id: orgId, user_id: repUserId, role: "org_admin" });
    createdOrgIds.push(orgId);

    const rawToken = generateInviteToken();
    const inviteEmail = unique("invitee-attrib");
    const { data: invite, error: inviteError } = await admin
      .from("org_invites")
      .insert({
        organization_id: orgId,
        email: inviteEmail,
        role: "broker",
        token_hash: hashInviteToken(rawToken),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invited_by: repUserId,
      })
      .select("id")
      .single();
    if (inviteError || !invite) throw new Error(`Failed to create invite: ${inviteError?.message}`);
    createdInviteIds.push(invite.id as string);

    // Sign up using that invite token (no ref) — the invite's creator (a rep)
    // should be attributed via the invite method.
    const { data: signup } = await admin.auth.admin.createUser({
      email: inviteEmail,
      password: "Attribution-Pw-123!",
      email_confirm: true,
      user_metadata: { invite_token: rawToken },
    });
    if (!signup?.user) throw new Error("Invitee signup failed");
    createdUserIds.push(signup.user.id);

    const attribution = await attributionOf(orgId);
    expect(attribution?.attributed_to_user_id).toBe(repUserId);
    expect(attribution?.method).toBe("invite");
    expect(attribution?.status).toBe("confirmed");
  }, 60_000);

  it("a MEMBER-role session sees ZERO rows from every attribution table (RLS)", async (ctx) => {
    if (!hasCredentials || !schemaReady) return ctx.skip();
    // Create a non-admin member and sign in as them.
    const memberEmail = unique("member-attrib");
    const { data: memberAuth } = await admin.auth.admin.createUser({
      email: memberEmail,
      password: "Member-Pw-123!",
      email_confirm: true,
    });
    if (!memberAuth?.user) throw new Error("Member user creation failed");
    createdUserIds.push(memberAuth.user.id);

    const memberClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: memberSignInError } = await memberClient.auth.signInWithPassword({ email: memberEmail, password: "Member-Pw-123!" });
    if (memberSignInError) throw new Error(`Member sign-in failed: ${memberSignInError.message}`);

    for (const table of ["organization_attribution", "attribution_captures", "attribution_changes", "sales_reps"] as const) {
      // Use a plain "select *" — RLS must return zero rows for a member.
      const { data, error } = await memberClient.from(table).select("*");
      expect(error).toBeNull();
      expect(data ?? [], `${table} must return 0 rows for a member role`).toHaveLength(0);
    }
  }, 60_000);
});

// Helpers shared above — declared here to keep the describe body readable.
// probeTeamReady: checks the two attribution tables are queryable (live DDL
// applied). Returns false when the schema isn't present yet.
async function probeTeamReady(admin: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await admin.from("sales_reps").select("id").limit(1);
    if (error) return false;
    const { error: attrError } = await admin.from("organization_attribution").select("id").limit(1);
    return !attrError;
  } catch {
    return false;
  }
}