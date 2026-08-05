// Server-side (Node runtime) Sentry init — imported by src/instrumentation.ts
// when NEXT_RUNTIME === "nodejs". Skips cleanly (no-op) when SENTRY_DSN isn't
// set, so local dev and any environment without the owner's DSN never even
// attempts a network call.
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-privacy";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // PRIVACY GUARD (compliance requirement, not a preference): never let
    // the SDK auto-attach IP address, cookies, or headers on its own —
    // see src/lib/sentry-privacy.ts for the full policy this pairs with.
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}
