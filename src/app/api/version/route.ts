export const dynamic = "force-dynamic";

/**
 * Reports the CURRENTLY RUNNING deploy's build id, read from the server at
 * request time (never cached — Vercel's env vars for a live function always
 * reflect that function's own deploy). Polled client-side by
 * build-version-guard.tsx to detect when an already-open session (e.g. an
 * installed PWA that's been left running) is behind the live deploy.
 */
export async function GET() {
  return Response.json({ sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
}
