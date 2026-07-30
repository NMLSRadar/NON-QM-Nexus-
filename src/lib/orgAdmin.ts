// Org-admin gate for team-membership pages/actions (/account/team) —
// distinct from src/lib/admin.ts's platform-wide requirePlatformAdmin().
// org_admin is a per-organization role on memberships.role, scoped to the
// caller's CURRENT organization (see src/lib/session.ts's
// getCurrentOrganizationId, which itself only ever resolves from the
// server-side session/cookie — never client input).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrganizationId } from "@/lib/session";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrgAdminContext {
  /** The caller's own session client — RLS-scoped, safe for reads. Team
   * mutations still go through createServiceRoleClient() in the actual
   * server actions (see docs/team-membership.md) — this is provided for
   * convenience reads only. */
  supabase: SupabaseClient;
  userId: string;
  organizationId: string;
}

/** Redirects to /account if the signed-in user is not an org_admin of
 * their current organization. Every /account/team page and server action
 * must call this — never trust UI-only gating (same principle as
 * requirePlatformAdmin). */
export async function requireOrgAdmin(): Promise<OrgAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organizationId = await getCurrentOrganizationId();

  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to check org-admin status: ${error.message}`);
  if (data?.role !== "org_admin") redirect("/account");

  return { supabase, userId: user.id, organizationId };
}
