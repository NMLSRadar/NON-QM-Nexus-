import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Public, crawlable marketing/legal surface only; every authenticated app
// route (scenarios, account, admin, ae) and internal API surface stays
// disallowed — none of that is meant to be indexed or is useful to a
// crawler, and some of it (scenarios, account) is borrower-adjacent data
// that should never show up in search results even accidentally.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/document-checklists", "/terms", "/privacy", "/login", "/signup"],
      disallow: ["/scenarios", "/account", "/admin", "/api", "/ae", "/trial"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
