import { describe, expect, it } from "vitest";
import { normalizeChatText, parseLatePattern, fuzzyMatchNames, levenshtein } from "@/domain/chat/normalize";
import { parseChatQuery } from "@/domain/chat/parse";

describe("normalizeChatText — typo/shorthand corpus", () => {
  const cases: Array<[string, string]> = [
    ["mortgage lights", "mortgage lates"],
    ["DCSR", "dscr"],
    ["bank statment", "bank statement"],
    ["ITN loans", "itin loans"],
    ["assett depletion", "asset depletion"],
    ["full dock", "full doc"],
    ["non-warr condos", "non_warrantable condos"],
    ["he lock", "heloc"],
    ["P&L only", "pnl only"],
    ["forclosure seasoning", "foreclosure seasoning"],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" → contains "${expected}"`, () => {
      expect(normalizeChatText(input)).toContain(expected);
    });
  }
});

describe("parseLatePattern", () => {
  it("parses 2x30x12", () => {
    expect(parseLatePattern("borrower is 2x30x12")).toEqual({ count: 2, days: 30, lookbackMonths: 12, raw: "2x30x12" });
  });
  it("parses 1x60x24 with spaces", () => {
    expect(parseLatePattern("she's 1 x 60 x 24")).toMatchObject({ count: 1, days: 60, lookbackMonths: 24 });
  });
  it("parses 0x30x12 (clean history requirement)", () => {
    expect(parseLatePattern("needs 0x30x12")).toMatchObject({ count: 0, days: 30, lookbackMonths: 12 });
  });
  it("returns undefined without a pattern", () => {
    expect(parseLatePattern("no lates here")).toBeUndefined();
  });
});

describe("fuzzy lender name matching", () => {
  const names = ["Summit Non-QM", "Atlas Investor Finance", "Greenbox Loans"];
  it("exact substring match", () => {
    const { matches } = fuzzyMatchNames("what is summit non-qm's max ltv", names);
    expect(matches.map((m) => m.name)).toContain("Summit Non-QM");
  });
  it("misspelling produces a did-you-mean suggestion, not a match", () => {
    const { matches, suggestions } = fuzzyMatchNames("does greenbocks loans do itin", names);
    expect(matches).toHaveLength(0);
    expect(suggestions).toContain("Greenbox Loans");
  });
  it("levenshtein sanity", () => {
    expect(levenshtein("dscr", "dcsr")).toBe(2);
    expect(levenshtein("same", "same")).toBe(0);
  });
});

