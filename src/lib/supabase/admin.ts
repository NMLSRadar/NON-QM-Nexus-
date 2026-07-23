// Service-role Supabase client. BYPASSES ROW-LEVEL SECURITY — server-only,
// never import this from a Client Component. Any query made with this
// client MUST manually scope by the caller's organization_id (resolved
// from their authenticated session) and must never accept a
// client-supplied organization id. See supabase/rls-policies.sql.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
