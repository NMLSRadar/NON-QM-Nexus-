import { describe, expect, it } from "vitest";
import type { ProgramCatalog } from "@/domain/analyze";
import type { Lender, Program } from "@/domain/types/program";
import {
  buildCatalogDiscoveryFallback,
  buildRelevantGuidelineContext,
  MAX_ASSISTANT_GUIDELINE_CONTEXT_CHARS,
} from "@/lib/ai/assistantCatalogContext";

function lender(id: string, name = `Lender ${id}`): Lender {
  return { id, organizationId: "org", name, isSampleData: false, active: true, tierLevel: 1 };
}

function program(id: string, lenderId: string, overrides: Partial<Program> = {}): Program {
  return {
    id,
    lenderId,
    organizationId: "org",
    name: `Program ${id}`,
    isSampleData: false,
    active: true,
    incomeDocTypes: ["bank_statement"],
    loanPurposes: ["purchase"],
    occupancies: ["primary"],
    propertyTypes: ["single_family"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen"],
    vestingEligible: ["individual"],
    minLoanAmount: 100_000,
    maxLoanAmount: 2_000_000,
    minFico: 660,
    baseMaxLtv: 80,
    minReservesMonths: 6,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "g1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "verified guideline",
    ...overrides,
  };
}

describe("chatbot catalog context reliability", () => {
  it("routes a P&L question to P&L products without sending unrelated Bank Statement products", () => {
    const catalog: ProgramCatalog = {
      lenders: [lender("pnl", "P&L Lender"), lender("bank", "Bank Lender")],
      programs: [
        program("pnl", "pnl", {
          name: "P&L Only",
          incomeDocTypes: ["pnl_only"],
          pnlOnlyAvailable: true,
          pnlMaxLtv: 85,
          pnlTaxReturnsRequired: false,
          pnlSupportingStatementMonths: 2,
        }),
        program("bank", "bank", { name: "12 Month Bank Statement" }),
      ],
      rules: [],
    };

    const context = buildRelevantGuidelineContext(catalog, "Who does P&L Only loans?");
    expect(context).toContain("P&L Lender");
    expect(context).toContain('"pnlMaxLtv":85');
    expect(context).toContain('"pnlSupportingStatementMonths":2');
    expect(context).not.toContain("Bank Lender");
  });

  it("hard-caps even an oversized 500-program catalog below the runtime prompt ceiling", () => {
    const lenders = Array.from({ length: 500 }, (_, index) => lender(`l${index}`));
    const programs = lenders.map((item, index) =>
      program(`p${index}`, item.id, {
        incomeDocTypes: ["pnl_only"],
        pnlOnlyAvailable: true,
        pnlMaxLtv: index % 2 ? 80 : 85,
        pnlNotes: "Verified P&L requirements. ".repeat(250),
      }),
    );
    const context = buildRelevantGuidelineContext({ lenders, programs, rules: [] }, "P&L Only lenders");
    expect(context.length).toBeLessThanOrEqual(MAX_ASSISTANT_GUIDELINE_CONTEXT_CHARS);
    expect(context).toContain("contextLimitNotice");
  });

  it("provides a deterministic verified-product answer if the upstream AI provider is unavailable", () => {
    const catalog: ProgramCatalog = {
      lenders: [lender("exact", "Exact P&L Lender"), lender("unverified", "Unverified Lender")],
      programs: [
        program("exact", "exact", {
          name: "Verified P&L Only",
          incomeDocTypes: ["pnl_only"],
          pnlOnlyAvailable: true,
          pnlMaxLtv: 85,
        }),
        program("unverified", "unverified", {
          name: "Unverified P&L Tag",
          incomeDocTypes: ["pnl_only"],
          pnlOnlyAvailable: false,
        }),
      ],
      rules: [],
    };

    const reply = buildCatalogDiscoveryFallback(catalog, "Who does P&L Only loans?");
    expect(reply).toContain("Exact P&L Lender");
    expect(reply).toContain("85% LTV");
    expect(reply).not.toContain("Unverified Lender");
    expect(reply).toContain("not an approval");
  });
});
