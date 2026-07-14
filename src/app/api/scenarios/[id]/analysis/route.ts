import { NextResponse } from "next/server";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/store";

/**
 * GET /api/scenarios/:id/analysis
 * Returns the full deterministic analysis as JSON (machine-readable export).
 * Tenant scoping comes from the server session, never from the client.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getRepository();
  const org = getCurrentOrganizationId();

  const scenario = await repo.getScenario(org, id);
  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const catalog = await repo.getCatalog(org);
  const analysis = analyzeScenario(scenario, catalog);
  return NextResponse.json(analysis);
}
