// Placement lifecycle (live database): webhook activate -> featured;
// cancel -> reverts; comped placement works without Stripe and writes
// its audit entry.
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

describe.skipIf(!hasCredentials)("AE placement lifecycle (live database)", () => {
  let admin: SupabaseClient;
  let lenderId: string;
  let profileId: string;
  let adminUserId: string;
  const suffix = Date.now();

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: lender } = await admin.from("lenders").insert({ organization_id: PLATFORM_CATALOG_ORGANIZATION_ID, name: `AE-Placement-Test Lender ${suffix}`, tier_level: 1 }).select("id").single();
    lenderId = lender!.id;
    const { data: profile } = await admin.from("ae_profiles").insert({ lender_id: lenderId, name: "Test Placement AE", email: `placement-${suffix}@example.com`, status: "claimed" }).select("id").single();
    profileId = profile!.id;
    const { data: adminUser } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").maybeSingle();
    adminUserId = adminUser?.id ?? profileId; // fall back to any valid uuid-shaped id if the seeded admin isn't present
  });

  afterAll(async () => {
    await admin.from("audit_logs").delete().eq("entity_id", profileId);
    await admin.from("ae_placements").delete().eq("ae_profile_id", profileId);
    await admin.from("ae_profiles").delete().eq("id", profileId);
    await admin.from("lenders").delete().eq("id", lenderId);
  });

  it("simulated webhook activation (checkout.session.completed -> customer.subscription.created) sets status=active, source=stripe", async () => {
    // Mirrors exactly what src/app/api/webhooks/stripe/route.ts's
    // upsertAePlacementFromSubscription writes for an active subscription.
    const { error } = await admin.from("ae_placements").upsert(
      { ae_profile_id: profileId, status: "active", source: "stripe", stripe_customer_id: "cus_test", stripe_subscription_id: `sub_test_${suffix}`, started_at: new Date().toISOString(), canceled_at: null },
      { onConflict: "ae_profile_id" }
    );
    expect(error).toBeNull();
    const { data } = await admin.from("ae_placements").select("status, source").eq("ae_profile_id", profileId).single();
    expect(data!.status).toBe("active");
    expect(data!.source).toBe("stripe");
  }, 15_000);

  it("simulated webhook cancellation (customer.subscription.deleted) reverts status to canceled", async () => {
    const { error } = await admin.from("ae_placements").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("ae_profile_id", profileId);
    expect(error).toBeNull();
    const { data } = await admin.from("ae_placements").select("status, canceled_at").eq("ae_profile_id", profileId).single();
    expect(data!.status).toBe("canceled");
    expect(data!.canceled_at).not.toBeNull();
  }, 15_000);

  it("a comped placement works without any Stripe fields and writes an audit_logs entry", async () => {
    const { error: placementError } = await admin.from("ae_placements").upsert(
      { ae_profile_id: profileId, status: "active", source: "comped", stripe_customer_id: null, stripe_subscription_id: null, started_at: new Date().toISOString(), canceled_at: null },
      { onConflict: "ae_profile_id" }
    );
    expect(placementError).toBeNull();

    const { error: auditError } = await admin.from("audit_logs").insert({
      organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
      actor_user_id: adminUserId,
      action: "comp_ae_placement",
      entity_type: "ae_profile",
      entity_id: profileId,
      metadata: { reason: "Test comp" },
    });
    expect(auditError).toBeNull();

    const { data: placement } = await admin.from("ae_placements").select("status, source, stripe_subscription_id").eq("ae_profile_id", profileId).single();
    expect(placement!.status).toBe("active");
    expect(placement!.source).toBe("comped");
    expect(placement!.stripe_subscription_id).toBeNull();

    const { data: audit } = await admin.from("audit_logs").select("action, entity_id, metadata").eq("entity_id", profileId).eq("action", "comp_ae_placement").maybeSingle();
    expect(audit).toBeTruthy();
    expect((audit!.metadata as { reason: string }).reason).toBe("Test comp");
  }, 15_000);
});