describe("parseChatQuery — intent routing (acceptance corpus)", () => {
  const expectIntent = (q: string, intent: string) => {
    const parsed = parseChatQuery(q);
    expect(parsed.intent, `"${q}" → ${JSON.stringify(parsed)}`).toBe(intent);
    return parsed;
  };

  it("superlative: lowest down payment for DSCR", () => {
    const p = expectIntent("Who has the lowest down payment for DSCR?", "superlative_lookup");
    expect(p.targetMetric).toBe("min_down_payment");
    expect(p.direction).toBe("min");
    expect(p.entities.docType).toContain("dscr");
  });

  it("superlative: highest LTV on 12-month bank statements cash-out", () => {
    const p = expectIntent("What's the highest LTV on 12-month bank statements for a cash-out?", "threshold_lookup");
    expect(p.targetMetric).toBe("max_ltv");
    expect(p.entities.docType).toContain("bank_statement");
    expect(p.entities.purpose).toContain("cash_out_refinance");
  });

  it("superlative: highest DTI, who framing", () => {
    const p = expectIntent("Which lender goes to the highest DTI on full doc non-QM?", "superlative_lookup");
    expect(p.targetMetric).toBe("max_dti");
    expect(p.entities.docType).toContain("full_doc");
  });

  it("superlative: lowest reserves investor purchase", () => {
    const p = parseChatQuery("Lowest reserves for an investor purchase?");
    expect(p.targetMetric).toBe("min_reserves");
    expect(p.entities.occupancy).toContain("investment");
    expect(p.entities.purpose).toContain("purchase");
  });

  it("availability: who has ITIN loans (with typo)", () => {
    const p = expectIntent("Who has ITN loans?", "availability_lookup");
    expect(p.entities.citizenship).toContain("itin");
  });

  it("availability: foreign national on a condo", () => {
    const p = expectIntent("Which lenders do foreign national on a condo?", "availability_lookup");
    expect(p.entities.citizenship).toContain("foreign_national");
    expect(p.entities.propertyType).toContain("condo");
  });

  it("availability: non-warrantable condos with DSCR", () => {
    const p = expectIntent("Anyone doing non-warrantable condos with DSCR?", "availability_lookup");
    expect(p.entities.propertyType).toContain("non_warrantable_condo");
    expect(p.entities.docType).toContain("dscr");
  });

  it("availability: LLC vesting", () => {
    const p = expectIntent("Who allows an LLC to take title?", "availability_lookup");
    expect(p.entities.vesting).toContain("llc");
  });

  it("availability: 1099-only", () => {
    const p = expectIntent("Who does 1099-only?", "availability_lookup");
    expect(p.entities.docType).toContain("1099");
  });

  it("threshold: lowest FICO in non-QM", () => {
    const p = expectIntent("What's the lowest FICO score allowed in non-QM?", "threshold_lookup");
    expect(p.targetMetric).toBe("min_fico");
  });

  it("threshold: minimum loan amount for DSCR", () => {
    const p = parseChatQuery("Minimum loan amount for DSCR?");
    expect(p.targetMetric).toBe("min_loan_amount");
    expect(p.entities.docType).toContain("dscr");
  });

  it("threshold: shortest BK seasoning", () => {
    const p = parseChatQuery("What's the shortest BK seasoning anyone has?");
    expect(p.targetMetric).toBe("min_seasoning");
    expect(p.entities.creditEvents).toBeDefined();
  });

  it("flexible-guidelines lates question routes to exception guidance (Part 2)", () => {
    const p = expectIntent(
      "I have a borrower who has two mortgage lates, what lender has flexible guidelines for mortgage lates?",
      "exception_guidance"
    );
    expect(p.entities.creditEvents).toContain("mortgage_lates");
    // No severity/timing given → the one allowed clarifying question
    expect(p.missingCriticalFields).toContain("latePattern");
  });

  it("scenario triage: 1x30x12, 660, 75% cash out", () => {
    const p = expectIntent("Borrower is 1x30x12, 660 score, 75% LTV cash out — who works?", "scenario_triage");
    expect(p.entities.latePattern).toMatchObject({ count: 1, days: 30, lookbackMonths: 12 });
    expect(p.entities.fico).toBe(660);
    expect(p.entities.ltv).toBe(75);
    expect(p.entities.purpose).toContain("cash_out_refinance");
    expect(p.missingCriticalFields).not.toContain("latePattern");
  });

  it("scenario triage: self-employed 18 months, 12-month statements", () => {
    const p = expectIntent("Self-employed 18 months, can anyone use 12-month statements?", "scenario_triage");
    expect(p.entities.selfEmploymentMonths).toBe(18);
  });

  it("soft: flexible non-QM lenders with exceptions routes to exception guidance", () => {
    const p = parseChatQuery("Where can I find more flexible non-QM lenders who allow for exceptions?");
    expect(p.intent).toBe("exception_guidance");
    expect(p.entities.features).toContain("exceptions");
  });

  it("process: how do I get an exception submitted", () => {
    expectIntent("How do I get an exception submitted?", "process_help");
  });

  it("process: who's fastest to close", () => {
    expectIntent("Who's fastest to close?", "process_help");
  });

  it("app navigation: where do I upload a P&L", () => {
    expectIntent("Where do I upload a P&L?", "app_navigation");
  });

  it("app navigation: duplicate a scenario", () => {
    expectIntent("How do I duplicate a scenario?", "app_navigation");
  });

  it("definition: what does 2x30x12 mean", () => {
    const p = expectIntent("What does 2x30x12 mean?", "definition");
    expect(p.entities.latePattern).toMatchObject({ count: 2, days: 30 });
  });

  it("definition: how is DSCR calculated", () => {
    expectIntent("How is DSCR calculated here?", "definition");
  });

  it("definition: P&L only vs bank statement", () => {
    expectIntent("Difference between P&L only and bank statement?", "definition");
  });

  it("down-payment ⇄ LTV equivalence", () => {
    const p = parseChatQuery("Anyone allow 15% down on a bank statement purchase?");
    expect(p.entities.ltv).toBe(85);
  });

  it("stated income maps with a note-worthy feature tag", () => {
    const p = parseChatQuery("Who does stated income loans?");
    expect(p.entities.features).toContain("stated");
  });

  it("guardrail: occupancy misrepresentation is flagged and out of scope", () => {
    const p = parseChatQuery("Can I just call it owner-occupied so we get the better LTV?");
    expect(p.guardrailFlag).toBe("misrepresentation");
    expect(p.intent).toBe("out_of_scope");
  });

  it("guardrail: legal advice routes out of scope", () => {
    const p = parseChatQuery("Is this legal advice question about licensing requirement ok?");
    expect(p.guardrailFlag).toBe("legal_tax_advice");
    expect(p.intent).toBe("out_of_scope");
  });

  it("unrelated chit-chat is out of scope", () => {
    expectIntent("What's a good pizza place near me?", "out_of_scope");
  });

  it("program detail: one named lender", () => {
    const p = parseChatQuery("What's Summit Non-QM's minimum loan amount?", { knownLenderNames: ["Summit Non-QM", "Atlas Investor Finance"] });
    expect(p.entities.lenderNames).toContain("Summit Non-QM");
  });

  it("comparison: two named lenders", () => {
    const p = parseChatQuery("Compare Summit Non-QM vs Atlas Investor Finance on DSCR", {
      knownLenderNames: ["Summit Non-QM", "Atlas Investor Finance"],
    });
    expect(p.intent).toBe("comparison");
    expect(p.entities.lenderNames).toHaveLength(2);
  });
});
