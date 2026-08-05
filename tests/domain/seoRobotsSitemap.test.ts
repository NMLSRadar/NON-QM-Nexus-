import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/seo";

describe("robots.ts", () => {
  const result = robots();
  const rule = (Array.isArray(result.rules) ? result.rules[0] : result.rules)!;

  it("allows every public marketing/legal page", () => {
    const allow = rule.allow as string[];
    for (const path of ["/", "/pricing", "/document-checklists", "/terms", "/privacy", "/login", "/signup"]) {
      expect(allow).toContain(path);
    }
  });

  it("disallows every authenticated/internal app route", () => {
    const disallow = rule.disallow as string[];
    for (const path of ["/scenarios", "/account", "/admin", "/api", "/ae", "/trial"]) {
      expect(disallow).toContain(path);
    }
  });

  it("references the sitemap", () => {
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("sitemap.ts", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("includes every public page (minus login/signup)", () => {
    for (const path of ["/", "/pricing", "/document-checklists", "/terms", "/privacy"]) {
      expect(urls).toContain(`${SITE_URL}${path}`);
    }
  });

  it("excludes auth pages", () => {
    expect(urls).not.toContain(`${SITE_URL}/login`);
    expect(urls).not.toContain(`${SITE_URL}/signup`);
  });

  it("excludes authenticated/internal app routes", () => {
    for (const path of ["/scenarios", "/account", "/admin", "/api", "/ae", "/trial"]) {
      expect(urls.some((u) => u.includes(path))).toBe(false);
    }
  });

  it("never sets lastModified (force-dynamic pages have no reliable content-change date — an always-now value trains Google to ignore it)", () => {
    for (const entry of entries) {
      expect(entry.lastModified).toBeUndefined();
    }
  });
});
