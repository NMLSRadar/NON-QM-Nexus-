// NOTE: deliberately no "server-only" import guard here — same reasoning as
// src/lib/repository/serviceRoleClient.ts: this must remain importable from
// plain Node test processes (tests/integration/*.test.ts run outside any
// Next.js bundler, where "server-only" throws). It is only ever called from
// server actions and route handlers, never a Client Component.
import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Shared Stripe client, lazily constructed so a missing key fails at the
 * call site (with a clear error) rather than at module load / build time. */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _stripe = new Stripe(key);
  return _stripe;
}
