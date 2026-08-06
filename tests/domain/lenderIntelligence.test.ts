import { describe, expect, it, } from "vitest";
import {
  classifyDscrBorrower,
  evaluateDscrUniverse,
  pickDepositPriority,
  resolveSeededProfiles,
  routeExceptions,
  normalizeLenderName,
  COMPENSATING_FACTOR_KEYS,
  DEPOSIT_UTILIZATION_DISCLOSURE,
  EXCEPTION_DISCLOSURE,
} from "@/domain/lenderIntelligence";
import { buildLenderIntelligenceContext, extractAssistantVitals, ASSISTANT_SYSTEM_PROMPT } from "@/lib/ai/assistantContext";
import type { Lender, Program } from "@/domain/types/program";
import type { ProgramCatalog } from "@/domain/analyze";

function lender(id: string, name: string, overrides: Partial<Lender> = {}): Lender {
  return { id, organizationId: "org1", name, isSampleData: false, active: true, tierLevel: 1, ...overrides };
}
function program(overrides: Partial<Program>): Program {
  return {
    id: "p1",
    lenderId: "l1",
    organizationId: "org1",
    name: "Test Program",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase"],
    occupancies: ["investment"],
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
    sourceCitation: "test",
    ...overrides,
  };
}

const CATALOG: ProgramCatalog = {
  lenders: [
    lender("l1", "Orion Lending"),
    lender("l2", "GreenBox Loans"),
    lender("l3", "Cake Mortgage"),
    lender("l4", "Deep Haven"),
    lender("l5", "Acra Lending"),
    lender("l6", "Forward Lending"),
    lender("l7", "ADRI"),
    lender("l8", "Generic DSCR Co"),
  ],
  programs: [
    // Orion — flagship FTHB/FTI DSCR at 80%, plus bank statement flexibility.
    program({ id: "p1", lenderId: "l1", name: "Orion COIN DSCR", baseMaxLtv: 80, minFico: 700, firstTimeInvestorAllowed: true, firstTimeHomebuyerAllowed: true, bankStatementFlexible: true }),
    // Greenbox — high utilization bank statement + exception friendly.
    program({ id: "p2", lenderId: "l2", name: "GreenBox Bank Statement", incomeDocTypes: ["bank_statement"], baseMaxLtv: 90, firstTimeInvestorAllowed: true, bankStatementFlexible: true }),
    // Cake — exception-friendly but verified terms undisclosed (minFico 0).
    program({ id: "p3", lenderId: "l3", name: "Cake Manual Review", minFico: 0, baseMaxLtv: 0, firstTimeInvestorAllowed: true, bankStatementFlexible: true }),
    // Deep Haven / Acra / Forward — exception friendly DSCR.
    program({ id: "p4", lenderId: "l4", name: "Deep Haven DSCR", baseMaxLtv: 80, firstTimeInvestorAllowed: true }),
    program({ id: "p5", lenderId: "l5", name: "Acra Platinum DSCR", baseMaxLtv: 80, firstTimeInvestorAllowed: true }),
    program({ id: "p6", lenderId: "l6", name: "Forward Scenario DSCR", baseMaxLtv: 75, firstTimeInvestorAllowed: true }),
    // ADRI — FTHB DSCR at 75%.
    program({ id: "p7", lenderId: "l7", name: "ADRI DSCR", baseMaxLtv: 75, minFico: 720, firstTimeHomebuyerAllowed: true, firstTimeInvestorAllowed: true }),
    // Generic experienced-only DSCR — should be EXCLUDED from first-time lists.
    program({ id: "p8", lenderId: "l8", name: "Generic Investor DSCR", baseMaxLtv: 85, experiencedInvestorRequired: true }),
  ],
  rules: [],
};

describe("lenderIntelligence — seeded profile resolution", () => {
  it("normalizes lender names case/space-insensitively", () => {
    expect(normalizeLenderName("  GreenBox   Loans ")).toBe("greenbox loans");
    expect(normalizeLenderName("ORION LENDING")).toBe("orion lending");
  });

  it("resolves only catalog lenders that carry a seeded profile, dropping unknown/sample rows", () => {
    const resolved = resolveSeededProfiles([
      lender("l1", "Orion Lending"),
      lender("l9", "Aceable Sample", { isSampleData: true }),
      lender("l10", "Inactive Co", { active: false }),
      lender("l11", "Unknown Lender"),
    ]);
    expect(resolved.map((r) => r.lender.name)).toEqual(["Orion Lending"]);
  });
});

