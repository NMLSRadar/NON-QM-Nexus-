import { NextResponse } from "next/server";
import { analyzeScenario } from "@/domain/analyze";
import { getRepository } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/scenarios/:id/analysis
 * Returns the full deterministic analysis as JSON (machine-readable export).
 * Tenant scoping comes from the server session, never from the client.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "No organization membership" }, { status: 403 });
  }
  const org = membership.organization_id as string;

  const repo = await getRepository();
  const scenario = await repo.getScenario(org, id);
  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const catalog = await repo.getCatalog(org);
  const analysis = analyzeScenario(scenario, catalog);
  return NextResponse.json(analysis);
}
