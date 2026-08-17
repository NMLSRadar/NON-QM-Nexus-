import { describe, expect, it } from "vitest";
import { baseProgramChecks, deriveMaxDti, deriveMaxLtv, deriveRequiredReservesMonths } from "@/domain/matching/baseChecks";
import { extractFromTranscript } from "@/domain/voice/extract";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";
// @ts-ignore executable production ingestion module intentionally has no declaration file
import { PROGRAMS, NON_QHEM_LTV_MATRIX, ITIN_LTV_MATRIX, SOURCES } from "../../scripts/ingest_thelender_complete_2026_08_17.mjs";

const fixture = (name: string): Program => {
  const found = PROGRAMS.find((item: { name: string }) => item.name === name);
  if (!found) throw new Error(`Missing theLender fixture: ${name}`);
  return {
    ...found.config,
    id: `p-${name}`, lenderId: "l-thelender", organizationId: "org", name,
    isSampleData: false, active: true, guidelineVersionId: "gv", guidelineVersionLabel: found.version,
    effectiveDate: found.effectiveDate, sourceCitation: found.source,
  } as Program;
};

const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  id: "s", organizationId: "org", name: "theLender verification", createdByUserId: "u",
  loanPurpose: "purchase", occupancy: "primary", propertyType: "single_family", state: "CA",
  requestedLoanAmount: 800_000, purchasePrice: 1_000_000, estimatedValue: 1_000_000,
  fico: 720, creditProfileType: "us_fico_score", citizenship: "us_citizen",
  incomeDocType: "full_doc", createdAt: "2026-08-17", updatedAt: "2026-08-17",
  ...overrides,
});

const calc = (ltv = 80, dti = 45): CalculationSummary => {
  const ltvResult = { key: "ltv", label: "LTV", value: ltv, unit: "percent" as const, formula: "loan/value", inputs: {} };
  const dtiResult = { key: "dti", label: "DTI", value: dti, unit: "percent" as const, formula: "debts/income", inputs: {} };
  return { ltv: ltvResult, dti: dtiResult, results: [ltvResult, dtiResult] };
};
const hardFails = (s: Scenario, p: Program, ltv = 80, dti = 45) => baseProgramChecks(s, calc(ltv, dti), p).filter((result) => result.outcome === "fail" && result.severity === "hard");

const BS12 = "theLender — 12-Month Bank Statement";
const BS24 = "theLender — 24-Month Bank Statement";
const PNL = "theLender — P&L Only";
const GIG = "theLender Gig Qualifier — 1099";
const ASSET = "theLender — Asset Qualifier";
const FULL = "theLender — Full Doc Non-QM";
const ITIN_FULL = "theLender — ITIN Full Doc";
const ITIN_BS = "theLender — ITIN Bank Statement";
const ITIN_1099 = "theLender — ITIN 1099";