describe("routeExceptions — catalog flags merged with user-seeded names", () => {
  it("returns curated flexible-flag lenders first, then exception-friendly seeds, de-duplicated", () => {
    const result = routeExceptions(CATALOG);
    // All six seeded exception lenders resolve + all are also bankStatementFlexible-flagged except Deep Haven/Acra/Forward in this fixture.
    expect(result.recommended).toContain("Orion Lending");
    expect(result.recommended).toContain("GreenBox Loans");
    expect(result.recommended).toContain("Cake Mortgage");
    expect(result.recommended).toContain("Deep Haven");
    expect(result.recommended).toContain("Acra Lending");
    expect(result.recommended).toContain("Forward Lending");
    // ADRI & Generic are NOT exception-seeded and not flexible-flagged → excluded.
    expect(result.recommended).not.toContain("ADRI");
    expect(result.recommended).not.toContain("Generic DSCR Co");
    // No duplicates.
    expect(new Set(result.recommended.map(normalizeLenderName)).size).toBe(result.recommended.length);
  });

  it("survives an empty catalog without citing anyone", () => {
    const result = routeExceptions({ lenders: [], programs: [] });
    expect(result.recommended).toEqual([]);
  });
});

describe("pickDepositPriority — 100% business-deposit utilization", () => {
  it("leads with Greenbox and Orion (both seeded high-utilization)", () => {
    const { priorityLenders } = pickDepositPriority(CATALOG);
    expect(priorityLenders[0]).toBe("Orion Lending");
    expect(priorityLenders[1]).toBe("GreenBox Loans");
  });

  it("falls back to admin-curated bank-statement specialists so new uploads enter without code changes", () => {
    const { priorityLenders } = pickDepositPriority(CATALOG);
    // Cake is flexible-flagged too, so it can appear after the two seeds.
    expect(priorityLenders).toContain("Cake Mortgage");
  });

  it("never names an inactive or sample lender", () => {
    const c: ProgramCatalog = {
      lenders: [lender("s", "Orion Lending", { isSampleData: true }), lender("x", "GreenBox Loans")],
      programs: [],
      rules: [],
    };
    const { priorityLenders } = pickDepositPriority(c);
    expect(priorityLenders).toEqual(["GreenBox Loans"]);
  });
});

describe("evaluateDscrUniverse — first-time vs experienced investor routing", () => {
  it("classifies the three borrower axes distinctly per spec §7", () => {
    expect(classifyDscrBorrower({ firstTimeHomebuyer: true })).toBe("first_time_homebuyer_and_investor");
    expect(classifyDscrBorrower({ firstTimeInvestor: true })).toBe("homeowner_first_time_investor");
    expect(classifyDscrBorrower({ firstTimeHomebuyer: false, firstTimeInvestor: false })).toBe("experienced_investor");
    expect(classifyDscrBorrower({})).toBe("unknown");
  });

  it("treats a strong experienced investor as a BROAD universe, not a fixed shortlist", () => {
    const r = evaluateDscrUniverse(CATALOG, { fico: 720, dscr: 1.25, firstTimeInvestor: false, firstTimeHomebuyer: false });
    expect(r.borrowerClass).toBe("experienced_investor");
    expect(r.broadUniverse).toBe(true);
  });

  it("does NOT broaden for a first-time investor even at high FICO", () => {
    const r = evaluateDscrUniverse(CATALOG, { fico: 760, firstTimeInvestor: true });
    expect(r.borrowerClass).toBe("homeowner_first_time_investor");
    expect(r.broadUniverse).toBe(false);
  });

  it("excludes experienced-investor-required programs for a first-time investor, ranked by leverage", () => {
    const r = evaluateDscrUniverse(CATALOG, { firstTimeInvestor: true });
    const names = r.fthFriendly.map((f) => f.lenderName);
    expect(names).not.toContain("Generic DSCR Co"); // experiencedInvestorRequired: true
    expect(names).toContain("Orion Lending");
    // Sorted by baseMaxLtv desc — Orion (80) ahead of ADRI (75) / Forward (75).
    const orionIdx = names.indexOf("Orion Lending");
    const fwdIdx = names.indexOf("Forward Lending");
    expect(orionIdx).toBeLessThan(fwdIdx);
  });

  it("further excludes firstTimeHomebuyerAllowed:false programs for a FTHB borrower", () => {
    const restricted: ProgramCatalog = {
      ...CATALOG,
      programs: [...CATALOG.programs, program({ id: "p9", lenderId: "l8", name: "Generic 2", firstTimeHomebuyerAllowed: false })],
    };
    const r = evaluateDscrUniverse(restricted, { firstTimeHomebuyer: true });
    expect(r.fthFriendly.map((f) => f.programName)).not.toContain("Generic 2");
  });
});

describe("buildLenderIntelligenceContext — serialized model context", () => {
  it("emits parsed-able JSON carrying every routing block", () => {
    const ctx = buildLenderIntelligenceContext(CATALOG, { firstTimeInvestor: true, fico: 700 });
    const parsed = JSON.parse(ctx);
    expect(parsed.exceptionRouting.recommendedLenders).toContain("Cake Mortgage");
    expect(parsed.maxBusinessDepositUtilization.priorityLenders).toContain("Orion Lending");
    expect(parsed.dscrRouting.borrowerClass).toBe("homeowner_first_time_investor");
    expect(parsed.seededLenderStrengths.map((s: { lender: string }) => s.lender)).toContain("Deep Haven");
  });
});

