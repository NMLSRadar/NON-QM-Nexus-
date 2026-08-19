import { createClient } from "@supabase/supabase-js";

const GENERATED_TEST_EMAIL = /^(?:nqn-[a-z0-9-]+|reactivate-(?:grace|recreate)-test|cancel-stripe-sub-test|membership-actor|member-membership|attributed-signup|attr-dup|unknown-ref|no-ref|conflict|invitee-attrib|member-attrib|ae-[ab]|suppression-test|not-suppressed|placement|stats)-\d{11,}(?:-[a-z0-9]+)?@(?:gmail\.com|example\.com)$/i;

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // CI normally has no local environment file.
}

async function purgeGeneratedTestUsers(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url === "[SENSITIVE]" || key === "[SENSITIVE]") return;

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.from("users").select("email").is("deleted_at", null);
  if (error) throw new Error(`Unable to scan generated test users: ${error.message}`);

  const emails = (data ?? []).map((row) => String(row.email)).filter((email) => GENERATED_TEST_EMAIL.test(email));
  for (const email of emails) {
    const { error: purgeError } = await admin.rpc("purge_user_by_email", { p_email: email });
    if (purgeError) throw new Error(`Unable to purge generated test user ${email}: ${purgeError.message}`);
  }
}

export default async function setup() {
  await purgeGeneratedTestUsers();
  return async () => {
    await purgeGeneratedTestUsers();
  };
}
