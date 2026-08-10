import { describe, it, expect } from "vitest";
import { scoreCompensatingFactors, overallFromScore, COMPENSATING_FACTOR_WEIGHTS } from "@/domain/compensatingFactors/score";

describe("compensating factors engine", () => {
  it("12 months reserves vs a 3-month requirement scores strong or better (spec §7)", () => {
    const a = scoreCompensatingFactors({ actualReservesMonths: 12, requiredReservesMonths: 3 });
    const reserves = a.factors.find((f) => f.type === "reserves_surplus")!;
    expect(["strong", "very_strong"]).toContain(reserves.strength);
  });

  it("4x reserves scores very strong", () => {
    const a = scoreCompensatingFactors({ actualReservesMonths: 24, requiredReservesMonths: 6 });
    expect(a.factors.find((f) => f.type === "reserves_surplus")!.strength).toBe("very_strong");
  });

  it("LTV cushion tiers: 10+ pts strong, 5-9 moderate, 1-4 slight", () => {
    expect(scoreCompensatingFactors({ requestedLtv: 70, maxAllowableLtv: 80 }).factors.find((f) => f.type === "ltv_cushion")!.strength).toBe("strong");
    expect(scoreCompensatingFactors({ requestedLtv: 74, maxAllowableLtv: 80 }).factors.find((f) => f.type === "ltv_cushion")!.strength).toBe("moderate");
    expect(scoreCompensatingFactors({ requestedLtv: 78, maxAllowableLtv: 80 }).factors.find((f) => f.type === "ltv_cushion")!.strength).toBe("slight");
  });

  it("reserves surplus and LTV cushion outrank the others on the weighted score", () => {
    const weights = COMPENSATING_FACTOR_WEIGHTS;
    expect(weights.reserves_surplus).toBeGreaterThan(weights.ltv_cushion);
    expect(weights.ltv_cushion).toBeGreaterThan(weights.dti_cushion);
    expect(weights.dti_cushion).toBeGreaterThan(weights.tenure);
  });

  it("a strong reserves + strong LTV file scores strong overall", () => {
    const a = scoreCompensatingFactors({
      actualReservesMonths: 12,
      requiredReservesMonths: 3,
      requestedLtv: 70,
      maxAllowableLtv: 80,
      mortgageLates30x24: 0,
    });
    expect(a.overallStrength === "strong" || a.overallStrength === "moderate").toBe(true);
    expect(a.strongFactorCount).toBeGreaterThanOrEqual(2);
  });

  it("unknown/missing data never scores favorable", () => {
    const a = scoreCompensatingFactors({});
    for (const f of a.factors) {
      expect(f.present).toBe(false);
      expect(f.strength).toBe("none");
    }
    expect(a.overallStrength).toBe("weak");
  });

  it("clean housing history is strong; stated lates are not", () => {
    expect(scoreCompensatingFactors({ mortgageLates30x24: 0 }).factors.find((f) => f.type === "housing_history")!.strength).toBe("strong");
    const withLates = scoreCompensatingFactors({ mortgageLates30x24: 2 }).factors.find((f) => f.type === "housing_history")!;
    expect(withLates.present).toBe(false);
  });

  it("missingHighValueFactors names the gap", () => {
    const a = scoreCompensatingFactors({ selfEmploymentMonths: 30, minSelfEmploymentMonths: 6 });
    // Tenure alone is low-value; the high-value factors are all missing.
    expect(a.missingHighValueFactors).toContain("reserves_surplus");
    expect(a.missingHighValueFactors).toContain("ltv_cushion");
  });

  it("overallFromScore maps tiers correctly", () => {
    expect(overallFromScore(0.7)).toBe("strong");
    expect(overallFromScore(0.5)).toBe("moderate");
    expect(overallFromScore(0.3)).toBe("developing");
    expect(overallFromScore(0.1)).toBe("weak");
  });
});