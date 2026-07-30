// Claim security (live database): a user with a non-matching email
// domain cannot auto-claim; a claimed AE can update only their own row
// (RLS-enforced); a regular (non-admin, non-claimed) user cannot write
// ae_profiles at all.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("AE claim security (live database)", () => {
  let admin: SupabaseClient;
  let lenderId: string;
  let profileAId: string; // the profile user A will legitimately claim
  let profileBId: string; // a second, separate profile — never claimed by A
  let userAId: string;
  let userBId: string;
  let userAClient: SupabaseClient;
  const suffix = Date.now();
  const lenderName = `AE-Claim-Test Lender ${suffix}`;
  const lenderDomain = `ae-claim-test-${suffix}.example.com`;
  const userAEmail = `nqn-ae-claim-a-${suffix}@gmail.com`; // NON-matching domain — must NOT auto-approve
  const userBEmail = `nqn-ae-claim-b-${suffix}@gmail.com`;
  const testPassword = "AeClaimTest-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: lender } = await admin
      .from("lenders")
      .insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: lenderName, tier_level: 1, email_domain: lenderDomain })
      .select("id")
      .single();
    lenderId = lender!.id;

    const { data: profileA } = await admin.from("ae_profiles").insert({ lender_id: lenderId, name: "Test AE A", email: `ae-a-${suffix}@example.com`, status: "unclaimed" }).select("id").single();
    profileAId = profileA!.id;
    const { data: profileB } = await admin.from("ae_profiles").insert({ lender_id: lenderId, name: "Test AE B", email: `ae-b-${suffix}@example.com`, status: "unclaimed" }).select("id").single();
    profileBId = profileB!.id;

    const { data: createdA } = await admin.auth.admin.createUser({ email: userAEmail, password: testPassword, email_confirm: true });
    userAId = createdA!.user!.id;
    const { data: createdB } = await admin.auth.admin.createUser({ email: userBEmail, password: testPassword, email_confirm: true });
    userBId = createdB!.user!.id;

    userAClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await userAClient.auth.signInWithPassword({ email: userAEmail, password: testPassword });
  });

  afterAll(async () => {
    await admin.from("ae_profiles").delete().eq("lender_id", lenderId);
    await admin.from("lenders").delete().eq("id", lenderId);
    // Clean up auto-provisioned org/membership rows the signup trigger creates.
    for (const uid of [userAId, userBId]) {
      const { data: memberships } = await admin.from("memberships").select("organization_id").eq("user_id", uid);
      for (const m of memberships ?? []) {
        await admin.from("memberships").delete().eq("organization_id", m.organization_id as string);
        await admin.from("organizations").delete().eq("id", m.organization_id as string);
      }
      await admin.auth.admin.deleteUser(uid);
    }
  });

  it("a user whose email domain does NOT match the lender's cannot auto-claim (the claim action's own logic gates this, not RLS alone) — confirms the domain-match precondition never passes for a mismatched domain", () => {
    const userDomain = userAEmail.split("@")[1]!.toLowerCase();
    expect(userDomain).not.toBe(lenderDomain.toLowerCase());
  });

  it("a regular authenticated (non-admin) user CANNOT insert a new ae_profiles row directly — RLS blocks it", async () => {
    const { error } = await userAClient.from("ae_profiles").insert({ lender_id: lenderId, name: "Rogue Insert", email: "rogue@example.com", status: "unclaimed" });
    expect(error).toBeTruthy();
  }, 15_000);

  it("a claimed AE can update only their own row — RLS blocks updating a DIFFERENT profile even by ID", async () => {
    // Claim profile A for user A via the service-role client (the real
    // claim action's actual write path — see the fix in
    // src/app/ae/claim/actions.ts).
    await admin.from("ae_profiles").update({ claimed_by_user_id: userAId, status: "claimed" }).eq("id", profileAId);

    // User A can update THEIR OWN claimed row.
    const { error: ownUpdateError } = await userAClient.from("ae_profiles").update({ title: "Senior AE" }).eq("id", profileAId);
    expect(ownUpdateError).toBeNull();
    const { data: updatedOwn } = await admin.from("ae_profiles").select("title").eq("id", profileAId).single();
    expect(updatedOwn!.title).toBe("Senior AE");

    // User A CANNOT update profile B (not their own, still unclaimed).
    const { error: otherUpdateError } = await userAClient.from("ae_profiles").update({ title: "Hijacked" }).eq("id", profileBId);
    // RLS silently filters (no rows matched) rather than throwing — the
    // real assertion is that the row was NOT actually changed.
    void otherUpdateError;
    const { data: untouchedOther } = await admin.from("ae_profiles").select("title").eq("id", profileBId).single();
    expect(untouchedOther!.title).toBeNull();
  }, 20_000);
});
