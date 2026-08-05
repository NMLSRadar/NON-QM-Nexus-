import { describe, expect, it, afterEach, vi } from "vitest";

describe("SUPPORT_EMAIL", () => {
  const original = process.env.SUPPORT_EMAIL;

  afterEach(() => {
    if (original === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = original;
    vi.resetModules();
  });

  it("falls back to the legal inbox when SUPPORT_EMAIL is unset", async () => {
    delete process.env.SUPPORT_EMAIL;
    vi.resetModules();
    const { SUPPORT_EMAIL } = await import("@/lib/support");
    expect(SUPPORT_EMAIL).toBe("legal@nonqmnexus.com");
  });

  it("uses SUPPORT_EMAIL when set", async () => {
    process.env.SUPPORT_EMAIL = "support@nonqmnexus.com";
    vi.resetModules();
    const { SUPPORT_EMAIL } = await import("@/lib/support");
    expect(SUPPORT_EMAIL).toBe("support@nonqmnexus.com");
  });
});
