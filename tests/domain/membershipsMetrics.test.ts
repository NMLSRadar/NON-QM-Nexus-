// Unit tests for src/domain/memberships/metrics.ts — pure functions against
// hand-computed fixtures, including division-by-zero at month zero and the
// voluntary-vs-involuntary separation. No database required.
import { describe, expect, it } from "vitest";
import {
  monthlyChurnSplit,
  logoChurnRate,
  revenueChurnRate,
  netRevenueRetention,
  retentionRate,
  trialConversionRate,
  medianDaysToConversion,
  averageLifetimeMonths,
  ltv,
  perRepMetrics,
  overviewSummary,
  monthKey,
  type MembershipRow,
  type TrialRow,
} from "@/domain/memberships/metrics";

const mm = (status: "churned" | "active" | "trialing" | "cancelled_pending" | "past_due" | "trial_expired" | "cancelled", opts: Partial<MembershipRow> = {}): MembershipRow => ({
  organizationId: opts.organizationId ?? "o1",
  status,
  planTier: "monthly",
  mrrCents: opts.mrrCents ?? 100_00,
  trialStartedAt: opts.trialStartedAt ?? null,
  convertedAt: opts.convertedAt ?? null,
  churnedAt: opts.churnedAt ?? null,
  churnType: opts.churnType ?? null,
  churnReason: opts.churnReason ?? null,
  reactivationCount: opts.reactivationCount ?? 0,
  attributionRepUserId: opts.attributionRepUserId ?? null,
});

describe("logo churn", () => {
  it("divides churned-in-month by active-at-month-start", () => {
    const rows = [
      mm("churned", { trialStartedAt: "2026-01-10T00:00:00Z", churnedAt: "2026-03-15T00:00:00Z" }),
      mm("active", { convertedAt: "2026-02-01T00:00:00Z" }),
      mm("active", { convertedAt: "2026-01-05T00:00:00Z" }),
      mm("active", { convertedAt: "2026-01-05T00:00:00Z" }),
    ];
    const r = logoChurnRate(rows, "2026-03");
    // activeAtStart: all 4 converted before Mar 1, churned in March: 1
    expect({ rate: r.rate, churned: r.churned, activeAtStart: r.activeAtStart }).toEqual({ rate: 1 / 4, churned: 1, activeAtStart: 4 });
  });

  it("excludes trials: trial_expired is a conversion failure, not churn", () => {
    const rows = [
      mm("trial_expired", { trialStartedAt: "2026-01-10T00:00:00Z", churnedAt: "2026-03-01T00:00:00Z" }),
      mm("churned", { convertedAt: "2026-01-05T00:00:00Z", churnedAt: "2026-03-02T00:00:00Z" }),
    ];
    const r = logoChurnRate(rows, "2026-03");
    expect(r.churned).toBe(1); // trial_expired not counted
  });

  it("division by zero at month zero returns rate 0, not NaN", () => {
    const r = logoChurnRate([], "2026-01");
    expect(r.rate).toBe(0);
    expect(r.activeAtStart).toBe(0);
  });
});

describe("voluntary vs involuntary churn split", () => {
  it("separates by churnType from a mixed event stream", () => {
    const rows = [
      mm("churned", { convertedAt: "2026-01-05T00:00:00Z", churnedAt: "2026-03-02T00:00:00Z", churnType: "voluntary" }),
      mm("churned", { convertedAt: "2026-01-10T00:00:00Z", churnedAt: "2026-03-10T00:00:00Z", churnType: "involuntary" }),
      mm("churned", { convertedAt: "2026-01-15T00:00:00Z", churnedAt: "2026-03-20T00:00:00Z", churnType: "involuntary" }),
      mm("active", { convertedAt: "2026-01-01T00:00:00Z" }),
      mm("active", { convertedAt: "2026-01-02T00:00:00Z" }),
    ];
    const s = monthlyChurnSplit(rows, "2026-03");
    expect(s).toEqual({ voluntary: 1, involuntary: 2 });
  });
});

