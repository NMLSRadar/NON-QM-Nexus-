import { describe, expect, it } from "vitest";
import type { ProgramCatalog } from "@/domain/analyze";
import type { Lender, Program } from "@/domain/types/program";
import {
  buildCatalogDiscoveryFallback,
  buildMarketAvailabilityContext,
  buildRelevantGuidelineContext,
  MAX_ASSISTANT_GUIDELINE_CONTEXT_CHARS,
} from "@/lib/ai/assistantCatalogContext";
import { ASSISTANT_SYSTEM_PROMPT } from "@/lib/ai/assistantContext";

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

  it("computes market-wide availability and extrema instead of treating one conservative row as the market", () => {
    const lenders = Array.from({ length: 6 }, (_, index) => lender(`l${index}`, `Lender ${index}`));
    const programs = [
      program("dscr-0", "l0", {
        incomeDocTypes: ["dscr"],
        occupancies: ["investment"],
        minDscr: 0,
        baseMaxLtv: 65,
        vestingEligible: ["llc"],
      }),
      program("dscr-1", "l1", {
        incomeDocTypes: ["dscr"],
        occupancies: ["investment"],
        minDscr: 0.75,
        baseMaxLtv: 85,
        strIncomeEligible: true,
        strIncomeNotes: "Projected AirDNA may be used on purchases.",
        propertyTypes: ["single_family", "rural"],
        vestingEligible: ["llc", "trust"],
      }),
      program("dscr-2", "l2", {
        incomeDocTypes: ["dscr"],
        occupancies: ["investment"],
        minDscr: 1,
        baseMaxLtv: 80,
        vestingEligible: ["llc"],
      }),
      program("dscr-3", "l3", {
        incomeDocTypes: ["dscr"],
        occupancies: ["investment"],
        minDscr: 1,
        baseMaxLtv: 75,
        vestingEligible: ["llc"],
      }),
      program("bank-low", "l4", { minFico: 500, baseMaxLtv: 65 }),
      program("bank-fthb", "l5", { minFico: 700, baseMaxLtv: 90, firstTimeHomebuyerAllowed: true }),
      program("sample-no-ratio", "l5", { incomeDocTypes: ["dscr"], minDscr: 0, isSampleData: true }),
    ];
    const snapshot = JSON.parse(buildMarketAvailabilityContext({ lenders, programs, rules: [] }));

    expect(snapshot.dscr.availability).toBe("common");
    expect(snapshot.dscr.lowestVerifiedDscr).toBe(0);
    expect(snapshot.dscr.highestVerifiedPurchaseLtv).toBe(85);
    expect(snapshot.dscr.noRatio.lenders).toEqual(["Lender 0"]);
    expect(snapshot.dscr.strIncome.lenders).toEqual(["Lender 1"]);
    expect(snapshot.bankStatement.lowestVerifiedFico).toBe(500);
    expect(snapshot.bankStatement.firstTimeHomebuyerAt90Ltv.lenders).toEqual(["Lender 5"]);
    expect(snapshot.ruralProperty.lenders).toEqual(["Lender 1"]);
    expect(snapshot.trustVesting.lenders).toEqual(["Lender 1"]);
  });

  it("sends verified STR income details with DSCR questions", () => {
    const context = buildRelevantGuidelineContext(
      {
        lenders: [lender("str", "STR Lender")],
        programs: [
          program("str", "str", {
            incomeDocTypes: ["dscr"],
            strIncomeEligible: true,
            strIncomeNotes: "AirDNA allowed for purchase qualification.",
          }),
        ],
        rules: [],
      },
      "Which DSCR lenders allow short-term rental income?",
    );
    expect(context).toContain('\"strIncomeEligible\":true');
    expect(context).toContain("AirDNA allowed for purchase qualification");
  });

  it("locks the conversational, reality-driven answer contract into the prompt", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("Technically available");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("commonly available");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("The lowest DSCR ratio you're going to find is essentially 0.00");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("The maximum LTV available on a DSCR purchase is 85% LTV");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("LLC vesting is extremely common on DSCR loans");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("A first-time homebuyer can get to 90% LTV using bank statements");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("Do not invent precision");
  });
});
