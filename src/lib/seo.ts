import type { Metadata } from "next";

/** Canonical production origin — same convention already used for
 * transactional-email links throughout the app (checkout-actions.ts,
 * enterprise/actions.ts, etc.): NEXT_PUBLIC_APP_URL when set, else the
 * verified production domain. Single source of truth for SEO plumbing
 * (metadataBase, canonical URLs, robots.ts, sitemap.ts, OpenGraph URLs). */
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";

export const SITE_NAME = "NON-QM Nexus";

/** Sitewide OpenGraph/social image — the app's real logo, used everywhere
 * since there's no separate marketing OG asset yet. */
export const OG_IMAGE_PATH = "/brand/non-qm-nexus-og.png";

/**
 * Builds a page's Metadata: unique title + description, canonical URL, and
 * sitewide OpenGraph (title/description/image) — one shared shape so every
 * public page stays consistent instead of hand-rolling this per file.
 * Pass `noindex: true` for auth pages (login/signup) that must never be
 * indexed even though they're reachable and linked from public pages.
 */
export function pageMetadata(opts: { title: string; description: string; path: string; noindex?: boolean }): Metadata {
  const url = `${SITE_URL}${opts.path}`;
  const imageUrl = `${SITE_URL}${OG_IMAGE_PATH}`;

  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: SITE_NAME,
      images: [{ url: imageUrl }],
      type: "website",
    },
    ...(opts.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