describe("revenue churn", () => {
  it("uses MRR (cents) lost ÷ MRR at start", () => {
    const rows = [
      mm("active", { convertedAt: "2026-01-05T00:00:00Z", mrrCents: 150_00 }),
      mm("churned", { convertedAt: "2026-01-06T00:00:00Z", churnedAt: "2026-03-15T00:00:00Z", mrrCents: 150_00 }),
    ];
    const r = revenueChurnRate(rows, "2026-03");
    expect(r.mrrAtStart).toBe(300_00);
    expect(r.mrrLost).toBe(150_00);
    expect(r.rate).toBe(0.5);
  });

  it("excludes trials from revenue base", () => {
    const rows = [
      mm("trial_expired", { trialStartedAt: "2026-01-10T00:00:00Z", convertedAt: null, mrrCents: 0 }),
      mm("active", { convertedAt: "2026-01-05T00:00:00Z", mrrCents: 150_00 }),
    ];
    const r = revenueChurnRate(rows, "2026-03");
    expect(r.mrrAtStart).toBe(150_00);
  });
});

describe("net revenue retention", () => {
  it("computes expansion-adjusted retention", () => {
    expect(netRevenueRetention({ startingMrr: 1000, expansion: 200, contraction: 50, churned: 100 })).toBe(1.05);
  });

  it("returns null at zero starting MRR", () => {
    expect(netRevenueRetention({ startingMrr: 0, expansion: 0, contraction: 0, churned: 0 })).toBeNull();
  });
});

describe("retention rate", () => {
  it("is 1 − logo churn", () => {
    expect(retentionRate({ rate: 0.25 })).toBe(0.75);
  });
});

describe("trial conversion", () => {
  const trials: TrialRow[] = [
    { organizationId: "a", startedAt: "2026-01-05T00:00:00Z", convertedAt: "2026-01-20T00:00:00Z" },
    { organizationId: "b", startedAt: "2026-01-10T00:00:00Z", convertedAt: null },
    { organizationId: "c", startedAt: "2026-01-15T00:00:00Z", convertedAt: "2026-02-01T00:00:00Z" },
    { organizationId: "d", startedAt: "2026-02-01T00:00:00Z", convertedAt: null }, // next cohort
  ];
  it("cohorts by trial start month and converts correctly", () => {
    const r = trialConversionRate(trials, "2026-01");
    expect(r.started).toBe(3);
    expect(r.converted).toBe(2);
    expect(r.rate).toBeCloseTo(2 / 3);
  });

  it("zero cohort yields zero rate", () => {
    expect(trialConversionRate(trials, "2026-05").rate).toBe(0);
  });

  it("median time to conversion is a median, tolerant of outliers", () => {
    // conversions: a=15d, c=17d; plus an outlier 500d
    const withOutlier: TrialRow[] = [
      ...trials,
      { organizationId: "e", startedAt: "2026-01-01T00:00:00Z", convertedAt: "2027-05-15T00:00:00Z" },
    ];
    const med = medianDaysToConversion(withOutlier);
    expect(med).not.toBeNull();
    const finiteDays = [15, 17, 500].slice(); // sorted: 15,17,500 -> median 17
    expect(med).toBe(17);
    void finiteDays;
  });

  it("median is null with no conversions", () => {
    expect(medianDaysToConversion([{ organizationId: "x", startedAt: "2026-01-01T00:00:00Z", convertedAt: null }])).toBeNull();
  });
});

