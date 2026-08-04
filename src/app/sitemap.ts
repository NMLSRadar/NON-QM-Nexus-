import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// The public pages from robots.ts, minus /login and /signup — those are
// reachable and allowed for crawling (a search result linking straight to
// sign-in/sign-up is fine) but aren't submitted as canonical sitemap
// entries since they carry no unique content of their own and are marked
// noindex in their own page metadata.
const PUBLIC_PATHS = ["/", "/pricing", "/document-checklists", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
  }));
}
