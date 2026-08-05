import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// The public pages from robots.ts, minus /login and /signup — those are
// reachable and allowed for crawling (a search result linking straight to
// sign-in/sign-up is fine) but aren't submitted as canonical sitemap
// entries since they carry no unique content of their own and are marked
// noindex in their own page metadata.
//
// Deliberately NO `lastModified` field: this page is `force-dynamic`, so a
// value computed at request time (`new Date()`) would be "now" on every
// single crawl — an always-current date that never actually reflects when
// the page's content last changed. Google explicitly documents that it
// learns to distrust and ignore a sitemap's lastmod once it's caught being
// wrong/unreliable this way, which makes the field actively counterproductive
// rather than merely unused. Omitting it entirely (rather than a hand-typed
// fixed date that would just as quickly go stale) is the honest choice
// until there's a real per-page "content last changed" source to drive it.
const PUBLIC_PATHS = ["/", "/pricing", "/document-checklists", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
}