describe("lifetime & LTV", () => {
  it("marks low confidence (null) until at least 3 complete lifecycles", () => {
    const few = [mm("churned", { convertedAt: "2026-01-01T00:00:00Z", churnedAt: "2026-02-01T00:00:00Z", mrrCents: 120_00 })];
    expect(averageLifetimeMonths(few, new Date("2026-05-01T00:00:00Z"))).toBeNull();
    expect(ltv(few, new Date("2026-05-01T00:00:00Z")).ltvCents).toBeNull();
  });

  it("computes avg lifetime + LTV with enough complete lifecycles", () => {
    const rows = [
      mm("churned", { convertedAt: "2026-01-01T00:00:00Z", churnedAt: "2026-04-01T00:00:00Z", mrrCents: 120_00 }),
      mm("churned", { convertedAt: "2026-01-01T00:00:00Z", churnedAt: "2026-04-01T00:00:00Z", mrrCents: 120_00 }),
      mm("churned", { convertedAt: "2026-01-01T00:00:00Z", churnedAt: "2026-04-01T00:00:00Z", mrrCents: 120_00 }),
    ];
    // lifetime ≈ 3 months each (Jan 1 → Apr 1)
    const life = averageLifetimeMonths(rows, new Date("2026-05-01T00:00:00Z"));
    expect(life).not.toBeNull();
    expect(life!).toBeGreaterThan(2.9);
    expect(life!).toBeLessThan(3.1);
    const v = ltv(rows, new Date("2026-05-01T00:00:00Z"));
    expect(v.avgMrrCents).toBe(120_00);
    expect(v.ltvCents).toBe(Math.round(120_00 * (life!)));
  });
});

describe("per-rep metrics", () => {
  it("separates books, keeps unattributed as a first-class row", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    const rows = [
      mm("active", { organizationId: "a", convertedAt: "2026-01-01T00:00:00Z", mrrCents: 150_00, attributionRepUserId: "rep1" }),
      mm("churned", { organizationId: "b", convertedAt: "2026-01-02T00:00:00Z", churnedAt: "2026-03-01T00:00:00Z", mrrCents: 150_00, attributionRepUserId: "rep1" }),
      mm("active", { organizationId: "c", convertedAt: "2026-01-03T00:00:00Z", mrrCents: 200_00, attributionRepUserId: null }), // unattributed
    ];
    const rep1 = perRepMetrics(rows, "rep1", now);
    expect(rep1.signups).toBe(2);
    expect(rep1.activeNow).toBe(1);
    expect(rep1.churned).toBe(1);
    expect(rep1.mrrCents).toBe(150_00);
    expect(rep1.retentionRate).toBe(0.5);

    const unattributed = perRepMetrics(rows, null, now);
    expect(unattributed.signups).toBe(1);
    expect(unattributed.mrrCents).toBe(200_00);
  });
});

describe("overview summary", () => {
  it("rolls up the top-strip numbers", () => {
    const now = new Date("2026-03-20T00:00:00Z");
    const rows = [
      mm("active", { convertedAt: "2026-01-01T00:00:00Z", mrrCents: 150_00 }),
      mm("cancelled_pending", { convertedAt: "2026-01-01T00:00:00Z", mrrCents: 150_00 }),
      mm("past_due", { convertedAt: "2026-01-01T00:00:00Z", mrrCents: 150_00 }),
      mm("trialing", { trialStartedAt: "2026-03-01T00:00:00Z" }),
      mm("churned", { convertedAt: "2026-01-01T00:00:00Z", churnedAt: "2026-03-05T00:00:00Z" }),
      mm("active", { convertedAt: "2026-01-01T00:00:00Z", mrrCents: 150_00 }), // stays
    ];
    const s = overviewSummary(rows, now);
    expect(s.active).toBe(4);
    expect(s.mrrCents).toBe(600_00);
    expect(s.trialsInFlight).toBe(1);
    expect(s.churnedThisMonth).toBe(1);
    expect(s.retainedRate).toBeCloseTo(0.8); // 5 active at start, 1 churned
    expect(s.retainedDenominator).toBe(5);
  });
});

describe("monthKey", () => {
  it("formats YYYY-MM", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthKey(new Date(2026, 11, 1))).toBe("2026-12");
  });
});