import { describe, expect, it } from "vitest";
import { baseProgramChecks, deriveMaxLtv } from "@/domain/matching/baseChecks";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
// The production ingestion file is deliberately plain ESM so Vercel can execute it after build.
// @ts-expect-error JavaScript ingestion module has no declaration file.
import { buildJmacProgramDefinitions } from "../../scripts/ingest_jmac_complete_2026_08_08.mjs";

const defs = buildJmacProgramDefinitions("jmac");
function program(name: string): Program {
  const def = defs.find(([n]: [string]) => n === name);
  if (!def) throw new Error(`Missing JMAC definition: ${name}`);
  const [, config, label, effectiveDate] = def;
  return { id: name, organizationId: "org", guidelineVersionId: "gv", guidelineVersionLabel: label, effectiveDate, ...config } as Program;
}
function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s", organizationId: "org", name: "JMAC regression", createdByUserId: "u",
    loanPurpose: "purchase", occupancy: "primary", propertyType: "single_family",
    requestedLoanAmount: 1_000_000, fico: 740, citizenship: "us_citizen",
    incomeDocType: "full_doc", createdAt: "2026-08-08", updatedAt: "2026-08-08", ...overrides,
  };
}

describe("JMAC complete 2026 rebuild", () => {
  it("keeps all supplied product families independent", () => {
    expect(defs).toHaveLength(18);
    expect(new Set(defs.map(([n]: [string]) => n)).size).toBe(18);
    expect(program("Jumbo Plus — AUS").notes).toContain("DU Approve/Ineligible");
    expect(program("Monterey Non-Conforming Jumbo").notes).toContain("distinct from Jumbo Plus AUS");
  });

  it("routes Zuma Gold through the exact FICO/amount/purpose matrix", () => {
    const p = program("Zuma Gold");
    expect(deriveMaxLtv(scenario({ fico: 680, incomeDocType: "bank_statement" }), p)).toBe(85);
    expect(deriveMaxLtv(scenario({ fico: 680, incomeDocType: "bank_statement", requestedLoanAmount: 2_000_000, loanPurpose: "cash_out_refinance" }), p)).toBe(70);
    expect(deriveMaxLtv(scenario({ fico: 680, incomeDocType: "pnl_only", pnl: { periodMonths: 12, supportingBankStatements: true } }), p)).toBe(80);
  });

  it("separates Zuma Silver full-doc and alt-doc columns", () => {
    const p = program("Zuma Silver");
    expect(deriveMaxLtv(scenario({ fico: 740, incomeDocType: "full_doc" }), p)).toBe(90);
    expect(deriveMaxLtv(scenario({ fico: 740, incomeDocType: "bank_statement" }), p)).toBe(80);
    expect(deriveMaxLtv(scenario({ fico: 740, incomeDocType: "full_doc", propertyType: "condo" }), p)).toBe(85);
  });

  it("preserves DSCR Prime ratio bands and disallows uncovered combinations", () => {
    const p = program("DSCR Prime");
    const base = { incomeDocType: "dscr" as const, occupancy: "investment" as const, fico: 720 };
    expect(deriveMaxLtv(scenario(base), p, 1.2)).toBe(80);
    expect(deriveMaxLtv(scenario(base), p, 1.1)).toBe(75);
    expect(deriveMaxLtv(scenario({ ...base, fico: 640, loanPurpose: "cash_out_refinance" }), p, 1.1)).toBe(0);
    expect(p.strIncomeEligible).toBe(false);
    expect(p.itinDscrEligible).toBe(false);
  });

  it("models ITIN score, purpose, no-FICO and Alt-Doc restrictions", () => {
    const p = program("ITIN Non-QM");
    const base = { citizenship: "itin" as const, incomeDocType: "bank_statement" as const, fico: 660 };
    expect(deriveMaxLtv(scenario(base), p)).toBe(80);
    expect(deriveMaxLtv(scenario({ ...base, loanPurpose: "cash_out_refinance" }), p)).toBe(0);
    expect(deriveMaxLtv(scenario({ ...base, incomeDocType: "full_doc", fico: 700, loanPurpose: "cash_out_refinance" }), p)).toBe(65);
    expect(p.noFicoPolicy).toBe("eligible_with_alternative_credit");
  });

  it("keeps the two closed-end-second matrices separate and uses CLTV", () => {
    const prime = program("Prime Closed-End Second — Bank Statement");
    expect(prime.ltvMetric).toBe("cltv");
    expect(deriveMaxLtv(scenario({ loanPurpose: "second_lien", lienPosition: "standalone_second", occupancy: "second_home", requestedLoanAmount: 350_000, fico: 700, incomeDocType: "bank_statement" }), prime)).toBe(75);
    const jmac = program("JMAC Closed-End Second");
    expect(deriveMaxLtv(scenario({ loanPurpose: "second_lien", lienPosition: "standalone_second", requestedLoanAmount: 350_000, fico: 740, incomeDocType: "bank_statement" }), jmac)).toBe(85);
  });

  it("routes a DU/LPA jumbo to Jumbo Plus rather than manual jumbo", () => {
    const aus = program("Jumbo Plus — AUS");
    expect(deriveMaxLtv(scenario({ requestedLoanAmount: 2_000_000, fico: 700 }), aus)).toBe(80);
    expect(aus.notes).toContain("Agency-style jumbo");
    expect(program("Monterey Non-Conforming Jumbo").notes).toContain("Manual/full-doc jumbo");
  });

  it("flags comparison-only programs for human matrix confirmation", () => {
    const venice = program("Venice DSCR");
    const calc = { results: [], ltv: { value: 70, source: "test" }, dscr: { value: 0.8, source: "test" } } as never;
    const checks = baseProgramChecks(scenario({ incomeDocType: "dscr", occupancy: "investment", citizenship: "foreign_national", fico: 700 }), calc, venice);
    expect(checks.find((r) => r.ruleName === "Current lender matrix confirmation")?.outcome).toBe("manual_review");
    expect(venice.matrixConfirmationNotes).toContain("Verification Required");
  });

  it("preserves P&L as the income document rather than requiring tax returns", () => {
    for (const name of ["Zuma Gold", "Zuma Silver", "JMAC Limited Doc — WVOE / P&L", "Newport Non-Conforming — Alt Doc / ITIN", "Zuma Prime"]) {
      expect(program(name).pnlTaxReturnsRequired).toBe(false);
    }
  });
});
