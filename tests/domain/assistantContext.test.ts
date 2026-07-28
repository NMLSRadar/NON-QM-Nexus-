import { describe, expect, it } from "vitest";
import { buildGuidelineContext, ASSISTANT_SYSTEM_PROMPT } from "@/lib/ai/assistantContext";
import type { ProgramCatalog } from "@/domain/analyze";
import type { Lender, Program } from "@/domain/types/program";

// Per user direction (2026-07-28): the conversational AI assistant should
// intuitively route "hair on it" / complicated-file language to the
// bank-statement-flexible curated group, ITIN questions to the
// itin-specialist curated group, and know general Non-QM facts (10% min
// down on bank statement, FICO-conditional) — all grounded in the REAL
// catalog's admin-set flags, never a static list baked into the prompt
// disconnected from what an admin actually curated.
function lender(id: string, name: string): Lender {
  return { id, organizationId: "org1", name, isSampleData: false, active: true, tierLevel: 1 };
}
function program(overrides: Partial<Program>): Program {
  return {
    id: "p1",
    lenderId: "l1",
    organizationId: "org1",
    name: "Test Program",
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
    baseMaxLtv: 90,
    minReservesMonths: 6,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: [],
    guidelineVersionId: "g1",
    guidelineVersionLabel: "v1",
    effectiveDate: "2026-01-01",
    sourceCitation: "test",
    ...overrides,
  };
}

describe("Assistant context — editorial routing flags are serialized so the assistant can route from real data", () => {
  it("includes bankStatementFlexible/itinSpecialist/foreignNationalSpecialist/bankStatementCleanExecution in the serialized catalog", () => {
    const catalog: ProgramCatalog = {
      lenders: [lender("l1", "Orion Lending"), lender("l2", "ACC Mortgage")],
      programs: [
        program({ id: "p1", lenderId: "l1", name: "Titan Flex — Bank Statement", bankStatementFlexible: true }),
        program({ id: "p2", lenderId: "l2", name: "ITIN Mortgage Program", citizenshipEligible: ["itin"], itinSpecialist: true }),
      ],
      rules: [],
    };
    const context = buildGuidelineContext(catalog);
    expect(context).toContain('"bankStatementFlexible":true');
    expect(context).toContain('"itinSpecialist":true');
    expect(context).toContain("Orion Lending");
    expect(context).toContain("ACC Mortgage");
  });

  it("defaults every editorial flag to false when unset, rather than omitting the field", () => {
    const catalog: ProgramCatalog = {
      lenders: [lender("l1", "Test Lender")],
      programs: [program({})],
      rules: [],
    };
    const context = buildGuidelineContext(catalog);
    expect(context).toContain('"foreignNationalSpecialist":false');
    expect(context).toContain('"itinSpecialist":false');
    expect(context).toContain('"bankStatementCleanExecution":false');
    expect(context).toContain('"bankStatementFlexible":false');
  });
});

describe("Assistant system prompt — slang comprehension, grounded routing, and general knowledge", () => {
  it("teaches the 'hair on it' / complicated-file slang mapping", () => {
    expect(ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toContain("hair on it");
  });

  it("teaches an expanded real broker-slang vocabulary beyond the original starter set", () => {
    const complicatedSlang = [
      "story loan",
      "thick file",
      "scratch and dent",
      "overlay issue",
      "doesn't fit the matrix",
      "thin file",
      "needs manual underwriting",
    ];
    const cleanSlang = ["textbook", "picture perfect", "squeaky clean", "slam dunk", "golden borrower"];
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    for (const phrase of complicatedSlang) expect(lower, phrase).toContain(phrase);
    for (const phrase of cleanSlang) expect(lower, phrase).toContain(phrase);
  });

  it("instructs the assistant to interpret novel slang by meaning, not just match this exact list", () => {
    expect(ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toContain("not listed here");
  });

  it("instructs routing from the real bankStatementFlexible/itinSpecialist/foreignNationalSpecialist flags, not a hardcoded list", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("bankStatementFlexible");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("itinSpecialist");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("foreignNationalSpecialist");
    expect(ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toMatch(/read the actual flag|catalog data you were given/);
  });

  it("states the 10% bank-statement minimum down payment as conditional on FICO, not unconditional", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/10%/);
    expect(ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toContain("fico");
  });

  it("ITIN expert reasoning: states the real 15%-down market standard AND the real GreenBox 89% LTV exception with its caveats", () => {
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("15% down");
    expect(lower).toContain("85% ltv");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("GreenBox Loans");
    expect(lower).toContain("89% ltv");
    expect(lower).toMatch(/stricter qualification|more restrictive/);
    expect(lower).toContain("account executive");
    expect(lower).toMatch(/not every itin borrower/);
  });

  it("P&L Only expert reasoning: states the 80% LTV standard, the 85% exception, and its 2-month bank-statement dependency", () => {
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("80% ltv");
    expect(lower).toContain("85% ltv");
    expect(lower).toContain("2 months of business bank statements");
    expect(lower).toMatch(/capped at 80%|generally be capped/);
  });

  it("DSCR expert reasoning: states 85% LTV availability but explains the mechanical LTV-vs-DSCR-ratio tradeoff", () => {
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("85% ltv");
    expect(lower).toContain("dscr ratio");
    expect(lower).toMatch(/pitia/);
    expect(lower).toMatch(/not every property will support/);
  });

  it("Asset Depletion expert reasoning: states the real LTV tiers and the asset-divisor mechanic", () => {
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("asset depletion");
    expect(lower).toContain("80% ltv");
    expect(lower).toMatch(/asset divisor/);
    expect(lower).toMatch(/shorter divisor produces a higher/);
  });

  it("Foreign National expert reasoning: distinguishes dedicated FN programs from citizenship-capped general DSCR programs", () => {
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("foreign national loans");
    expect(lower).toMatch(/70-75% ltv/);
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("Acra Lending's Platinum DSCR");
    expect(lower).toMatch(/citizenship-specific ltv cap/);
    expect(lower).toContain("12 months");
  });

  it("clarifies the assistant's role is directional guidance, not guideline clarification — that's the AE's job", () => {
    expect(ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toContain("account executive");
    expect(ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toContain("not a guideline-clarification");
  });

  it("still requires every claim to trace to the real catalog, never fabricate a lender", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/never invent, assume, or recall lender facts/);
  });
});
