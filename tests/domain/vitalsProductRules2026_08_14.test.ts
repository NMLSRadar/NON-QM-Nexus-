import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { baseProgramChecks, deriveMaxLtv } from "@/domain/matching/baseChecks";
import { evaluateProgram } from "@/domain/matching/evaluateProgram";
import { RuleOutcome } from "@/domain/types/enums";
import type { Lender, Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";

function program(overrides: Partial<Program> = {}): Program {
  return {
    id: "program",
    lenderId: "lender",
    organizationId: "org",
    name: "Alternative Documentation",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["pnl_only"],
    loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["primary", "second_home", "investment"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 3_000_000,
    minFico: 620,
    maxDti: 55,
    baseMaxLtv: 90,
    minReservesMonths: 3,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "gv",
    guidelineVersionLabel: "2026",
    effectiveDate: "2026-01-01",
    sourceCitation: "Verified test guideline",
    ...overrides,
  };
}

function scenario(ltv: number): Scenario {
  return {
    id: "scenario",
    organizationId: "org",
    name: "P&L test",
    createdByUserId: "user",
    loanPurpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    estimatedValue: 1_000_000,
    requestedLoanAmount: ltv * 10_000,
    fico: 740,
    incomeDocType: "pnl_only",
    pnl: { periodMonths: 12 },
    citizenship: "us_citizen",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function calc(ltv: number): CalculationSummary {
  const ltvResult = { key: "ltv", label: "LTV", value: ltv, unit: "percent", formula: "loan/value", inputs: {} } as const;
  return { ltv: ltvResult, results: [ltvResult] };
}

const lender: Lender = {
  id: "lender",
  organizationId: "org",
  name: "Exact P&L Lender",
  isSampleData: false,
  active: true,
  tierLevel: 1,
};

describe("5–8 unit deterministic product classification", () => {
  it.each([
    "Purchasing a 5-unit property.",
    "Borrower wants to refinance a six-unit.",
    "8-unit multifamily purchase.",
    "five to eight unit property",
    "multifamily 7 units",
  ])("forces Investment + DSCR for %j", (text) => {
    const result = extractFromTranscript(`${text} It will be a primary residence using bank statements.`);
    expect(result.propertyType?.value).toBe("5_8_unit");
    expect(result.occupancy?.value).toBe("investment");
    expect(result.incomeDocType?.value).toBe("dscr");
    expect(result.occupancy?.inferred).toBe(true);
    expect(result.incomeDocType?.inferred).toBe(true);
  });

  it("releases the lock when the unit count is outside the 5–8 range", () => {
    const result = extractFromTranscript("Purchasing a 9-unit property using bank statements.");
    expect(result.propertyType?.value).toBe("9_plus_unit");
    expect(result.incomeDocType?.value).toBe("bank_statement");
  });
});

describe("P&L Only voice recognition", () => {
  it.each([
    "P&L only at 80% LTV",
    "P and L program",
    "profit and loss only",
    "profit loss income",
    "qualify using a P&L",
    "P&L with two months bank statements",
    "P and L with 2 months statements",
  ])("classifies %j as P&L Only, never Bank Statement", (text) => {
    expect(extractFromTranscript(text).incomeDocType?.value).toBe("pnl_only");
  });
});

describe("P&L Only exact-product leverage", () => {
  it("searches P&L rules only at 80%", () => {
    const p = program({ pnlMaxLtv: 80 });
    expect(deriveMaxLtv(scenario(80), p)).toBe(80);
  });

  it("never inherits a 90% Bank Statement/generic maximum when P&L is 80%", () => {
    const p = program({ baseMaxLtv: 90, incomeDocTypeLtvCaps: { bank_statement: { purchase: 90 } }, pnlMaxLtv: 80 });
    const checks = baseProgramChecks(scenario(85), calc(85), p);
    expect(deriveMaxLtv(scenario(85), p)).toBe(80);
    expect(checks.find((item) => item.ruleId.endsWith(":ltv"))?.outcome).toBe(RuleOutcome.Fail);
  });

  it("permits 85% only when the exact P&L product supports 85%", () => {
    const p = program({ baseMaxLtv: 90, incomeDocTypeLtvCaps: { bank_statement: { purchase: 90 } }, pnlMaxLtv: 85 });
    const checks = baseProgramChecks(scenario(85), calc(85), p);
    expect(deriveMaxLtv(scenario(85), p)).toBe(85);
    expect(checks.find((item) => item.ruleId.endsWith(":ltv"))?.outcome).toBe(RuleOutcome.Pass);
  });

  it("uses the P&L purpose-specific cap instead of the higher P&L headline", () => {
    const p = program({
      pnlMaxLtv: 85,
      incomeDocTypeLtvCaps: { pnl_only: { purchase: 85, cash_out_refinance: 70 } },
    });
    expect(deriveMaxLtv({ ...scenario(75), loanPurpose: "cash_out_refinance" }, p)).toBe(70);
  });

  it("adds the prominent two-month supporting-statement disclaimer at exactly 85%", () => {
    const evaluation = evaluateProgram(scenario(85), calc(85), program({ pnlMaxLtv: 85 }), lender, []);
    expect(evaluation.documentationType).toBe("P&L Only");
    expect(evaluation.pnl85SupportingStatementDisclaimer).toBe(
      "Important: At 85% LTV, the lender will most likely require two months of bank statements to support the Profit & Loss statement.",
    );
  });

  it("enforces the absolute 85% ceiling even when malformed P&L data says 90%", () => {
    const p = program({ pnlMaxLtv: 90 });
    const checks = baseProgramChecks(scenario(90), calc(90), p);
    expect(deriveMaxLtv(scenario(90), p)).toBe(85);
    expect(checks.find((item) => item.ruleId.endsWith(":pnl-global-ltv"))?.outcome).toBe(RuleOutcome.Fail);
    expect(checks.find((item) => item.ruleId.endsWith(":pnl-global-ltv"))?.userExplanation).toContain("capped at a maximum of 85% LTV");
  });

  it("fails closed when no exact P&L maximum is stored", () => {
    const p = program({ baseMaxLtv: 90, incomeDocTypeLtvCaps: { bank_statement: { purchase: 90 } } });
    const checks = baseProgramChecks(scenario(80), calc(80), p);
    expect(deriveMaxLtv(scenario(80), p)).toBe(0);
    expect(checks.find((item) => item.ruleId.endsWith(":pnl-exact-ltv"))?.outcome).toBe(RuleOutcome.Fail);
  });
});
