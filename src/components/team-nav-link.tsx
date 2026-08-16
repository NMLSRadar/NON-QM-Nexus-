import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tryGetCurrentOrganizationId } from "@/lib/session";

/** Shown only to an org_admin of their current organization — mirrors
 * AdminNavLink's conditional-visibility pattern, but scoped per-org rather
 * than platform-wide. /account/team itself also gates via requireOrgAdmin
 * — this is UI convenience, never the actual security boundary.
 * Uses the NON-redirecting org lookup: this component renders inside the
 * root layout on every page (including /login), and redirecting from a
 * layout component is what caused the /login 307 redirect loop. */
export async function TeamNavLink() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const organizationId = await tryGetCurrentOrganizationId();
  if (!organizationId) return null;

  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (data?.role !== "org_admin") return null;

  return (
    <Link
      href="/account/team"
      className="text-amber-200/90 hover:text-amber-100 rounded px-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      Team
    </Link>
  );
}
