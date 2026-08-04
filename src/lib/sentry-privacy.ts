import type { Event as SentryEvent } from "@sentry/nextjs";
import { z, type ZodTypeAny } from "zod";
import { scenarioInputSchema } from "@/domain/validation/scenarioSchema";

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

/** Unwraps a Zod schema down to the object/union it actually validates —
 * strips ZodOptional/ZodNullable/ZodDefault/ZodEffects (from .refine or
 * .superRefine, e.g. scenarioInputSchema itself)/ZodArray wrappers so field
 * names buried under `.optional()`, `.superRefine(...)`, or `z.array(...)`
 * are still reachable. */
function unwrapSchema(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrapSchema(schema.unwrap());
  if (schema instanceof z.ZodEffects) return unwrapSchema(schema.innerType());
  if (schema instanceof z.ZodDefault) {
    return unwrapSchema((schema as unknown as { _def: { innerType: ZodTypeAny } })._def.innerType);
  }
  if (schema instanceof z.ZodArray) return unwrapSchema(schema.element);
  return schema;
}

/** Recursively collects every field name reachable from a Zod schema —
 * every top-level key plus every nested object's keys (bankStatement,
 * dscr, pnl, assetDepletion, foreignNational, creditEvents, etc.) and every
 * branch of a union. `seen` guards against infinite recursion on any
 * self-referential schema. */
function collectSchemaKeys(schema: ZodTypeAny, seen: Set<ZodTypeAny> = new Set()): Set<string> {
  const keys = new Set<string>();
  const unwrapped = unwrapSchema(schema);
  if (seen.has(unwrapped)) return keys;
  seen.add(unwrapped);

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape as Record<string, ZodTypeAny>;
    for (const [key, value] of Object.entries(shape)) {
      keys.add(key);
      for (const nested of collectSchemaKeys(value, seen)) keys.add(nested);
    }
  } else if (unwrapped instanceof z.ZodUnion) {
    for (const option of unwrapped.options as ZodTypeAny[]) {
      for (const nested of collectSchemaKeys(option, seen)) keys.add(nested);
    }
  }
  return keys;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every field name in the borrower scenario/vitals schema (top-level and
 * every nested sub-schema — bankStatement, pnl, dscr, assetDepletion,
 * foreignNational, creditEvents) — computed once at module load from the
 * SAME schema the app validates real intake against
 * (src/domain/validation/scenarioSchema.ts), not hand-copied. A future
 * field added to that schema is automatically covered here the next time
 * this module loads, by construction — no second list to remember to
 * update. */
const SCENARIO_SCHEMA_KEYS = [...collectSchemaKeys(scenarioInputSchema)];

// Generic security/PII terms that are NOT scenario-schema fields (request
// plumbing like cookies/tokens/sessions, and a few defensive fragments that
// stay even though no single schema key matches them exactly, since they
// show up as substrings of many real variable names across the codebase) —
// unioned with the schema-derived keys above, never a replacement for them.
const STATIC_DENY_TERMS = [
  "email", "ssn", "password", "passwd", "secret", "token", "cookie",
  "authorization", "session", "dob", "birth", "phone", "borrower",
  "vitals", "scenario", "payload", "address", "asset", "reserves",
];

// Matches on KEY NAME (case-insensitive), not value shape, so it catches
// scenario-payload fields (fico, citizenship, requestedLoanAmount, ssn,
// borrowerReference, ...) wherever they show up in extra/context/breadcrumb
// data, not just in a known fixed shape.
const DENY_KEY_PATTERN = new RegExp(
  [...STATIC_DENY_TERMS, ...SCENARIO_SCHEMA_KEYS].map(escapeRegExp).join("|"),
  "i"
);

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
