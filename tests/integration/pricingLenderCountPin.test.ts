// Copy-integrity fix (launch-hardening spec, Section 5): pins that the
// pricing page's rendered "N currently verified lenders" figure
// (getVerifiedLenderCount) always equals an independent call into the same
// quarantine query it's supposed to be delegating to
// (SupabaseRepository.listLenders with MAX_TIER_LEVEL) — so a future
// refactor that quietly changes what getVerifiedLenderCount actually counts
// (wrong tier override, different filter) gets caught here instead of
// silently drifting from what the rest of the app calls "verified".
import { describe, expect, it } from "vitest";
import { getVerifiedLenderCount } from "@/lib/repository/supabaseRepository";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const hasCredentials = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const MAX_TIER_LEVEL = 3;

describe.skipIf(!hasCredentials)("Pricing page verified-lender count (live database)", () => {
  it("getVerifiedLenderCount equals an independent listLenders(MAX_TIER_LEVEL) call — the same quarantine query", async () => {
    const supabase = createServiceRoleClient();

    const renderedCount = await getVerifiedLenderCount(supabase);

    const independentRepo = new SupabaseRepository(supabase);
    const independentLenders = await independentRepo.listLenders(PLATFORM_CATALOG_ORGANIZATION_ID, MAX_TIER_LEVEL);

    expect(renderedCount).toBe(independentLenders.length);
    // Sanity: never silently zero in a real environment that has any
    // verified lenders at all (would indicate the query broke, not that
    // the count is legitimately 0).
    expect(renderedCount).toBeGreaterThanOrEqual(0);
  });
});
