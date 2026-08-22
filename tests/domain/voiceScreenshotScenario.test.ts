import { describe, expect, it } from "vitest";
import { analyzeScenario } from "@/domain/analyze";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import { extractFromTranscript } from "@/domain/voice/extract";
import { scenarioInputSchema } from "@/domain/validation/scenarioSchema";

describe("reported $1M voice scenario", () => {
  it("builds a valid saved scenario and safely enters lender analysis", () => {
    const extraction = extractFromTranscript(
      "Good afternoon. I have a first-time homebuyer looking to purchase a one-million-dollar single-family primary residence. They are looking for 80 percent LTV, have a 760 credit score, use business bank statements, and are a U.S. citizen.",
    );
    const assessment = assess(extraction);

    expect(assessment.complete).toBe(true);
    expect(assessment.vitalsFilled).toBe(9);
    const input = buildScenarioInput(extraction, assessment);
    expect(scenarioInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      loanPurpose: "purchase",
      occupancy: "primary",
      propertyType: "single_family",
      estimatedValue: 1_000_000,
      purchasePrice: 1_000_000,
      requestedLoanAmount: 800_000,
      fico: 760,
      incomeDocType: "bank_statement",
      citizenship: "us_citizen",
      firstTimeHomebuyer: true,
      bankStatement: { personalOrBusiness: "business", months: 12 },
    });

    const scenario = {
      ...input,
      id: "reported-voice-scenario",
      organizationId: "test-org",
      createdByUserId: "test-user",
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };
    expect(() => analyzeScenario(scenario, { lenders: [], programs: [], rules: [] })).not.toThrow();
  });
});