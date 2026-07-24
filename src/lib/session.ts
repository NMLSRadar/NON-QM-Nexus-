// Per-request session helpers: the authenticated user's repository (backed
// by the real Supabase Postgres database, scoped by RLS) and their current
// organization id. Always resolved from the server-side session — never
// from client input — to preserve tenant isolation.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Repository } from "@/lib/store";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";
import { getEffectivePlan } from "@/lib/repository/membership";

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

export interface LenderAccessInfo {
  /** The subscription tier that controls GUIDELINE access — never lender
   * VISIBILITY (see docs on Repository.listAllLenders). Platform admins
   * always resolve to 3 (full access) regardless of any assigned plan. */
  tierLevel: number;
  isPlatformAdmin: boolean;
}

/**
 * Resolves what the signed-in user is allowed to see guideline-wise, for
 * pages (like /lenders) that show every lender but must still gate the
 * actual program/guideline details behind the caller's real plan.
 */
export async function getLenderAccessInfo(): Promise<LenderAccessInfo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { tierLevel: 0, isPlatformAdmin: false };

  const [{ data: userRow }, plan] = await Promise.all([
    supabase.from("users").select("platform_admin").eq("id", user.id).maybeSingle(),
    getEffectivePlan(supabase, user.id),
  ]);
  const isPlatformAdmin = Boolean(userRow?.platform_admin);
  return { tierLevel: isPlatformAdmin ? 3 : plan.tierLevel, isPlatformAdmin };
}
