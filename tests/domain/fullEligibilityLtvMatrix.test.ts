import { describe, expect, it } from "vitest";
import { baseProgramChecks, deriveMaxLtv } from "@/domain/matching/baseChecks";
import { RuleOutcome } from "@/domain/types/enums";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";

function program(overrides: Partial<Program> = {}): Program {
  return {
    id: "p", lenderId: "l", organizationId: "o", name: "Matrix", isSampleData: false, active: true,
    incomeDocTypes: ["dscr"], loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
    occupancies: ["investment"], propertyTypes: ["single_family"], eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen", "foreign_national"], vestingEligible: ["individual"],
    minLoanAmount: 75_000, maxLoanAmount: 3_000_000, minFico: 640, minDscr: .75,
    baseMaxLtv: 80, minReservesMonths: 3, interestOnlyAvailable: false, prepaymentPenaltyOptions: [],
    guidelineVersionId: "g", guidelineVersionLabel: "v", effectiveDate: "2026-03-20", sourceCitation: "matrix",
    ...overrides,
  };
}
function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s", organizationId: "o", name: "Scenario", createdByUserId: "u", loanPurpose: "purchase",
    occupancy: "investment", propertyType: "single_family", requestedLoanAmount: 1_000_000, fico: 720,
    citizenship: "us_citizen", createdAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides,
  };
}

const matrix = [
  { maxLoanAmount: 1_500_000, minFico: 720, minDscr: 1, loanPurpose: "purchase" as const, maxLtv: 80 },
  { maxLoanAmount: 1_500_000, minFico: 720, minDscr: 1, loanPurpose: "cash_out_refinance" as const, maxLtv: 75 },
  { maxLoanAmount: 1_500_000, minFico: 680, minDscr: .75, maxDscrExclusive: 1, loanPurpose: "purchase" as const, maxLtv: 70 },
  { maxLoanAmount: 2_500_000, minFico: 700, minDscr: 1, loanPurpose: "purchase" as const, maxLtv: 70 },
  { maxLoanAmount: 2_500_000, citizenship: "foreign_national" as const, minDscr: 1, loanPurpose: "purchase" as const, maxLtv: 65 },
];

