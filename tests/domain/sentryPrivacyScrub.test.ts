// Pins the Sentry privacy scrubber's coverage-by-construction guarantee:
// the denylist is derived from scenarioInputSchema's actual keys at module
// load, not a hand-maintained list — so every current schema field (and,
// by construction, any future one) is auto-redacted, without anyone having
// to remember to update a second list.
import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "@/lib/sentry-privacy";
import { scenarioInputSchema } from "@/domain/validation/scenarioSchema";
import type { Event as SentryEvent } from "@sentry/nextjs";

// A representative sample of real scenarioInputSchema fields (top-level and
// a NESTED-ONLY sub-schema field name — monthlyLease only exists inside
// dscrSchema, never at the top level) that must never survive a scrub —
// nested under a harmless container key so this fails if nested-schema key
// collection ever regresses (the top-level "dscr" key itself also matches
// and would redact the whole branch in one shot, which would hide that
// regression).
const SAMPLE_SCENARIO_FIELDS: Record<string, unknown> = {
  fico: 720,
  citizenship: "us_citizen",
  requestedLoanAmount: 450000,
  borrowerReference: "REF-1234",
  notes: "borrower prefers email contact",
  customData: { monthlyLease: 2500, marketRent: 2600 },
};

describe("Sentry privacy scrub — schema-derived denylist", () => {
  it("redacts every sampled scenario-schema field, top-level and a nested-only field name", () => {
    const event: SentryEvent = { extra: { ...SAMPLE_SCENARIO_FIELDS } };
    const scrubbed = scrubSentryEvent(event);
    const extra = scrubbed.extra as Record<string, unknown>;

    expect(extra.fico).toBe("[Redacted]");
    expect(extra.citizenship).toBe("[Redacted]");
    expect(extra.requestedLoanAmount).toBe("[Redacted]");
    expect(extra.borrowerReference).toBe("[Redacted]");
    expect(extra.notes).toBe("[Redacted]");

    // "customData" itself isn't a sensitive key name, so the scrubber
    // recurses into it — and "monthlyLease" (a dscrSchema-only field,
    // never a top-level scenarioInputSchema key) must still be caught by
    // the recursive schema-key collector.
    const customData = extra.customData as Record<string, unknown>;
    expect(customData.monthlyLease).toBe("[Redacted]");
    expect(customData.marketRent).toBe("[Redacted]");
  });

  it("redacts an entire nested sub-object in one shot when its OWN key is sensitive (e.g. dscr)", () => {
    const event: SentryEvent = { extra: { dscr: { monthlyLease: 2500 } } };
    const scrubbed = scrubSentryEvent(event);
    const extra = scrubbed.extra as Record<string, unknown>;
    expect(extra.dscr).toBe("[Redacted]");
  });

  it("never redacts a harmless, non-schema, non-PII key", () => {
    const event: SentryEvent = { extra: { route: "/scenarios/new", statusCode: 500 } };
    const scrubbed = scrubSentryEvent(event);
    const extra = scrubbed.extra as Record<string, unknown>;
    expect(extra.route).toBe("/scenarios/new");
    expect(extra.statusCode).toBe(500);
  });

  it("every top-level scenarioInputSchema key is present in the live schema (sanity check the sample above stays real)", () => {
    const shape = (scenarioInputSchema as unknown as { _def: { schema: { shape: Record<string, unknown> } } })._def
      .schema.shape;
    for (const key of ["fico", "citizenship", "requestedLoanAmount", "borrowerReference", "notes", "dscr"]) {
      expect(Object.keys(shape)).toContain(key);
    }
  });
});
