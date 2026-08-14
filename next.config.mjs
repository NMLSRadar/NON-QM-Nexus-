/** @type {import('next').NextConfig} */
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The /tutorial page compiles its MDX sections from content/tutorial/ at
  // runtime (server-side, force-dynamic like every page here). Without this
  // include, Next.js output-file-tracing would strip the content folder from
  // the /tutorial serverless function and the page would 500 in production.
  outputFileTracingIncludes: {
    "/tutorial": ["./content/tutorial/**/*"],
  },
  // Baked into the client bundle at build time — compared at runtime by
  // src/components/build-version-guard.tsx against the currently-deployed
  // server's own build id (via /api/version) so an already-open installed
  // PWA session self-heals onto the latest deploy instead of silently
  // running stale JS indefinitely (see that file's comment for the history
  // of real bugs this caused before this guard existed).
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()),
    // Single source of truth for the Sentry DSN: the owner sets ONE env var
    // (SENTRY_DSN, server-side only in the Vercel dashboard) and this makes
    // it available to the client bundle too under the NEXT_PUBLIC_ name
    // Next.js requires for browser code. A DSN is not a secret (it can only
    // submit events, never read data back), so this is safe to bake in.
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN || "",
  },
  // The deterministic domain layer is framework-agnostic and lives under src/domain.
  // Keep server-only secrets out of the client bundle by never importing them into
  // "use client" components.
  experimental: {
    serverActions: {
      // The lender-guideline-PDF upload Server Action
      // (src/app/admin/documents/upload-actions.ts) explicitly accepts files up
      // to 20MB, but Next.js's own default Server Action body limit is 1MB —
      // any upload anywhere near or above that silently failed with a generic
      // network-level "Failed to fetch" (no clean error surfaced to the admin),
      // which is exactly the crash found live-testing this feature after fixing
      // the OpenAI billing quota. 25mb leaves headroom for multipart overhead
      // above the app's own 20MB file-size check.
      bodySizeLimit: "25mb",
    },
  },
};

// Runtime event capture is initialized independently in src/instrumentation.ts.
// The webpack integration is only useful when all upload credentials exist;
// without them it performs an expensive no-op source-map pass that can exhaust
// the 1 GB build heap used by local/CI containers.
const sentryBuildEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT,
);

const sentryBuildOptions = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  widenClientFileUpload: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

export default sentryBuildEnabled
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
