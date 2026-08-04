// Client-side (browser) Sentry init — Next.js auto-loads this file. Skips
// cleanly (no-op) when no DSN is set, so local dev and any environment
// without the owner's DSN never even attempts a network call.
// NEXT_PUBLIC_SENTRY_DSN is not a second secret to configure — next.config.mjs
// derives it automatically from the single SENTRY_DSN env var the owner
// sets, exposing it under the NEXT_PUBLIC_ name Next.js requires for browser
// code (a DSN is not a secret — it can only submit events, never read data
// back).
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-privacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // PRIVACY GUARD (compliance requirement, not a preference) — see
    // src/lib/sentry-privacy.ts for the full policy this pairs with.
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
