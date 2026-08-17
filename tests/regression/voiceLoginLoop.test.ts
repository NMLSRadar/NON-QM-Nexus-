/**
 * Regression test: the /scenarios/voice infinite login redirect loop.
 *
 * History: signIn now ALWAYS lands a successful login on /scenarios/voice
 * (the product's first thing). That page's VoiceClient mounts and fires
 * getVoiceCatalog() immediately as a non-critical "live rankings while
 * speaking" background fetch. That action used to call
 * getCurrentOrganizationId(), which redirect("/login")s whenever a
 * SIGNED-IN account resolves zero active memberships. A membership-less
 * account therefore hit login -> /scenarios/voice -> redirect /login ->
 * login -> ... — an unbreakable loop that only ever manifested on the
 * Voice page, because it was the only mount-fire path that auto-invoked
 * the redirecting org resolver (fix cfcfff3; same root-cause class as
 * b2fea1b — non-critical/mount-fired paths must never redirect).
 *
 * The contract this test locks in: getVoiceCatalog must DEGRADE, never
 * bounce. If the callers swap it back to the redirecting resolver, the
 * mocked '@/lib/session' below (which only exports the try- variant) stops
 * providing getCurrentOrganizationId and this test throws instead of
 * silently passing, so the regression is caught.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Provide ONLY the non-redirecting org resolver. If the action were reverted
// to import getCurrentOrganizationId (the redirecting variant), the named
// export would be undefined here and the test would fail loudly.
vi.mock("@/lib/session", () => ({
  getRepository: vi.fn(),
  tryGetCurrentOrganizationId: vi.fn(),
}));

vi.mock("@/app/scenarios/new/actions", () => ({
  createScenario: vi.fn(),
}));

vi.mock("@/domain/voice/dialog", () => ({
  assess: vi.fn(),
  buildScenarioInput: vi.fn(),
}));

import { getVoiceCatalog } from "@/app/scenarios/voice/actions";
import { tryGetCurrentOrganizationId, getRepository } from "@/lib/session";

const asMock = <T,>(fn: T) => vi.mocked(fn);

describe("getVoiceCatalog — no login redirect loop on /scenarios/voice", () => {
  beforeEach(() => {
    asMock(tryGetCurrentOrganizationId).mockReset();
    asMock(getRepository).mockReset();
  });

  it("returns an empty catalog (never redirects) for a signed-in account with zero memberships", async () => {
    // A signed-in user whose account has no active memberships row.
    asMock(tryGetCurrentOrganizationId).mockResolvedValue(null);

    const result = await getVoiceCatalog();

    // The regression: previously this called getCurrentOrganizationId(),
    // which redirect('/login')ed here -> login <-> voice mount loop.
    expect(result).toEqual({ lenders: [], programs: [], rules: [] });
    // Must not reach the repository either — nothing valid to scope it to.
    expect(asMock(getRepository)).not.toHaveBeenCalled();
  });

  it("never hands the redirecting resolver (only the try- variant may be used)", async () => {
    asMock(tryGetCurrentOrganizationId).mockResolvedValue(null);
    await getVoiceCatalog();
    expect(asMock(tryGetCurrentOrganizationId)).toHaveBeenCalled();
  });

  it("proxies to repo.getCatalog when a valid org resolves", async () => {
    asMock(tryGetCurrentOrganizationId).mockResolvedValue("org-1");
    const repo = {
      getCatalog: vi.fn().mockResolvedValue({ lenders: [], programs: [], rules: [] }),
    };
    asMock(getRepository).mockResolvedValue(repo as never);

    const result = await getVoiceCatalog();

    expect(asMock(getRepository)).toHaveBeenCalled();
    expect(repo.getCatalog).toHaveBeenCalledWith("org-1");
    expect(result).toEqual({ lenders: [], programs: [], rules: [] });
  });
});