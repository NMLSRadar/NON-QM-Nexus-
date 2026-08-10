import { describe, expect, it } from "vitest";
import {
  FACTOR_WEIGHTS,
  scoreCompensatingFactors,
  type CompensatingScenarioFacts,
  type ProgramRequirementSnapshot,
} from "@/domain/compensatingFactors";

const program: ProgramRequirementSnapshot = {
  maxAllowableLtv: 80,
  requiredReservesMonths: 6,
  maxAllowableDti: 50,
  minFico: 660,
  requiredSeasoningMonths: 24,
  minTenureMonths: 24,
};

function get(assessment: ReturnType<typeof scoreCompensatingFactors>, type: string) {
  const f = assessment.factors.find((f) => f.type === type);
  if (!f) throw new Error(`factor ${type} missing`);
  return f;
}

describe("scoreCompensatingFactors — tier boundaries", () => {
  it("LTV cushion tiers: 1–4 slight, 5–9 moderate, 10+ strong, 0 none", () => {
    const at = (ltv: number) => get(scoreCompensatingFactors({ requestedLtv: ltv }, program), "ltv_cushion").strength;
    expect(at(80)).toBe("none");
    expect(at(79)).toBe("slight");
    expect(at(76)).toBe("slight");
    expect(at(75)).toBe("moderate");
    expect(at(71)).toBe("moderate");
    expect(at(70)).toBe("strong");
  });

  it("reserves surplus tiers: 1.5x moderate, 2x strong, 4x or 12+mo very strong", () => {
    const at = (months: number) => get(scoreCompensatingFactors({ actualReservesMonths: months }, program), "reserves_surplus").strength;
    expect(at(6)).toBe("none"); // no surplus
    expect(at(7)).toBe("slight");
    expect(at(9)).toBe("moderate"); // 1.5x
    expect(at(12)).toBe("very_strong"); // 12+ months and ≥1.5x
    expect(at(24)).toBe("very_strong"); // 4x
  });

  it("12 months reserves against a 3-month requirement scores very strong and says so prominently", () => {
    const f = get(scoreCompensatingFactors({ actualReservesMonths: 12 }, { ...program, requiredReservesMonths: 3 }), "reserves_surplus");
    expect(f.strength).toBe("very_strong");
    expect(f.explanation).toMatch(/strongest positions/i);
  });

  it("DTI cushion tiers: 3–7 moderate, 8+ strong", () => {
    const at = (dti: number) => get(scoreCompensatingFactors({ calculatedDti: dti }, program), "dti_cushion").strength;
    expect(at(50)).toBe("none");
    expect(at(49)).toBe("slight");
    expect(at(47)).toBe("moderate");
    expect(at(43)).toBe("moderate");
    expect(at(42)).toBe("strong");
  });

  it("FICO cushion tiers: 20–39 moderate, 40+ strong", () => {
    const at = (fico: number) => get(scoreCompensatingFactors({ fico }, program), "fico_cushion").strength;
    expect(at(660)).toBe("none");
    expect(at(665)).toBe("slight");
    expect(at(680)).toBe("moderate");
    expect(at(699)).toBe("moderate");
    expect(at(700)).toBe("strong");
  });

  it("housing history: 0x30x24 strong, 0x30x12 moderate, any late none", () => {
    expect(get(scoreCompensatingFactors({ mortgageLates24mo: 0 }, program), "clean_housing_history").strength).toBe("strong");
    expect(get(scoreCompensatingFactors({ mortgageLates12mo: 0 }, program), "clean_housing_history").strength).toBe("moderate");
    expect(get(scoreCompensatingFactors({ mortgageLates24mo: 1 }, program), "clean_housing_history").strength).toBe("none");
  });

  it("credit depth: all four clean = strong, one bad flag kills it", () => {
    const clean: CompensatingScenarioFacts = { noDerogatories: true, noCollections: true, seasonedTradelines: true, lowUtilization: true };
    expect(get(scoreCompensatingFactors(clean, program), "credit_depth").strength).toBe("strong");
    expect(get(scoreCompensatingFactors({ ...clean, noCollections: false }, program), "credit_depth").strength).toBe("none");
  });

  it("seasoning surplus: 12+ months beyond = strong", () => {
    expect(get(scoreCompensatingFactors({ monthsSinceCreditEvent: 36 }, program), "seasoning_surplus").strength).toBe("strong");
    expect(get(scoreCompensatingFactors({ monthsSinceCreditEvent: 30 }, program), "seasoning_surplus").strength).toBe("moderate");
    expect(get(scoreCompensatingFactors({ monthsSinceCreditEvent: 24 }, program), "seasoning_surplus").strength).toBe("none");
  });

  it("residual income uses configurable thresholds", () => {
    const facts: CompensatingScenarioFacts = { qualifyingMonthlyIncome: 12_000, totalMonthlyObligations: 6_000 };
    expect(get(scoreCompensatingFactors(facts, program), "residual_income").strength).toBe("strong"); // $6k ≥ default $5k
    expect(
      get(scoreCompensatingFactors(facts, program, { residualIncomeThresholds: { moderate: 2_000, strong: 7_000, veryStrong: 12_000 } }), "residual_income").strength
    ).toBe("moderate");
  });

  it("tenure: ≥24 months beyond minimum = moderate", () => {
    expect(get(scoreCompensatingFactors({ tenureMonths: 48 }, program), "tenure").strength).toBe("moderate");
    expect(get(scoreCompensatingFactors({ tenureMonths: 36 }, program), "tenure").strength).toBe("slight");
  });

  it("payment shock: ≤1.0x strong, ≤1.25x moderate", () => {
    const at = (proposed: number) =>
      get(scoreCompensatingFactors({ proposedHousingPayment: proposed, currentHousingPayment: 2_000 }, program), "payment_shock").strength;
    expect(at(2_000)).toBe("strong");
    expect(at(2_500)).toBe("moderate");
    expect(at(3_000)).toBe("slight");
    expect(at(3_100)).toBe("none");
  });
});

