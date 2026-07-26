/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Baked into the client bundle at build time — compared at runtime by
  // src/components/build-version-guard.tsx against the currently-deployed
  // server's own build id (via /api/version) so an already-open installed
  // PWA session self-heals onto the latest deploy instead of silently
  // running stale JS indefinitely (see that file's comment for the history
  // of real bugs this caused before this guard existed).
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()),
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

export default nextConfig;
