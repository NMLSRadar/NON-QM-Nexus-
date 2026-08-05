import { describe, expect, it } from "vitest";

// Every public page (per robots.ts's allow list, minus none) must export its
// OWN non-default Metadata — a unique title/description, not just whatever
// the root layout happens to set. Imports each page module directly and
// inspects its `metadata` export; this catches a page silently losing its
// override (e.g. an accidental delete during a refactor) without needing a
// full server render.
const PUBLIC_PAGES: Array<{ label: string; importFn: () => Promise<{ metadata?: unknown }> }> = [
  { label: "/", importFn: () => import("@/app/page") },
  { label: "/pricing", importFn: () => import("@/app/pricing/page") },
  { label: "/document-checklists", importFn: () => import("@/app/document-checklists/page") },
  { label: "/terms", importFn: () => import("@/app/terms/page") },
  { label: "/privacy", importFn: () => import("@/app/privacy/page") },
  { label: "/login", importFn: () => import("@/app/login/page") },
  { label: "/signup", importFn: () => import("@/app/signup/page") },
];

describe("public page metadata", () => {
  for (const { label, importFn } of PUBLIC_PAGES) {
    it(`${label} exports a unique, non-default title and a description within length limits`, async () => {
      const mod = await importFn();
      const metadata = mod.metadata as { title?: string; description?: string } | undefined;
      expect(metadata, `${label} has no metadata export`).toBeTruthy();
      expect(typeof metadata!.title).toBe("string");
      expect((metadata!.title as string).length).toBeGreaterThan(0);
      expect((metadata!.title as string).length).toBeLessThanOrEqual(60);
      // Not the bare site-wide default title — every public page's own copy.
      expect(metadata!.title).not.toBe("NON-QM Nexus");

      expect(typeof metadata!.description).toBe("string");
      expect((metadata!.description as string).length).toBeGreaterThan(0);
      expect((metadata!.description as string).length).toBeLessThanOrEqual(155);
    });
  }

  it("auth pages (login/signup) are marked noindex", async () => {
    const [login, signup] = await Promise.all([import("@/app/login/page"), import("@/app/signup/page")]);
    for (const mod of [login, signup]) {
      const metadata = mod.metadata as { robots?: { index?: boolean } };
      expect(metadata.robots?.index).toBe(false);
    }
  });

  it("titles are unique across every public page", async () => {
    const titles = await Promise.all(
      PUBLIC_PAGES.map(async ({ importFn }) => {
        const mod = await importFn();
        return (mod.metadata as { title?: string }).title;
      })
    );
    expect(new Set(titles).size).toBe(titles.length);
  });
});