describe("scoreCompensatingFactors — unknown data never favorable", () => {
  it("an empty scenario scores nothing present and overall weak", () => {
    const a = scoreCompensatingFactors({}, program);
    expect(a.factors.every((f) => !f.present && f.strength === "none")).toBe(true);
    expect(a.overallStrength).toBe("weak");
    expect(a.strongFactorCount).toBe(0);
    for (const f of a.factors) {
      expect(f.explanation).toMatch(/isn't documented/i);
    }
  });

  it("missing program limits also score as unknown", () => {
    const a = scoreCompensatingFactors({ requestedLtv: 70, actualReservesMonths: 24 }, {});
    expect(get(a, "ltv_cushion").present).toBe(false);
    expect(get(a, "reserves_surplus").present).toBe(false);
  });

  it("missing high-value factors are reported by weight, heaviest first", () => {
    const a = scoreCompensatingFactors({ requestedLtv: 70 }, program); // strong LTV only
    expect(a.missingHighValueFactors[0]).toBe("reserves_surplus");
    expect(a.missingHighValueFactors).not.toContain("ltv_cushion");
  });
});

describe("scoreCompensatingFactors — weighting", () => {
  it("reserves surplus outweighs every other factor; LTV cushion is second", () => {
    const sorted = Object.entries(FACTOR_WEIGHTS).sort((a, b) => b[1] - a[1]);
    expect(sorted[0]![0]).toBe("reserves_surplus");
    expect(sorted[1]![0]).toBe("ltv_cushion");
  });

  it("a reserves-led strong file rolls up higher than a tenure-led one", () => {
    const reservesFile = scoreCompensatingFactors({ actualReservesMonths: 24, requestedLtv: 70 }, program);
    const tenureFile = scoreCompensatingFactors({ tenureMonths: 60, proposedHousingPayment: 1_900, currentHousingPayment: 2_000 }, program);
    const rank = { weak: 0, developing: 1, moderate: 2, strong: 3 };
    expect(rank[reservesFile.overallStrength]).toBeGreaterThan(rank[tenureFile.overallStrength]);
  });

  it("a fully documented strong file reaches overall strong", () => {
    const a = scoreCompensatingFactors(
      {
        requestedLtv: 68,
        actualReservesMonths: 18,
        calculatedDti: 38,
        fico: 720,
        mortgageLates24mo: 0,
        noDerogatories: true,
        noCollections: true,
        seasonedTradelines: true,
        lowUtilization: true,
        monthsSinceCreditEvent: 48,
        qualifyingMonthlyIncome: 15_000,
        totalMonthlyObligations: 5_000,
        tenureMonths: 60,
        proposedHousingPayment: 2_400,
        currentHousingPayment: 2_500,
      },
      program
    );
    expect(a.overallStrength).toBe("strong");
    expect(a.strongFactorCount).toBeGreaterThanOrEqual(5);
    // Reserves surfaced prominently: sorted to the top band.
    expect(a.factors[0]!.type).toBe("reserves_surplus");
  });

  it("never uses approval language in explanations", () => {
    const a = scoreCompensatingFactors({ actualReservesMonths: 24, requestedLtv: 65 }, program);
    for (const f of a.factors) {
      expect(f.explanation).not.toMatch(/approv|will qualify|guarantee/i);
    }
  });
});
