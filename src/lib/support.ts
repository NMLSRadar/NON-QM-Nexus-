// Single source of truth for the support contact address shown across the
// app (footer, /terms, /privacy). Falls back to the existing legal inbox so
// nothing breaks before the owner sets SUPPORT_EMAIL — same
// "skip/fall back cleanly when unset" convention used elsewhere (Sentry,
// email Reply-To).
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "legal@nonqmnexus.com";
