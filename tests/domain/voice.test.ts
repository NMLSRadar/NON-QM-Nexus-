import { describe, expect, it } from "vitest";
import { extractFromTranscript, normalizeTranscript } from "@/domain/voice/extract";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import { mergeExtractions } from "@/domain/voice/slots";
import { scenarioInputSchema } from "@/domain/validation/scenarioSchema";
import { analyzeScenario } from "@/domain/analyze";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import type { Scenario } from "@/domain/types/scenario";

const FULL =
  "This is a purchase of a single family primary residence worth $850,000, loan amount 680k, credit score 742, 12 months of business bank statements";

describe("voice extraction: number normalization", () => {
  it("converts spoken numbers, k, and millions to integers", () => {
    expect(normalizeTranscript("eight hundred fifty thousand")).toContain("850000");
    expect(normalizeTranscript("one point two million")).toContain("1200000");
    expect(normalizeTranscript("680k loan")).toContain("680000 loan");
    expect(normalizeTranscript("seven hundred twenty credit score")).toContain("720 credit score");
  });
});

describe("voice extraction: a full 8-vital utterance", () => {
  const x = extractFromTranscript(FULL);
  it("captures every vital with provenance", () => {
    expect(x.loanPurpose?.value).toBe("purchase");
    expect(x.occupancy?.value).toBe("primary");
    expect(x.propertyType?.value).toBe("single_family");
    expect(x.propertyValue?.value).toBe(850_000);
    expect(x.loanAmount?.value).toBe(680_000);
    expect(x.fico?.value).toBe(742);
    expect(x.incomeDocType?.value).toBe("bank_statement");
    expect(x.bankStatementMonths).toBe(12);
    expect(x.bankStatementKind).toBe("business");
  });
  it("assesses complete, derives LTV, and is ready to analyze", () => {
    const a = assess(x);
    expect(a.complete).toBe(true);
    expect(a.readyToAnalyze).toBe(true);
    expect(a.vitalsFilled).toBe(8);
    expect(a.derived.ltv).toBe(80);
    expect(a.prompt).toContain("All set");
  });
});

describe("voice extraction: phrasing coverage", () => {
  it("captures a bare number-then-'value' phrasing (the gap found in the preview)", () => {
    const x = extractFromTranscript("It's a purchase, single family, around 650000 value, credit score 725");
    expect(x.propertyValue?.value).toBe(650_000);
    expect(assess(x).vitalsFilled).toBe(4);
  });
  it("handles fully spoken numbers", () => {
    const x = extractFromTranscript(
      "seven hundred twenty credit score and one point two million purchase price, borrowing nine hundred thousand"
    );
    expect(x.fico?.value).toBe(720);
    expect(x.propertyValue?.value).toBe(1_200_000);
    expect(x.loanAmount?.value).toBe(900_000);
  });
  it("does not mistake a dollar amount for a FICO score", () => {
    const x = extractFromTranscript("price 750000 , 700 fico");
    expect(x.fico?.value).toBe(700);
    expect(x.propertyValue?.value).toBe(750_000);
  });
  it("maps property-type variants (non-warrantable beats condo; duplex sets units)", () => {
    expect(extractFromTranscript("a non-warrantable condo").propertyType?.value).toBe("non_warrantable_condo");
    expect(extractFromTranscript("a condo downtown").propertyType?.value).toBe("condo");
    const dup = extractFromTranscript("a duplex rental");
    expect(dup.propertyType?.value).toBe("2_4_unit");
    expect(dup.units).toBe(2);
    expect(extractFromTranscript("a townhouse").propertyType?.value).toBe("townhome");
  });
  it("maps occupancy phrases, including STR to investment + shortTermRental", () => {
    expect(extractFromTranscript("owner occupied home").occupancy?.value).toBe("primary");
    const str = extractFromTranscript("a short term rental on airbnb");
    expect(str.occupancy?.value).toBe("investment");
    expect(str.shortTermRental).toBe(true);
  });
  it("maps income-doc variants", () => {
    expect(extractFromTranscript("qualifying with a profit and loss").incomeDocType?.value).toBe("pnl_only");
    expect(extractFromTranscript("borrower is 1099").incomeDocType?.value).toBe("1099");
    expect(extractFromTranscript("using asset depletion").incomeDocType?.value).toBe("asset_depletion");
    expect(extractFromTranscript("dscr investor loan").incomeDocType?.value).toBe("dscr");
  });
});

