// Org-or-platform admin gate for org-scoped chatbot admin surfaces
// (/admin/lender-posture, /admin/chat-unanswered).
//
// Posture profiles and the unanswered-questions queue are org-scoped
// editorial data (Part 2 §1-2 explicitly: "org-editable, org-overridable"),
// so org admins must be able to maintain their OWN org's rows, and platform
// admins manage the shared platform catalog org / see every org. platform
// admin wins; otherwise the caller must be an org_admin of their current
// organization (same principle as requireOrgAdmin — never trust UI-only
// gating).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrganizationId } from "@/lib/session";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

export type AdminScope =
  | { kind: "platform"; organizationId: string } // manages platform catalog org
  | { kind: "org"; organizationId: string }; // manages their own org

export interface OrgOrPlatformAdminContext {
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never;
  userId: string;
  scope: AdminScope;
}

export async function requireOrgOrPlatformAdmin(): Promise<OrgOrPlatformAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: platformRow } = await supabase.from("users").select("platform_admin").eq("id", user.id).maybeSingle();
  if (platformRow?.platform_admin) {
    return { supabase, userId: user.id, scope: { kind: "platform", organizationId: PLATFORM_CATALOG_ORGANIZATION_ID } };
  }

  const organizationId = await getCurrentOrganizationId();
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (membership?.role !== "org_admin") redirect("/");

  return { supabase, userId: user.id, scope: { kind: "org", organizationId } };
}