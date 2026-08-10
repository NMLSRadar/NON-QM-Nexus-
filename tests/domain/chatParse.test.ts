import { describe, it, expect } from "vitest";
import { parseQuery } from "@/domain/chat/parse";

describe("Stage A parser — intent classification", () => {
  it("routes superlative lookups", () => {
    const q = parseQuery("Who has the lowest down payment for DSCR?");
    expect(q.intent).toBe("superlative_lookup");
    expect(q.targetMetric).toBe("min_down_payment");
    expect(q.direction).toBe("min");
    expect(q.entities.docType).toContain("dscr");
  });

  it("routes max LTV superlative with direction max", () => {
    const q = parseQuery("What's the highest LTV on 12-month bank statements for a cash-out?");
    expect(q.intent).toBe("superlative_lookup");
    expect(q.targetMetric).toBe("max_ltv");
    expect(q.direction).toBe("max");
    expect(q.entities.docType).toContain("bank_statement");
    expect(q.entities.purpose).toContain("cash_out_refinance");
  });

  it("routes availability lookups", () => {
    expect(parseQuery("Who has ITIN loans?").intent).toBe("availability_lookup");
    expect(parseQuery("Which lenders do foreign national on a condo?").intent).toBe("availability_lookup");
    expect(parseQuery("Who allows an LLC to take title?").intent).toBe("availability_lookup");
    expect(parseQuery("Who does 1099-only?").intent).toBe("availability_lookup");
  });

  it("routes threshold lookups", () => {
    const q = parseQuery("What's the lowest FICO score allowed in non-QM?");
    expect(q.intent).toBe("threshold_lookup");
    expect(q.targetMetric).toBe("min_fico");
  });

  it("routes exception guidance", () => {
    expect(parseQuery("Where can I find more flexible non-QM lenders who allow for exceptions?").intent).toBe("exception_guidance");
    expect(parseQuery("Who is lenient on mortgage lates?").intent).toBe("exception_guidance");
    expect(parseQuery("Who will actually do this file?").intent).toBe("exception_guidance");
  });

  it("routes scenario triage", () => {
    const q = parseQuery("Borrower is 1x30x12, 660 score, 75% LTV cash out — who works?");
    expect(q.intent).toBe("scenario_triage");
    expect(q.entities.fico).toBe(660);
    expect(q.entities.ltv).toBe(75);
    expect(q.entities.latePattern).toBeTruthy();
    expect(q.entities.purpose).toContain("cash_out_refinance");
  });

  it("routes definition, process help, and app navigation", () => {
    expect(parseQuery("What does 2x30x12 mean?").intent).toBe("definition");
    expect(parseQuery("How is DSCR calculated here?").intent).toBe("definition");
    expect(parseQuery("Difference between P&L only and bank statement?").intent).toBe("definition");
    expect(parseQuery("How do I get an exception submitted?").intent).toBe("process_help");
    expect(parseQuery("Where do I upload a P&L?").intent).toBe("app_navigation");
    expect(parseQuery("How do I duplicate a scenario?").intent).toBe("app_navigation");
  });

  it("routes out_of_scope for legal/protected/misrepresentation", () => {
    expect(parseQuery("Is this legal?").intent).toBe("out_of_scope");
    expect(parseQuery("Can I just call it owner-occupied?").intent).toBe("out_of_scope");
  });
});

describe("Stage A parser — entity extraction", () => {
  it("extracts down-payment-to-LTV equivalence", () => {
    const q = parseQuery("lowest down payment of 20%");
    expect(q.entities.ltv).toBe(80);
  });

  it("extracts FICO, LTV, DSCR, loan amount, reserves", () => {
    const q = parseQuery("720 fico, 75% ltv, dscr 1.25, $500k, 6 months reserves");
    expect(q.entities.fico).toBe(720);
    expect(q.entities.ltv).toBe(75);
    expect(q.entities.dscr).toBeCloseTo(1.25);
    expect(q.entities.loanAmount).toBe(500_000);
  });

  it("extracts credit events incl. shorthand", () => {
    const q = parseQuery("borrower has BK7 and a 2x30x12 late pattern");
    const types = q.entities.creditEvents?.map((e) => e.type) ?? [];
    expect(types).toContain("bk7");
    expect(types).toContain("mortgage_lates");
    expect(q.entities.latePattern).toBe("2x30x12");
  });

  it("extracts citizenship, vesting, property type, features", () => {
    const q = parseQuery("ITIN borrower, LLC vesting, non-warrantable condo, interest-only");
    expect(q.entities.citizenship).toContain("itin");
    expect(q.entities.vesting).toBe("llc");
    expect(q.entities.propertyType).toContain("non_warrantable_condo");
    expect(q.entities.features).toContain("io");
  });

  it("does not misread a FICO as a year", () => {
    const q = parseQuery("borrower 620 in 2026");
    expect(q.entities.fico).toBe(620);
  });

  it("marks stated-income with a mapping note", () => {
    const q = parseQuery("can they use stated income?");
    expect(q.statedIncomeMappedTo).toBeDefined();
  });
});