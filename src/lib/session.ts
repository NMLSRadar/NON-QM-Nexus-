// Per-request session helpers: the authenticated user's repository (backed
// by the real Supabase Postgres database, scoped by RLS) and their current
// organization id. Always resolved from the server-side session — never
// from client input — to preserve tenant isolation.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Repository } from "@/lib/store";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";

export async function getRepository(): Promise<Repository> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return new SupabaseRepository(supabase, user?.id);
}

/**
 * The signed-in user's organization id, resolved via their membership row.
 * A user with no membership (shouldn't normally happen — sign-up provisions
 * one automatically) is sent back to sign in rather than silently failing.
 */
export async function getCurrentOrganizationId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve organization: ${error.message}`);
  if (!data) redirect("/login");

  return data.organization_id as string;
}