describe("voice dialog: intuitive prompting when details are missing", () => {
  it("with 3 of 8 vitals, lists the missing ones and asks targeted questions", () => {
    const a = assess(extractFromTranscript("purchase, fico 700, loan amount 400000"));
    expect(a.complete).toBe(false);
    expect(a.vitalsFilled).toBe(3);
    expect(a.missing).toContain("occupancy");
    expect(a.missing).toContain("propertyType");
    expect(a.missing).toContain("propertyValue");
    expect(a.missing).toContain("incomeDocType");
    // Loan amount is known, so the redundant standalone-LTV question is dropped.
    expect(a.questions).toHaveLength(4);
    expect(a.prompt).toContain("Got");
    expect(a.prompt).toContain("occupancy");
  });
  it("asks the refinance-subtype clarifier, then resolves it on merge", () => {
    const first = extractFromTranscript("refinance my single family primary residence, value 500000, loan 350000, 700 fico, full doc");
    const a1 = assess(first);
    expect(a1.complete).toBe(false);
    expect(a1.questions[0]).toBe("Is the refinance rate-and-term or cash-out?");
    const merged = mergeExtractions(first, extractFromTranscript("it's a cash out refinance"));
    const a2 = assess(merged);
    expect(merged.loanPurpose?.value).toBe("cash_out_refinance");
    expect(a2.complete).toBe(true);
  });
  it("derives the loan amount from value + stated LTV", () => {
    const x = extractFromTranscript(
      "rate and term refinance, condo investment property, 600000 appraised value, 75 percent ltv, 720 score, dscr"
    );
    const a = assess(x);
    expect(a.derived.loanAmount).toBe(450_000);
    expect(a.complete).toBe(true);
    expect(a.readyToAnalyze).toBe(true);
  });
  it("flags an LTV that contradicts value/loan and holds auto-analysis", () => {
    const a = assess(extractFromTranscript("purchase primary sfr, value 500000, loan amount 450000, 80% ltv, 720 fico, full doc"));
    expect(a.complete).toBe(true);
    expect(a.readyToAnalyze).toBe(false);
    expect(a.conflicts).toHaveLength(1);
    expect(a.conflicts[0]).toContain("90");
  });
  it("assigns unlabeled dollar figures larger→value / smaller→loan, marked inferred", () => {
    const x = extractFromTranscript("purchase primary sfr, 720 credit, bank statements, 800000 and 600000");
    expect(x.propertyValue?.value).toBe(800_000);
    expect(x.propertyValue?.inferred).toBe(true);
    expect(x.loanAmount?.value).toBe(600_000);
    expect(x.notesFragments.join(" ")).toContain("larger");
    expect(assess(x).complete).toBe(true);
  });
  it("later utterances override earlier values on merge", () => {
    const merged = mergeExtractions(extractFromTranscript("fico 700"), extractFromTranscript("correction, credit score 720"));
    expect(merged.fico?.value).toBe(720);
  });
});

describe("voice → scenario: schema round-trip and full pipeline", () => {
  const catalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };

  it("buildScenarioInput refuses an incomplete assessment", () => {
    const x = extractFromTranscript("purchase, fico 700");
    expect(() => buildScenarioInput(x, assess(x))).toThrow();
  });

  it("produces a payload the shared Zod schema accepts (bank-statement purchase)", () => {
    const x = extractFromTranscript(FULL);
    const input = buildScenarioInput(x, assess(x));
    const parsed = scenarioInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(input.purchasePrice).toBe(850_000);
    expect(input.bankStatement?.months).toBe(12);
    expect(input.notes).toContain("Provenance");
  });

  it("produces a schema-valid payload for a DSCR refinance with derived loan amount", () => {
    const x = extractFromTranscript(
      "rate and term refinance, condo investment property, 600000 appraised value, 75 percent ltv, 720 score, dscr"
    );
    const input = buildScenarioInput(x, assess(x));
    expect(scenarioInputSchema.safeParse(input).success).toBe(true);
    expect(input.requestedLoanAmount).toBe(450_000);
    expect(input.purchasePrice).toBeUndefined();
  });

  it("end to end: spoken scenario → analysis → ranked lender list, best first", () => {
    const x = extractFromTranscript(FULL);
    const input = buildScenarioInput(x, assess(x));
    const now = new Date("2026-07-01");
    const scenario: Scenario = {
      ...input,
      id: "scn_voice_test",
      organizationId: "org_demo",
      createdByUserId: "user_demo_broker",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const result = analyzeScenario(scenario, catalog, now);
    expect(result.evaluations.length).toBeGreaterThan(0);
    // Ranked best-first per the engine's status bands, then score.
    const order = ["strong_match", "eligible", "conditional", "eligible_with_restructuring", "manual_review", "ineligible"];
    const indices = result.evaluations.map((e) => order.indexOf(e.status));
    for (let i = 1; i < indices.length; i++) expect(indices[i] as number).toBeGreaterThanOrEqual(indices[i - 1] as number);
    expect(result.evaluations[0]?.disclaimer).toContain("Preliminary scenario analysis only");
  });
});
