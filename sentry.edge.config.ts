// Edge runtime Sentry init (middleware, edge API routes) — imported by
// src/instrumentation.ts when NEXT_RUNTIME === "edge". Skips cleanly (no-op)
// when SENTRY_DSN isn't set.
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-privacy";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // PRIVACY GUARD (compliance requirement, not a preference) — see
    // src/lib/sentry-privacy.ts for the full policy.
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}
