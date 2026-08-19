import { describe, expect, it } from "vitest";
import { LEGACY_PLAN, PLANS, effectiveMonthlyCents, termTotalCents } from "@/config/pricing";
import { formatCents, parseDollarStringToCents } from "@/lib/billing/money";
import { buildCommitmentPhases } from "@/lib/billing/commitment";
import { evaluateAccess, evaluateCancellation } from "@/lib/billing/entitlements";

describe("Pricing v2", () => {
  it("parses and formats integer cents without floating-point arithmetic", () => {
    expect(parseDollarStringToCents("$59.99")).toBe(5999);
    expect(parseDollarStringToCents("50")).toBe(5000);
    expect(formatCents(5999)).toBe("$59.99");
    expect(() => parseDollarStringToCents("59.999")).toThrow();
  });

  it("charges four monthly $50 payments and totals $200", () => {
    expect(termTotalCents(PLANS.commit_4mo)).toBe(20000);
    expect(effectiveMonthlyCents(PLANS.commit_4mo)).toBe(5000);
    expect(buildCommitmentPhases(1, "price_50", "price_5999")[0]).toMatchObject({
      duration: { interval: "month", interval_count: 4 },
    });
  });

  it("never makes the commitment effective monthly rate exceed monthly", () => {
    expect(effectiveMonthlyCents(PLANS.commit_4mo)).toBeLessThanOrEqual(PLANS.monthly.amountCents);
  });

  it("keeps the legacy membership at $120", () => {
    expect(LEGACY_PLAN.amountCents).toBe(12000);
  });

  it("keeps past-due access through the retry window", () => {
    const result = evaluateAccess({ status: "past_due", currentPeriodEnd: null, retryWindowEnd: new Date("2030-02-01"), now: new Date("2030-01-01") });
    expect(result.allowed).toBe(true);
    expect(result.banner).toContain("February 1, 2030");
  });

  it("schedules v2 cancellation at commitment end", () => {
    const end = new Date("2030-05-01");
    expect(evaluateCancellation({ commitmentEndAt: end, now: new Date("2030-02-01") })).toEqual({ mode: "commitment_end", effectiveAt: end });
  });
});
