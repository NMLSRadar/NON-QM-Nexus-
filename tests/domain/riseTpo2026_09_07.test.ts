import { describe, expect, it } from "vitest";
import { baseProgramChecks, deriveMaxLtv } from "@/domain/matching/baseChecks";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";
// @ts-ignore executable production ingestion module intentionally has no declaration file
import { CORE_LTV_MATRIX, PROGRAMS, SOURCES } from "../../scripts/ingest_rise_tpo_2026_09_07.mjs";

const fixture = (name: string): Program => {
  const found = PROGRAMS.find((item: { name: string }) => item.name === name);
  if (!found) throw new Error(`Missing RISE TPO fixture: ${name}`);
  return {
    ...found.config,
    id: `p-${name}`,
    lenderId: "l-rise",
    organizationId: "org",
    name,
    isSampleData: false,
    active: true,
    guidelineVersionId: "gv",
    guidelineVersionLabel: found.version,
    effectiveDate: found.effectiveDate,
    sourceCitation: found.source,
  } as Program;
};

const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  id: "s",
  organizationId: "org",
  name: "RISE TPO verification",
  createdByUserId: "u",
  loanPurpose: "purchase",
  occupancy: "primary",
  propertyType: "single_family",
  state: "CA",
  requestedLoanAmount: 800_000,
  purchasePrice: 1_000_000,
  estimatedValue: 1_000_000,
  fico: 700,
  creditProfileType: "us_fico_score",
  citizenship: "us_citizen",
  incomeDocType: "full_doc",
  createdAt: "2026-09-07",
  updatedAt: "2026-09-07",
  ...overrides,
});

const calc = (ltv = 80, dti = 45): CalculationSummary => {
  const ltvResult = { key: "ltv", label: "LTV", value: ltv, unit: "percent" as const, formula: "loan/value", inputs: {} };
  const dtiResult = { key: "dti", label: "DTI", value: dti, unit: "percent" as const, formula: "debts/income", inputs: {} };
  return { ltv: ltvResult, dti: dtiResult, results: [ltvResult, dtiResult] };
};

const hardFails = (s: Scenario, p: Program, ltv = 80, dti = 45) => baseProgramChecks(s, calc(ltv, dti), p).filter((result) => result.outcome === "fail" && result.severity === "hard");

const BS = "RISE TPO — 12-Month Bank Statement";
const PNL = "RISE TPO — P&L";
const ALT = "RISE TPO — 90% LTV Alt Doc Options";
const ASSET = "RISE TPO — Asset Depletion";
const DSCR = "RISE TPO — 85% LTV DSCR";
const FULL = "RISE TPO — Full Doc Non-QM";
const BUSINESS = "RISE TPO — True Business Purpose Options";
const WVOE = "RISE TPO — WVOE";

describe("RISE TPO Non-QM integration — 2026-09-07", () => {
  it("adds the eight requested programs with official downloadable sources", () => {
    expect(PROGRAMS).toHaveLength(8);
    expect(new Set(PROGRAMS.map((item: { name: string }) => item.name))).toEqual(new Set([BS, PNL, ALT, ASSET, DSCR, FULL, BUSINESS, WVOE]));
    expect(PROGRAMS.every((item: { lender: string }) => item.lender === "RISE TPO")).toBe(true);
    expect(SOURCES.nonQmMatrix).toMatch(/RISETPO-Non-QM-Matrix-260608\.pdf$/);
    expect(SOURCES.dscrMatrix).toMatch(/DSCR-CES-Matrix-eff-260608\.pdf$/);
    expect(CORE_LTV_MATRIX.length).toBeGreaterThan(200);
  });

  it("keeps the 12-month statement option distinct and supports personal or business statements", () => {
    const p = fixture(BS);
    expect(p.bankStatementMonthsEligible).toEqual([12]);
    expect(p.bankStatementAccountTypes).toEqual(["personal", "business"]);
    const good = scenario({ incomeDocType: "bank_statement", bankStatement: { months: 12, personalOrBusiness: "business" } });
    expect(hardFails(good, p, 80)).toHaveLength(0);
    const wrongPeriod = scenario({ incomeDocType: "bank_statement", bankStatement: { months: 24, personalOrBusiness: "personal" } });
    expect(hardFails(wrongPeriod, p, 80).map((result) => result.ruleName)).toContain("Bank statement period");
  });

  it("does not require tax returns for P&L and preserves the three-month bank-statement support rule", () => {
    const p = fixture(PNL);
    expect(p.pnlTaxReturnsRequired).toBe(false);
    expect(p.pnlBankStatementSupportRequired).toBe(true);
    expect(p.pnlSupportingStatementMonths).toBe(3);
    expect(p.pnlMaxLtv).toBe(80);
  });

  it("uses the matrix tiers rather than applying the 90% headline to every scenario", () => {
    const p = fixture(ALT);
    expect(deriveMaxLtv(scenario({ fico: 700, requestedLoanAmount: 1_000_000 }), p)).toBe(90);
    expect(deriveMaxLtv(scenario({ fico: 680, requestedLoanAmount: 2_500_000 }), p)).toBe(75);
    expect(deriveMaxLtv(scenario({ fico: 720, requestedLoanAmount: 3_500_000, loanPurpose: "cash_out_refinance" }), p)).toBe(65);
  });

  it("keeps asset depletion, WVOE, and full doc as separate documentation paths", () => {
    expect(fixture(ASSET).incomeDocTypes).toEqual(["asset_depletion"]);
    expect(fixture(WVOE).incomeDocTypes).toEqual(["wvoe_only"]);
    expect(fixture(FULL).incomeDocTypes).toEqual(["full_doc"]);
    expect(fixture(WVOE).minFico).toBe(620);
    expect(fixture(WVOE).baseMaxLtv).toBe(80);
  });

  it("limits DSCR and true business-purpose options to investment occupancy", () => {
    const dscr = fixture(DSCR);
    expect(dscr.incomeDocTypes).toEqual(["dscr"]);
    expect(dscr.occupancies).toEqual(["investment"]);
    expect(dscr.baseMaxLtv).toBe(85);
    expect(dscr.minDscr).toBe(1);
    expect(dscr.matrixConfirmationRequired).toBe(true);
    expect(fixture(BUSINESS).occupancies).toEqual(["investment"]);
  });

  it("does not label RISE TPO as an ITIN specialist while preserving documented Full Doc and 12-month statement eligibility", () => {
    expect(fixture(FULL).citizenshipEligible).toContain("itin");
    expect(fixture(BS).citizenshipEligible).toContain("itin");
    expect(fixture(FULL).itinSpecialist).not.toBe(true);
    expect(fixture(BS).itinSpecialist).not.toBe(true);
    expect(fixture(PNL).citizenshipEligible).not.toContain("itin");
  });
});
