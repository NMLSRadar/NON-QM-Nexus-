import { describe, expect, it } from "vitest";
import { baseProgramChecks, deriveMaxLtv } from "@/domain/matching/baseChecks";
import { extractFromTranscript } from "@/domain/voice/extract";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { CalculationSummary } from "@/domain/types/results";
// The ingestion module is deliberately executable JavaScript so Vercel can run
// it during postbuild without a TS runtime.
// @ts-ignore -- executable ingestion module has no declaration file
import { PROGRAMS } from "../../scripts/ingest_amwest_pennymac_clearedge_fundloans_2026_08_08.mjs";

const row = (name: string) => {
  const found = PROGRAMS.find((p: { name: string }) => p.name === name);
  if (!found) throw new Error(`Missing fixture program: ${name}`);
  return found as { lender: string; name: string; source: string; config: Record<string, unknown> };
};

const program = (name: string): Program => {
  const p = row(name);
  return {
    ...(p.config as unknown as Program),
    id: `program-${name}`, lenderId: `lender-${p.lender}`, organizationId: "org", name: p.name,
    isSampleData: false, active: true, guidelineVersionId: "gv", guidelineVersionLabel: "2026",
    effectiveDate: "2026-08-08", sourceCitation: p.source,
  };
};

const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  id: "s", organizationId: "org", name: "Validation", createdByUserId: "u",
  loanPurpose: "purchase", occupancy: "primary", propertyType: "single_family", state: "CA",
  requestedLoanAmount: 800_000, purchasePrice: 1_000_000, estimatedValue: 1_000_000,
  fico: 740, creditProfileType: "us_fico_score", citizenship: "us_citizen",
  incomeDocType: "bank_statement", createdAt: "2026-08-08", updatedAt: "2026-08-08",
  ...overrides,
});

const calc = (ltv = 80): CalculationSummary => {
  const ltvResult = { key: "ltv", label: "LTV", value: ltv, unit: "percent" as const, formula: "loan/value", inputs: {} };
  return { ltv: ltvResult, results: [ltvResult] };
};
const outcomes = (s: Scenario, p: Program, ltv = 80) => baseProgramChecks(s, calc(ltv), p);

