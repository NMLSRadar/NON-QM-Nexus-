// Shared helper for every Team Membership integration test file: these
// tests need BOTH real Supabase credentials (the existing hasCredentials
// convention) AND the new schema (org_subscriptions / org_invites /
// memberships.covered_by_org_plan) actually pushed to the live database —
// see supabase/team-membership-schema.sql, team-membership-defaults.sql,
// team-invite-signup.sql, and HANDOFF.md's "known operational gotcha" about
// `prisma db push` needing DATABASE_URL, which was not available when this
// suite was written (2026-07-30). Every test below is written to run for
// real the instant the schema is live — this probe is what lets the whole
// suite degrade to a clearly-logged skip (not a false failure) until then,
// exactly like the existing hasCredentials skip convention.
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedResult: boolean | null = null;

export async function probeTeamSchemaReady(admin: SupabaseClient): Promise<boolean> {
  if (cachedResult !== null) return cachedResult;
  const { error } = await admin.from("org_subscriptions").select("id").limit(1);
  cachedResult = !error;
  if (!cachedResult) {
    console.warn(
      "\n[team-membership tests] org_subscriptions table not found — skipping until `prisma db push` + " +
        "supabase/team-membership-*.sql are applied (see HANDOFF.md). This is a documented skip, not a failure.\n"
    );
  }
  return cachedResult;
}
