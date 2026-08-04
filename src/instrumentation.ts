// Next.js instrumentation hook — runs once per server process before
// anything else. Loads the runtime-appropriate Sentry config (Node vs Edge)
// and, in `onRequestError`, forwards server-side errors (route handlers,
// server components, server actions) into Sentry via the same scrubbed
// pipeline. Client-side errors are handled separately by
// src/instrumentation-client.ts.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
