import { describe, expect, it } from "vitest";
import { generateNeedsList } from "@/domain/matching/needsList";
import type { Scenario } from "@/domain/types/scenario";

// Per user direction (2026-07-28): the document-needs list must include
// the 1003, MISMO 3.4, and the exact per-loan-type items the user
// specified (2 months bank/asset statements for down payment; a mortgage
// statement on refinance; ITIN's second ID + both pages of the ITIN
// letter; Foreign National's separate passport/visa + translated foreign
// statements; Full Doc's exact W-2/tax-return/pay-stub counts).
function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s1",
    organizationId: "org1",
    name: "Test",
    createdByUserId: "u1",
    loanPurpose: "purchase",
    citizenship: "us_citizen",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  } as Scenario;
}

function labels(items: ReturnType<typeof generateNeedsList>): string[] {
  return items.map((i) => i.label);
}

describe("Document needs list — universal items", () => {
  it("always includes the 1003 and the MISMO 3.4 data file", () => {
    const items = labels(generateNeedsList(scenario()));
    expect(items.some((l) => l.includes("1003"))).toBe(true);
    expect(items.some((l) => l.includes("MISMO 3.4"))).toBe(true);
  });

  it("includes the 2-month down-payment/closing-cost asset statement item", () => {
    const items = labels(generateNeedsList(scenario()));
    expect(items.some((l) => l.toLowerCase().includes("down payment and closing costs"))).toBe(true);
  });

  it("requires a purchase contract on purchase and a mortgage statement on refinance", () => {
    const purchase = labels(generateNeedsList(scenario({ loanPurpose: "purchase" })));
    expect(purchase.some((l) => l.toLowerCase().includes("purchase contract"))).toBe(true);

    const refi = labels(generateNeedsList(scenario({ loanPurpose: "rate_term_refinance" })));
    expect(refi.some((l) => l.toLowerCase().includes("mortgage statement"))).toBe(true);
  });
});

describe("Document needs list — Bank Statement", () => {
  it("includes the correct months and personal/business statement type", () => {
    const items = labels(
      generateNeedsList(scenario({ incomeDocType: "bank_statement", bankStatement: { personalOrBusiness: "business", months: 24 } })),
    );
    expect(items.some((l) => l.includes("24 months") && l.includes("business"))).toBe(true);
  });
});

describe("Document needs list — Profit & Loss Only", () => {
  it("includes the P&L statement and the program-dependent supporting bank statements", () => {
    const items = labels(generateNeedsList(scenario({ incomeDocType: "pnl_only" })));
    expect(items.some((l) => l.toLowerCase().includes("profit-and-loss"))).toBe(true);
    expect(items.some((l) => l.toLowerCase().includes("business bank statements"))).toBe(true);
  });
});

describe("Document needs list — Foreign National", () => {
  it("splits passport and visa into two distinct items and includes the translated-statement caveat", () => {
    const items = labels(generateNeedsList(scenario({ citizenship: "foreign_national" })));
    expect(items.some((l) => l.toLowerCase().includes("passport"))).toBe(true);
    expect(items.some((l) => l.toLowerCase().includes("visa"))).toBe(true);
    expect(items.some((l) => l.toLowerCase().includes("translation"))).toBe(true);
  });
});

describe("Document needs list — ITIN", () => {
  it("requires both pages of the ITIN letter and a second form of ID", () => {
    const items = labels(generateNeedsList(scenario({ citizenship: "itin" })));
    expect(items.some((l) => l.toLowerCase().includes("both pages"))).toBe(true);
    expect(items.some((l) => l.toLowerCase().includes("second form of identification"))).toBe(true);
  });

  it("still pulls in the correct income-documentation items for whichever doc type the ITIN borrower uses", () => {
    const bankStatementItin = labels(
      generateNeedsList(scenario({ citizenship: "itin", incomeDocType: "bank_statement", bankStatement: { personalOrBusiness: "business", months: 12 } })),
    );
    expect(bankStatementItin.some((l) => l.includes("12 months"))).toBe(true);

    const fullDocItin = labels(generateNeedsList(scenario({ citizenship: "itin", incomeDocType: "full_doc" })));
    expect(fullDocItin.some((l) => l.toLowerCase().includes("w-2s for the past two years"))).toBe(true);
  });
});

describe("Document needs list — Full Documentation", () => {
  it("breaks income documentation into the exact requested pieces: W-2s (2 yrs), tax returns (2 yrs), pay stubs (1 month)", () => {
    const items = labels(generateNeedsList(scenario({ incomeDocType: "full_doc" })));
    expect(items.some((l) => l.toLowerCase() === "w-2s for the past two years")).toBe(true);
    expect(items.some((l) => l.toLowerCase().includes("tax returns for the past two years"))).toBe(true);
    expect(items.some((l) => l.toLowerCase().includes("one month of pay stubs"))).toBe(true);
  });
});
