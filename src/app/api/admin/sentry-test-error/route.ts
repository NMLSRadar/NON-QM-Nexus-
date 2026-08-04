// Permanent "is Sentry alive" probe (launch-hardening spec, Sentry section).
// Admin-only, throws a deliberate test error so end-to-end delivery can be
// verified once SENTRY_DSN is set — do NOT remove this after verifying once;
// it stays as a standing health check the owner (or support) can hit any
// time to confirm errors are still reaching Sentry after a deploy.
import { requirePlatformAdmin } from "@/lib/admin";

export async function GET() {
  await requirePlatformAdmin();
  throw new Error("NON-QM Nexus Sentry delivery probe — deliberate test error, safe to ignore.");
}