describe("full eligibility LTV matrix", () => {
  it("preserves transaction-specific LTV", () => {
    const p = program({ eligibilityLtvMatrix: matrix });
    expect(deriveMaxLtv(scenario(), p, 1.1)).toBe(80);
    expect(deriveMaxLtv(scenario({ loanPurpose: "cash_out_refinance" }), p, 1.1)).toBe(75);
  });
  it("preserves DSCR bands and loan-amount bands", () => {
    const p = program({ eligibilityLtvMatrix: matrix });
    expect(deriveMaxLtv(scenario({ fico: 690 }), p, .9)).toBe(70);
    expect(deriveMaxLtv(scenario({ requestedLoanAmount: 2_000_000, fico: 710 }), p, 1.1)).toBe(70);
  });
  it("uses a citizenship-specific no-FICO row", () => {
    const p = program({ eligibilityLtvMatrix: matrix, noFicoPolicy: "eligible", noFicoMaxLtv: 65 });
    expect(deriveMaxLtv(scenario({ citizenship: "foreign_national", fico: undefined, creditProfileType: "no_us_credit", requestedLoanAmount: 2_000_000 }), p, 1.1)).toBe(65);
  });
  it("never falls back to headline LTV when the matrix has no applicable row", () => {
    expect(deriveMaxLtv(scenario({ fico: 620 }), program({ eligibilityLtvMatrix: matrix }), 1.1)).toBe(0);
  });
  it("enforces documentation-specific purposes and caps", () => {
    const p = program({
      incomeDocTypes: ["asset_depletion", "pnl_only"],
      incomeDocTypePurposeRestrictions: { asset_depletion: ["purchase", "rate_term_refinance"] },
      incomeDocTypeLtvCaps: { pnl_only: { purchase: 70 } },
      eligibilityLtvMatrix: [{ minFico: 700, loanPurpose: "purchase", maxLtv: 80 }, { minFico: 700, loanPurpose: "cash_out_refinance", maxLtv: 75 }],
    });
    expect(deriveMaxLtv(scenario({ incomeDocType: "pnl_only" }), p, 1.1)).toBe(70);
    const calc = { results: [], ltv: { value: 65, source: "test" }, dscr: { value: 1.1, source: "test" } } as never;
    const results = baseProgramChecks(scenario({ incomeDocType: "asset_depletion", loanPurpose: "cash_out_refinance" }), calc, p);
    expect(results.find((r) => r.ruleName === "Documentation-specific loan purpose")?.outcome).toBe(RuleOutcome.Fail);
  });
  it("applies Deephaven-style P&L support tiers without requiring tax returns", () => {
    const p = program({
      incomeDocTypes: ["pnl_only"], minFico: 660, maxLoanAmount: 3_500_000,
      pnlPeriodMonths: 12, pnlTaxReturnsRequired: false,
      pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
      pnlWithSupportingStatementsLtvCaps: { purchase: 80, rate_term_refinance: 70, cash_out_refinance: 70 },
      pnlWithoutSupportingStatementsLtvCaps: { purchase: 70, rate_term_refinance: 60, cash_out_refinance: 60 },
      pnlWithoutSupportingStatementsMinFico: 720,
      pnlWithoutSupportingStatementsMaxLoanAmount: 2_000_000,
      eligibilityLtvMatrix: [{ minFico: 660, loanPurpose: "purchase", maxLtv: 85 }],
    });
    expect(deriveMaxLtv(scenario({ incomeDocType: "pnl_only", pnl: { periodMonths: 12, supportingBankStatements: true } }), p, 1.1)).toBe(80);
    expect(deriveMaxLtv(scenario({ incomeDocType: "pnl_only", pnl: { periodMonths: 12, supportingBankStatements: false } }), p, 1.1)).toBe(70);
    const calc = { results: [], ltv: { value: 65, source: "test" }, dscr: { value: 1.1, source: "test" } } as never;
    const results = baseProgramChecks(scenario({ incomeDocType: "pnl_only", fico: 700, requestedLoanAmount: 2_100_000, pnl: { periodMonths: 6, supportingBankStatements: false } }), calc, p);
    expect(results.find((r) => r.ruleName === "P&L statement period")?.outcome).toBe(RuleOutcome.Fail);
    expect(results.find((r) => r.ruleName === "P&L without supporting statements — FICO")?.outcome).toBe(RuleOutcome.Fail);
    expect(results.find((r) => r.ruleName === "P&L without supporting statements — loan amount")?.outcome).toBe(RuleOutcome.Fail);
  });
  it("keeps a premier product editorial-only and requires matrix confirmation", () => {
    const p = program({
      premierProduct: true,
      matrixConfirmationRequired: true,
      matrixConfirmationNotes: "Confirm the current CES matrix.",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["second_lien"],
      occupancies: ["investment"],
      lienPosition: "standalone_second",
      ltvMetric: "cltv",
      minDscr: 1,
    });
    const calc = { results: [], ltv: { value: 50, source: "test" }, cltv: { value: 70, source: "test" }, dscr: { value: 1.1, source: "test" } } as never;
    const results = baseProgramChecks(scenario({ incomeDocType: "dscr", loanPurpose: "second_lien", occupancy: "investment", lienPosition: "standalone_second" }), calc, p);
    expect(results.find((r) => r.ruleName === "Current lender matrix confirmation")?.outcome).toBe(RuleOutcome.ManualReview);
    expect(results.find((r) => r.ruleName === "Maximum CLTV")?.outcome).toBe(RuleOutcome.Pass);
  });
  it("treats omitted numeric matrix fields as manual review instead of a fabricated $0 decline", () => {
    const p = program({
      incomeDocTypes: ["bank_statement"],
      minLoanAmount: 0,
      maxLoanAmount: 0,
      minFico: 0,
      baseMaxLtv: 0,
      matrixConfirmationRequired: true,
    });
    const calc = { results: [], ltv: { value: 80, source: "test" } } as never;
    const results = baseProgramChecks(scenario({ incomeDocType: "bank_statement" }), calc, p);
    expect(results.find((r) => r.ruleName === "Loan amount range")?.outcome).toBe(RuleOutcome.ManualReview);
    expect(results.find((r) => r.ruleName === "Minimum FICO")?.outcome).toBe(RuleOutcome.ManualReview);
    expect(results.find((r) => r.ruleName === "Maximum LTV")?.outcome).toBe(RuleOutcome.ManualReview);
    expect(results.some((r) => r.outcome === RuleOutcome.Fail)).toBe(false);
  });
  it("applies first-time-investor and STR leverage reductions", () => {
    const p = program({
      eligibilityLtvMatrix: [{ minFico: 700, minDscr: 1, loanPurpose: "purchase", maxLtv: 80 }],
      firstTimeInvestorLtvAdjustment: 5,
      strIncomeLtvAdjustment: 5,
      strIncomeMaxLtv: 75,
    });
    expect(deriveMaxLtv(scenario({ investorExperience: "first_time_investor" }), p, 1.1)).toBe(75);
    expect(deriveMaxLtv(scenario({ incomeDocType: "dscr", dscr: { strIncomeUsed: "yes" } }), p, 1.1)).toBe(75);
  });
  it("uses the highest applicable reserve overlay", () => {
    const p = program({
      reserveRules: [{ months: 6, minLoanAmountExclusive: 1_500_000 }, { months: 12, citizenship: "foreign_national" }],
    });
    const calc = { results: [{ key: "available_reserves_months", value: 10 }], ltv: { value: 60, source: "test" }, dscr: { value: 1.1, source: "test" } } as never;
    const results = baseProgramChecks(scenario({ citizenship: "foreign_national", requestedLoanAmount: 2_000_000 }), calc, p);
    expect(results.find((r) => r.ruleName === "Required reserves")?.outcome).toBe(RuleOutcome.Warning);
    expect(results.find((r) => r.ruleName === "Required reserves")?.userExplanation).toContain("12");
  });
  it("evaluates closed-end seconds against CLTV and enforces cash-out dollar caps", () => {
    const p = program({
      ltvMetric: "cltv", loanPurposes: ["cash_out_refinance"], eligibilityLtvMatrix: [{ minFico: 700, loanPurpose: "cash_out_refinance", maxLtv: 75 }],
      cashOutLimits: [{ maxLtv: 50, maxCashOutAmount: null }, { maxLtv: 100, maxCashOutAmount: 1_000_000 }],
    });
    const s = scenario({ loanPurpose: "cash_out_refinance", requestedCashOut: 1_100_000 });
    const calc = { results: [], ltv: { value: 20, source: "test" }, cltv: { value: 70, source: "test" }, dscr: { value: 1.1, source: "test" } } as never;
    const results = baseProgramChecks(s, calc, p);
    expect(results.find((r) => r.ruleName === "Maximum CLTV")?.outcome).toBe(RuleOutcome.Pass);
    expect(results.find((r) => r.ruleName === "Maximum cash-out proceeds")?.outcome).toBe(RuleOutcome.Fail);
  });
});
