// A service-role Supabase client WITHOUT the "server-only" import guard
// used by src/lib/supabase/admin.ts. That guard is for preventing
// accidental bundling into client JS; this internal helper is only ever
// used deep inside SupabaseRepository (never imported by a Client
// Component), and needs to remain importable from plain Node test
// processes (tests/integration/*.test.ts run outside any Next.js
// bundler, where the "server-only" package deliberately throws).
//
// Same safety rule as src/lib/supabase/admin.ts: this BYPASSES RLS —
// every call site must manually scope by an organization id that came
// from the caller's own resolved session, never from client input.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Service role client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
