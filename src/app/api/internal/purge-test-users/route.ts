import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export const dynamic = "force-dynamic";

const GENERATED_TEST_EMAIL = /^(?:nqn-[a-z0-9-]+|reactivate-(?:grace|recreate)-test|cancel-stripe-sub-test|membership-actor|member-membership|attributed-signup|attr-dup|unknown-ref|no-ref|conflict|invitee-attrib|member-attrib|ae-[ab]|suppression-test|not-suppressed|placement|stats)-\d{11,}(?:-[a-z0-9]+)?@(?:gmail\.com|example\.com)$/i;

function authorized(request: NextRequest): boolean {
  const expected = process.env.TEST_USER_CLEANUP_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && supplied && supplied === expected);
}

async function candidates() {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("users")
    .select("id, email, platform_admin, created_at")
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw new Error(error.message);

  const matched = (data ?? []).filter((row) => GENERATED_TEST_EMAIL.test(String(row.email)));
  return { service, matched };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { matched } = await candidates();
  return NextResponse.json({
    candidateCount: matched.length,
    candidates: matched.map((row) => ({ email: row.email, createdAt: row.created_at, platformAdmin: row.platform_admin })),
  });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "PURGE_GENERATED_TEST_USERS") {
    return NextResponse.json({ error: "Confirmation phrase required" }, { status: 400 });
  }

  const { service, matched } = await candidates();
  const failures: Array<{ email: string; error: string }> = [];
  let purged = 0;
  for (const row of matched) {
    const { error } = await service.rpc("purge_user_by_email", { p_email: row.email });
    if (error) failures.push({ email: row.email, error: error.message });
    else purged += 1;
  }

  const { matched: remaining } = await candidates();
  return NextResponse.json({ attempted: matched.length, purged, failures, remaining: remaining.length });
}
