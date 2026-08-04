import type { Event as SentryEvent } from "@sentry/nextjs";

/**
 * COMPLIANCE REQUIREMENT — not a stylistic preference. NON-QM Nexus intake
 * carries real borrower financial/scenario data (income, credit, loan
 * amounts, citizenship, SSNs in some document uploads, etc.). Per the spec's
 * security-readiness posture (no real borrower PII may leave this app
 * uncontrolled — see the anonymized `borrowerReference` convention used in
 * intake), an error-monitoring event must never be a side channel for any
 * of that. Every Sentry config (client/server/edge) routes its `beforeSend`
 * through this single scrubber, so there is exactly one place this policy
 * is enforced and audited, not three copies that can drift.
 *
 * What is allowed to leave the process: the exception, its stack trace, and
 * the route/transaction name — enough to debug, nothing that identifies a
 * borrower or a request's contents. `sendDefaultPii` is also explicitly set
 * to `false` in every config as an independent second guard, so the SDK
 * never auto-attaches IP address, cookies, or headers on its own before
 * this function even runs.
 */

type ScrubbableEvent = SentryEvent;

// Matches on KEY NAME (case-insensitive), not value shape, so it catches
// scenario-payload fields (income, fico, ssn, borrowerName, loanAmount, ...)
// wherever they show up in extra/context/breadcrumb data, not just in a
// known fixed shape.
const DENY_KEY_PATTERN =
  /email|ssn|password|passwd|secret|token|cookie|authorization|session|income|fico|credit|score|dob|birth|phone|ssn|borrower|vitals|scenario|payload|loanamount|propertyvalue|reserves|asset|bankstatement|address/i;

function scrubValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  const obj = value as object;
  if (seen.has(obj)) return "[Circular]";
  seen.add(obj);

  if (Array.isArray(value)) return value.map((v) => scrubValue(v, seen));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = DENY_KEY_PATTERN.test(key) ? "[Redacted]" : scrubValue(v, seen);
  }
  return out;
}

/** Strips request bodies, cookies, user emails, and scenario payload fields
 * from an outgoing Sentry event. Returns the same event object, mutated. */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  // Request bodies (`event.request.data`) and cookies (`event.request.cookies`)
  // are dropped entirely by only ever copying url/method/a redacted headers
  // set forward — never spread the original request object.
  if (event.request) {
    const { url, method, headers } = event.request;
    const safeHeaders: Record<string, string> | undefined = headers ? { ...headers } : undefined;
    if (safeHeaders) {
      delete safeHeaders.cookie;
      delete safeHeaders.Cookie;
      delete safeHeaders.authorization;
      delete safeHeaders.Authorization;
    }
    event.request = { url, method, headers: safeHeaders };
  }

  // Never forward any user identity (email in particular) to Sentry.
  if (event.user) {
    event.user = undefined;
  }

  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b: NonNullable<typeof event.breadcrumbs>[number]) => ({
      ...b,
      data: b.data ? (scrubValue(b.data) as typeof b.data) : b.data,
    }));
  }

  return event;
}