// These are the 15 acceptance scenarios for the four-lender August 2026 pass.
describe("AmWest, PennyMac, ClearEdge, and FundLoans — 2026-08-08 acceptance", () => {
  it("1. creates the intended 61 separate current program paths with no duplicate lender/program names", () => {
    expect(PROGRAMS).toHaveLength(61);
    expect(new Set(PROGRAMS.map((p: { lender: string; name: string }) => `${p.lender}|${p.name}`)).size).toBe(61);
  });

  it("2. does not manufacture an AmWest bank-statement program", () => {
    const amwest = PROGRAMS.filter((p: { lender: string }) => p.lender === "AmWest Funding Corp.");
    expect(amwest).toHaveLength(7);
    expect(amwest.some((p: { config: { incomeDocTypes: string[] } }) => p.config.incomeDocTypes.includes("bank_statement"))).toBe(false);
  });

  it("3. routes PennyMac A+ 12-month personal statements only to the matching path", () => {
    const p = program("Non-QM A+ — 12-Month Personal Bank Statement");
    const good = scenario({ bankStatement: { months: 12, personalOrBusiness: "personal" } });
    const bad = scenario({ bankStatement: { months: 24, personalOrBusiness: "business" } });
    expect(outcomes(good, p).some((r) => r.outcome === "fail")).toBe(false);
    expect(outcomes(bad, p).filter((r) => r.outcome === "fail").map((r) => r.ruleName)).toEqual(expect.arrayContaining(["Bank statement period", "Bank statement account type"]));
  });

  it("4. preserves PennyMac A+ 90% at $1M/740 but does not give that tier to a 700 FICO", () => {
    const p = program("Non-QM A+ — 12-Month Personal Bank Statement");
    expect(deriveMaxLtv(scenario({ requestedLoanAmount: 1_000_000, fico: 740 }), p)).toBe(90);
    expect(deriveMaxLtv(scenario({ requestedLoanAmount: 1_000_000, fico: 700 }), p)).toBe(80);
  });

  it("5. keeps PennyMac A- below A+ at the same $1.5M/720 purchase scenario", () => {
    const aPlus = program("Non-QM A+ — 24-Month Business Bank Statement");
    const aMinus = program("Non-QM A- — 24-Month Business Bank Statement");
    const s = scenario({ requestedLoanAmount: 1_500_000, fico: 720, bankStatement: { months: 24, personalOrBusiness: "business" } });
    expect(deriveMaxLtv(s, aPlus)).toBe(85);
    expect(deriveMaxLtv(s, aMinus)).toBe(80);
  });

  it("6. applies the catalog-wide 85% warrantable / 80% non-warrantable condo caps", () => {
    const p = program("Non-QM A+ — 12-Month Personal Bank Statement");
    expect(deriveMaxLtv(scenario({ propertyType: "condo" }), p)).toBe(85);
    expect(deriveMaxLtv(scenario({ propertyType: "non_warrantable_condo" }), p)).toBe(80);
  });

  it("7. stores AmWest P&L as the income document and never requires tax returns", () => {
    const p = program("Advantage — P&L Only");
    expect(p.incomeDocTypes).toEqual(["pnl_only"]);
    expect(p.pnlTaxReturnsRequired).toBe(false);
    expect(p.pnlPreparerAttestationPurpose).toBe("confirms_tax_filing_only");
  });

  it("8. preserves AmWest's separate 0.75-.84 low-DSCR leverage tier", () => {
    const p = program("Investor Advantage — Low DSCR (0.75-0.99)");
    const s = scenario({ incomeDocType: "dscr", occupancy: "investment", requestedLoanAmount: 1_500_000, fico: 660 });
    expect(deriveMaxLtv(s, p, 0.80)).toBe(65);
    expect(deriveMaxLtv(s, p, 0.90)).toBe(75);
  });

  it("9. keeps ClearEdge P&L Only separate, primary-only, and tax-return-free", () => {
    const p = program("Connect — P&L Only");
    expect(p.occupancies).toEqual(["primary"]);
    expect(p.pnlTaxReturnsRequired).toBe(false);
    expect(p.pnlSupportingBankStatementsMonths).toBe(2);
  });

  it("10. preserves ClearEdge Jade 5-8 unit as an experienced-investor specialty program", () => {
    const p = program("Investor Jade — DSCR (5-8 Unit / Mixed Use)");
    expect(p.propertyTypes).toEqual(["5_8_unit"]);
    expect(p.experiencedInvestorRequired).toBe(true);
    expect(p.fiveToEightUnitStrIncomeEligible).toBe(false);
  });

  it("11. preserves FundLoans Spectrum low DSCR and no-ratio as distinct products", () => {
    const low = program("Spectrum — Low DSCR (0.75-0.99)");
    const noRatio = program("Spectrum — No Ratio");
    expect(low.minDscr).toBe(0.75);
    expect(noRatio.minDscr).toBe(0);
    expect(noRatio.experiencedInvestorRequired).toBe(true);
  });

  it("12. evaluates documented foreign-national no-FICO paths without inventing a U.S. FICO", () => {
    const p = program("Spectrum — Foreign National DSCR");
    const s = scenario({ incomeDocType: "dscr", occupancy: "investment", citizenship: "foreign_national", fico: undefined, creditProfileType: "foreign_credit", requestedLoanAmount: 1_200_000 });
    expect(deriveMaxLtv(s, p, 1.1)).toBe(65);
    expect(outcomes(s, p, 65).some((r) => r.ruleName === "Credit score" && r.outcome === "fail")).toBe(false);
  });

  it("13. allows FundLoans Aspire only as a standalone second and rejects a first lien", () => {
    const p = program("Aspire — Standalone Second (Full/Alt Doc)");
    const second = scenario({ lienPosition: "standalone_second", loanPurpose: "second_lien", incomeDocType: "pnl_only" });
    const first = scenario({ lienPosition: "first_lien", incomeDocType: "pnl_only" });
    expect(outcomes(second, p).some((r) => r.ruleName === "Lien position" && r.outcome === "fail")).toBe(false);
    expect(outcomes(first, p).some((r) => r.ruleName === "Lien position" && r.outcome === "fail")).toBe(true);
  });

  it("14. carries official HTTPS source links and effective versions on every program", () => {
    for (const p of PROGRAMS as Array<{ source: string; version: string; effectiveDate: string; config: { sourceDocuments: string[] } }>) {
      expect(p.source).toMatch(/https:\/\//);
      expect(p.version.length).toBeGreaterThan(10);
      expect(p.effectiveDate).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
      expect(p.config.sourceDocuments.every((url) => url.startsWith("https://"))).toBe(true);
    }
  });

  it("15. Voice Scenario recognizes statement details and semantic DSCR wording", () => {
    const bank = extractFromTranscript("Purchase using twenty-four month business bank statements, 740 FICO, one million dollar SFR.");
    expect(bank.incomeDocType?.value).toBe("bank_statement");
    expect(bank.bankStatementMonths).toBe(24);
    expect(bank.bankStatementKind).toBe("business");
    const dscr = extractFromTranscript("Need a rental property loan using rents to qualify, $800,000 loan at 70% LTV.");
    expect(dscr.incomeDocType?.value).toBe("dscr");
    expect(dscr.occupancy?.value).toBe("investment");
    expect(dscr.occupancy?.source).toMatch(/investment|rental|DSCR/i);
  });
});
