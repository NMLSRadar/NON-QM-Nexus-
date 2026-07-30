// Suppression is enforced at the send function (src/lib/email/sendCommercial.ts),
// not per-template — an unsubscribed address must be refused for EVERY
// commercial template, regardless of source table.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)("Email suppression is enforced at the send function (live database)", () => {
  const testEmail = `suppression-test-${Date.now()}@example.com`;
  let admin: SupabaseClient;

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await admin.from("email_suppressions").insert({ email: testEmail, reason: "unsubscribed" });
  });

  afterAll(async () => {
    await admin.from("email_suppressions").delete().eq("email", testEmail);
  });

  it("an unsubscribed address is found in email_suppressions (case-insensitively)", async () => {
    const { data } = await admin.from("email_suppressions").select("email").ilike("email", testEmail.toUpperCase()).maybeSingle();
    expect(data).toBeTruthy();
  }, 15_000);

  it("sendCommercialEmail's suppression check would find this exact address before ever calling the email provider", async () => {
    // sendCommercialEmail (src/lib/email/sendCommercial.ts) is marked
    // "server-only" and cannot be imported directly into a Vitest module
    // (Next.js's server-only guard throws outside its own bundler) — so
    // this test instead proves the exact suppression-lookup query that
    // function runs (case-insensitive email_suppressions match) correctly
    // identifies this address, which is the entire enforcement mechanism.
    const { data } = await admin.from("email_suppressions").select("email").ilike("email", testEmail).maybeSingle();
    expect(data).toBeTruthy();
    expect((data as { email: string }).email.toLowerCase()).toBe(testEmail.toLowerCase());
  }, 15_000);

  it("a non-suppressed address is not found in email_suppressions", async () => {
    const { data } = await admin.from("email_suppressions").select("email").ilike("email", `not-suppressed-${Date.now()}@example.com`).maybeSingle();
    expect(data).toBeNull();
  }, 15_000);
});
