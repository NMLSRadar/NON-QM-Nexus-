// Per-request session helpers: the authenticated user's repository (backed
// by the real Supabase Postgres database, scoped by RLS) and their current
// organization id. Always resolved from the server-side session — never
// from client input — to preserve tenant isolation.
import { cookies } from "next/headers";
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

/** Cookie holding the user's selected organization when they belong to more
 * than one (the minimal org switcher — see src/components/org-switcher.tsx).
 * Session-scoped only: never trusted on its own, always re-validated
 * against the user's actual active memberships below. */
export const ACTIVE_ORG_COOKIE = "nqn_active_org";

/**
 * The signed-in user's organization id. Resolution order:
 *   1. The session's selected org (ACTIVE_ORG_COOKIE), IF the user still
 *      holds an active (non-deleted) membership there — a stale cookie
 *      (membership removed, or pointing at an org this user never
 *      belonged to) is silently ignored, never trusted blindly.
 *   2. Otherwise, their oldest active membership — matching the original
 *      (pre-team-membership) behavior, and what every solo user with
 *      exactly one membership always gets.
 * A user with no membership at all (shouldn't normally happen — sign-up
 * provisions one automatically) is sent back to sign in rather than
 * silently failing.
 */
export async function getCurrentOrganizationId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to resolve organization: ${error.message}`);
  if (!memberships || memberships.length === 0) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const selected = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (selected && memberships.some((m) => m.organization_id === selected)) {
    return selected;
  }

  return memberships[0]!.organization_id as string;
}

/** All organizations the signed-in user has an active membership in, for
 * the org switcher. Empty array (never null) for a signed-out caller. */
export async function listUserOrganizations(): Promise<Array<{ organizationId: string; organizationName: string; role: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, role, organization:organizations(name)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list organizations: ${error.message}`);

  return (data ?? []).map((m) => {
    const org = Array.isArray(m.organization) ? m.organization[0] : m.organization;
    return {
      organizationId: m.organization_id as string,
      organizationName: (org?.name as string | undefined) ?? "Organization",
      role: m.role as string,
    };
  });
}

export interface LenderAccessInfo {
  /** The subscription tier that controls GUIDELINE access — never lender
   * VISIBILITY (see docs on Repository.listAllLenders). Platform admins
   * always resolve to 3 (full access) regardless of any assigned plan. */
  tierLevel: number;
  isPlatformAdmin: boolean;
  /** True only while an ACTIVE (non-expired) 14-day trial is what's
   * granting tierLevel — see membership.ts's EffectivePlan.isTrial. */
  isTrial: boolean;
  /** Present whenever this account has ever had a trial, expired or not —
   * lets the UI show "N days remaining" while active, or "your trial
   * ended on <date>" once expired. */
  trialExpiresAt: string | null;
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
  if (!user) return { tierLevel: 0, isPlatformAdmin: false, isTrial: false, trialExpiresAt: null };

  const [{ data: userRow }, plan] = await Promise.all([
    supabase.from("users").select("platform_admin").eq("id", user.id).maybeSingle(),
    getEffectivePlan(supabase, user.id),
  ]);
  const isPlatformAdmin = Boolean(userRow?.platform_admin);
  return { tierLevel: isPlatformAdmin ? 3 : plan.tierLevel, isPlatformAdmin, isTrial: plan.isTrial, trialExpiresAt: plan.trialExpiresAt };
}
