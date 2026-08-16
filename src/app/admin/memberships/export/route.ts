import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export const dynamic = "force-dynamic";

// CSV export for the Membership Management page.
//
// The page itself can't return a Response (Next 15.5 page type-check rejects
// a Response as the page return value), so the export lives here as a route
// handler: /admin/memberships/export?status=...
//
// Keeps the same columns and filtering as the page's SQL view (see
// src/app/admin/memberships/page.tsx) so the downloaded file matches what's
// shown on screen.

export async function GET(request: Request) {
  // Authenticate as a platform admin (route handlers can't use next/navigation
  // redirect(), so gate manually and return an HTTP redirect).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile?.platform_admin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;

  const service = createServiceRoleClient();
  const [membershipsRes, attributionRes, orgsRes, repsRes, usersRes] = await Promise.all([
    service.from("organization_memberships").select("*").order("updated_at", { ascending: false }),
    service.from("organization_attribution").select("organization_id, attributed_to_user_id, method, status, conflict_detail"),
    service.from("organizations").select("id, name, created_at"),
    service.from("sales_reps").select("id, user_id, code, display_name"),
    service.from("users").select("id, email"),
  ]);
  for (const [label, res] of [
    ["memberships", membershipsRes],
    ["attribution", attributionRes],
    ["orgs", orgsRes],
    ["reps", repsRes],
    ["users", usersRes],
  ] as const) {
    if (res.error) return new Response(`Failed to load ${label}: ${res.error.message}`, { status: 500 });
  }

  const orgNameById = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name as string]));
  const repByUserId = new Map((repsRes.data ?? []).map((r) => [r.user_id, r]));
  const userEmails = new Map<string, string>();
  for (const u of usersRes.data ?? []) userEmails.set(u.id as string, u.email as string);
  const repName = (userId: string | null) => {
    if (!userId) return "Unattributed";
    const rep = repByUserId.get(userId);
    return rep ? (rep.display_name as string) : (userEmails.get(userId) ?? "Unknown rep");
  };
  const getAttribution = (orgId: string) =>
    (attributionRes.data ?? []).find((x) => x.organization_id === orgId)?.attributed_to_user_id as string | null;

  const header = ["organization_id", "organization", "status", "plan_tier", "mrr_cents", "attributed_rep", "member_since", "renews_or_ends", "last_activity"];

  const rows = (membershipsRes.data ?? [])
    .filter((m) => (status ? m.status === status : true))
    .map((m) => {
      const orgId = m.organization_id as string;
      const values = [
        orgId,
        `"${(orgNameById.get(orgId) ?? "").replace(/"/g, '""')}"`,
        m.status,
        m.plan_tier,
        String(m.mrr_cents),
        `"${repName(getAttribution(orgId)).replace(/"/g, '""')}"`,
        m.converted_at ?? m.trial_started_at ?? "",
        m.current_period_end ?? "",
        "",
      ];
      return values.join(",");
    });

  const csv = [header.join(","), ...rows].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="memberships-${status ?? "all"}.csv"`,
    },
  });
}