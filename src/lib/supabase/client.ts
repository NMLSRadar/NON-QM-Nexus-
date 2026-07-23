// Browser-side Supabase client. Uses the public anon key only — safe to
// ship to the client. RLS on every table enforces per-organization scoping.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