describe("extractAssistantVitals — deterministic multi-turn signal extraction", () => {
  it("merges facts spread across turns: FICO + FTHB + LTV", () => {
    const v = extractAssistantVitals([
      { role: "user", content: "I've got a 720 FICO." },
      { role: "assistant", content: "Got it." },
      { role: "user", content: "It's a first-time homebuyer." },
      { role: "user", content: "They want 80% LTV on a DSCR." },
    ]);
    expect(v.fico).toBe(720);
    expect(v.firstTimeHomebuyer).toBe(true);
    expect(v.ltv).toBe(80);
  });

  it("distinguishes first-time investor from first-time homebuyer", () => {
    const v = extractAssistantVitals([{ role: "user", content: "first-time investor, owns his primary" }]);
    expect(v.firstTimeInvestor).toBe(true);
    expect(v.firstTimeHomebuyer).toBeUndefined();
  });

  it("reads property type and citizenship signals", () => {
    const v = extractAssistantVitals([{ role: "user", content: "non-warrantable condo for an ITIN borrower" }]);
    expect(v.propertyType).toBe("non_warrantable_condo");
    expect(v.citizenship).toBe("itin");
  });

  it("ignores assistant turns and implausible numbers", () => {
    const v = extractAssistantVitals([{ role: "assistant", content: "720 FICO 80% LTV" }]);
    expect(v.fico).toBeUndefined();
    expect(v.ltv).toBeUndefined();
  });
});

describe("Assistant system prompt — AE upgrade contract", () => {
  const p = ASSISTANT_SYSTEM_PROMPT.toLowerCase();

  it("adopts the Account Executive persona and intents", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("Account Executive");
    expect(p).toContain("exception");
  });

  it("distinguishes FIRST_TIME_HOMEBUYER from FIRST_TIME_INVESTOR", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("FIRST_TIME_HOMEBUYER");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("FIRST_TIME_INVESTOR");
    expect(p).toContain("never treat");
  });

  it("treats 'best' as relative and forbids a one-lender DSCR answer", () => {
    expect(p).toContain("no universal \"best dscr lender\"");
    expect(p).toContain("best lender for this specific borrower");
  });

  it("carries the exception and deposit-utilization priority logic", () => {
    for (const name of ["cake mortgage", "greenbox loans", "acra lending", "forward lending", "deep haven", "orion lending"]) {
      expect(p, name).toContain(name);
    }
    expect(p).toContain("100% of eligible business deposits");
    expect(p).toContain("expense factor");
  });

  it("never answers 'who is the best lender' with a lender list — best is determined by the scenario", () => {
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('no single best lender');
    expect(lower).toContain("determined by the scenario itself");
    // The rate-vs-get-it-done philosophy.
    expect(lower).toContain("best rate");
    expect(lower).toContain("rate is now irrelevant");
    expect(lower).toContain("get the deal done");
    // Must NOT name a list of lenders on the bare question.
    expect(lower).toContain("must not name any specific lender");
    // Must give the philosophy verbatim-enough to land the point.
    expect(lower).toContain("determined by the scenario itself");
  });

  it("enforces scannable chat formatting — separated lender blocks, no cramming, max 3 on broad questions", () => {
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("own line");
    expect(lower).toContain("blank line");
    expect(lower).toContain("run-on");
    expect(lower).toContain("never name more than 3");
    for (const level of ["high confidence", "medium confidence", "ae review recommended", "exception request"]) {
      expect(lower, level).toContain(level);
    }
  });

  it("reads like a casual conversation, not a rigid form or wall of text", () => {
    const lower = ASSISTANT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("sound like a person");
    expect(lower).toContain("wall of text");
    expect(lower).toContain("contractions");
  });

  it("never presents an exception as published eligibility; guidelines override reputation", () => {
    expect(p).toContain("never guarantee an exception");
    expect(p).toContain("current lender guidelines always override general lender reputation");
  });

  it("keeps answer-first behavior and proactive compensating-factor analysis", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("ANSWER THE QUESTION FIRST");
    expect(p).toContain("compensating factors");
    expect(p).toContain("payment shock");
  });

  it("carries multi-turn memory guidance", () => {
    expect(p).toContain("carry it forward");
  });
});

describe("Disclosure constants", () => {
  it("exception disclosure never guarantees an exception", () => {
    expect(EXCEPTION_DISCLOSURE.toLowerCase()).toContain("case-by-case");
    expect(EXCEPTION_DISCLOSURE.toLowerCase()).not.toContain("guarantee");
  });
  it("deposit disclosure stresses it is not 100% of every deposit", () => {
    expect(DEPOSIT_UTILIZATION_DISCLOSURE.toLowerCase()).toContain("expense factor");
  });
  it("compensating factor keys cover the spec §2 list", () => {
    for (const k of ["fico", "ltv", "reserves", "mortgage history", "investor experience", "dscr", "loan amount", "property type", "payment shock"]) {
      expect(COMPENSATING_FACTOR_KEYS, k).toContain(k);
    }
  });
});