describe("theLender complete Non-QM integration — 2026-08-17", () => {
  it("normalizes 11 independent documentation products with official source metadata", () => {
    expect(PROGRAMS).toHaveLength(11);
    expect(new Set(PROGRAMS.map((item: { name: string }) => item.name)).size).toBe(11);
    expect(PROGRAMS.every((item: any) => item.lender === "theLender")).toBe(true);
    expect(SOURCES.nonQhem).toContain("Non-QHEM_08.04.26E.pdf");
    expect(NON_QHEM_LTV_MATRIX.length).toBeGreaterThan(100);
    expect(ITIN_LTV_MATRIX).toHaveLength(16);
  });

  it("1. matches 620 FICO + 1099 only through the Gig Qualifier documentation path", () => {
    const s = scenario({ fico: 620, incomeDocType: "1099" });
    expect(hardFails(s, fixture(GIG), 80)).toHaveLength(0);
    expect(hardFails(s, fixture(BS12), 80).map((r) => r.ruleName)).toContain("Income documentation type");
  });

  it("2. matches 620 FICO + 12-month business bank statements", () => {
    const s = scenario({ fico: 620, incomeDocType: "bank_statement", bankStatement: { months: 12, personalOrBusiness: "business" } });
    expect(hardFails(s, fixture(BS12), 80)).toHaveLength(0);
  });

  it("3. enforces 680 FICO and exact P&L-only limits", () => {
    const p = fixture(PNL);
    const good = scenario({ fico: 680, incomeDocType: "pnl_only", pnl: { periodMonths: 12, ownershipPercent: 25, preparer: "cpa" } });
    expect(hardFails(good, p, 85, 50)).toHaveLength(0);
    expect(p.pnlTaxReturnsRequired).toBe(false);
    expect(p.pnlEligiblePeriods).toEqual([12, 24]);
    expect(deriveMaxLtv(good, p)).toBe(85);
  });

  it("4. enforces Asset Qualifier minimum FICO and 43% DTI", () => {
    const p = fixture(ASSET);
    const good = scenario({ fico: 680, incomeDocType: "asset_depletion" });
    expect(hardFails(good, p, 80, 43)).toHaveLength(0);
    expect(hardFails(good, p, 80, 44).map((r) => r.ruleName)).toContain("Maximum DTI");
    expect(p.assetQualifierMethods).toHaveLength(2);
  });

  it("5. keeps ITIN + Full Doc independent", () => {
    const s = scenario({ fico: 720, citizenship: "itin", incomeDocType: "full_doc" });
    expect(hardFails(s, fixture(ITIN_FULL), 75)).toHaveLength(0);
    expect(hardFails(s, fixture(ITIN_BS), 75).map((r) => r.ruleName)).toContain("Income documentation type");
  });

  it("6. keeps ITIN + Bank Statement independent", () => {
    const s = scenario({ fico: 720, citizenship: "itin", incomeDocType: "bank_statement", bankStatement: { months: 12, personalOrBusiness: "business" } });
    expect(hardFails(s, fixture(ITIN_BS), 75)).toHaveLength(0);
    expect(hardFails(s, fixture(BS12), 75).map((r) => r.ruleName)).toContain("Citizenship / residency");
  });

  it("7. keeps ITIN + 1099 independent from standard Gig Qualifier", () => {
    const s = scenario({ fico: 720, citizenship: "itin", incomeDocType: "1099" });
    expect(hardFails(s, fixture(ITIN_1099), 75)).toHaveLength(0);
    expect(hardFails(s, fixture(GIG), 75).map((r) => r.ruleName)).toContain("Citizenship / residency");
  });

  it("8. rejects 24 months on the 12-month Bank Statement product", () => {
    const s = scenario({ incomeDocType: "bank_statement", bankStatement: { months: 24, personalOrBusiness: "business" } });
    expect(hardFails(s, fixture(BS12)).map((r) => r.ruleName)).toContain("Bank statement period");
  });

  it("9. rejects 12 months on the 24-month Bank Statement product", () => {
    const s = scenario({ incomeDocType: "bank_statement", bankStatement: { months: 12, personalOrBusiness: "personal" } });
    expect(hardFails(s, fixture(BS24)).map((r) => r.ruleName)).toContain("Bank statement period");
  });

  it("10-12. applies separate Primary, Second Home, and Investment matrix rows", () => {
    const p = fixture(FULL);
    expect(deriveMaxLtv(scenario({ fico: 720, requestedLoanAmount: 2_000_000, occupancy: "primary" }), p)).toBe(90);
    expect(deriveMaxLtv(scenario({ fico: 720, requestedLoanAmount: 2_000_000, occupancy: "second_home" }), p)).toBe(85);
    expect(deriveMaxLtv(scenario({ fico: 720, requestedLoanAmount: 2_000_000, occupancy: "investment" }), p)).toBe(85);
  });

  it("13. uses cash-out cells rather than purchase marketing maximums", () => {
    const p = fixture(FULL);
    const s = scenario({ fico: 720, requestedLoanAmount: 2_000_000, loanPurpose: "cash_out_refinance" });
    expect(deriveMaxLtv(s, p)).toBe(75);
  });

  it("14. applies recent credit-event seasoning, leverage, and loan-size tiers", () => {
    const p = fixture(FULL);
    const recent = scenario({ fico: 720, requestedLoanAmount: 900_000, creditEvents: { bankruptcyMonthsSinceDischarge: 18 } });
    expect(deriveMaxLtv(recent, p)).toBe(70);
    const tooLarge = scenario({ fico: 720, requestedLoanAmount: 1_200_000, creditEvents: { foreclosureMonthsSince: 18 } });
    expect(hardFails(tooLarge, p, 70).map((r) => r.ruleName)).toContain("Credit-event maximum loan amount");
  });

  it("15. treats no ITIN housing history as conditional with six months reserves and 10% contribution", () => {
    const p = fixture(ITIN_FULL);
    const s = scenario({ citizenship: "itin", incomeDocType: "full_doc", creditEvents: { housingHistoryMonths: 0 } });
    const checks = baseProgramChecks(s, calc(75), p);
    expect(checks.some((r) => r.ruleName === "No housing history" && r.outcome === "manual_review")).toBe(true);
    expect(deriveRequiredReservesMonths(s, p, undefined, 75)).toBe(6);
    expect(p.noHousingHistoryMinBorrowerContributionPercent).toBe(10);
  });

  it("16. applies non-warrantable condo caps without overwriting the matrix", () => {
    expect(deriveMaxLtv(scenario({ propertyType: "non_warrantable_condo" }), fixture(FULL))).toBe(80);
    expect(deriveMaxLtv(scenario({ citizenship: "itin", incomeDocType: "full_doc", propertyType: "non_warrantable_condo" }), fixture(ITIN_FULL))).toBe(75);
  });

  it("17. grants 55% DTI only for purchase/rate-term, 680+ FICO, <=70% LTV and flags residual-income review", () => {
    const p = fixture(FULL);
    const eligibleTier = scenario({ fico: 680, loanPurpose: "purchase" });
    expect(deriveMaxDti(eligibleTier, p, 70)).toBe(55);
    expect(baseProgramChecks(eligibleTier, calc(70, 55), p).some((r) => r.ruleName === "Maximum DTI" && r.outcome === "manual_review")).toBe(true);
    expect(deriveMaxDti(scenario({ fico: 660, loanPurpose: "purchase" }), p, 70)).toBe(50);
    expect(deriveMaxDti(scenario({ fico: 720, loanPurpose: "cash_out_refinance" }), p, 70)).toBe(50);
    expect(deriveMaxDti(scenario({ fico: 720, loanPurpose: "purchase" }), p, 75)).toBe(50);
  });

  it("18-20. applies $1MM, $2.5MM, and $4MM matrix tiers rather than one lender-wide maximum", () => {
    const p = fixture(FULL);
    expect(deriveMaxLtv(scenario({ fico: 680, requestedLoanAmount: 1_000_000 }), p)).toBe(90);
    expect(deriveMaxLtv(scenario({ fico: 680, requestedLoanAmount: 2_500_000 }), p)).toBe(70);
    expect(deriveMaxLtv(scenario({ fico: 720, requestedLoanAmount: 4_000_000 }), p)).toBe(70);
    expect(deriveMaxLtv(scenario({ fico: 700, requestedLoanAmount: 4_000_000 }), p)).toBe(0);
  });

  it("Voice Scenario recognizes all required aliases without requiring marketing names", () => {
    expect(extractFromTranscript("Borrower is a freelancer paid entirely on 1099").incomeDocType?.value).toBe("1099");
    expect(extractFromTranscript("Self-employed borrower wants no bank statements and a CPA P&L").incomeDocType?.value).toBe("pnl_only");
    expect(extractFromTranscript("Borrower has substantial liquid assets but not enough traditional income").incomeDocType?.value).toBe("asset_depletion");
    const bank = extractFromTranscript("Self-employed borrower with 24 months business bank statements");
    expect(bank.incomeDocType?.value).toBe("bank_statement");
    expect(bank.bankStatementMonths).toBe(24);
    expect(bank.bankStatementKind).toBe("business");
  });
});
