import { describe, it, expect } from "vitest";
import { analyzeScenario } from "@/domain/analyze";
import { evalCatalog } from "../../evals/chatbot/seed";
import type { Scenario } from "@/domain/types/scenario";

const catalog = evalCatalog();

function scenario(overrides: Partial<Scenario>): Scenario {
  const now = new Date().toISOString();
  return {
    id: "t",
    organizationId: "org_eval",
    name: "test",
    createdByUserId: "u",
    loanPurpose: "purchase",
    occupancy: "investment",
    propertyType: "single_family",
    citizenship: "foreign_national",
    fico: 700,
    incomeDocType: "dscr",
    requestedLoanAmount: 900_000,
    estimatedValue: 1_000_000, // 90% LTV
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("restructuring — exception-strengthening (Part 2 §4.3)", () => {
  it("labels cushion moves as strengthening an exception, never creating eligibility", () => {
    const analysis = analyzeScenario(scenario({}), catalog);

    const strengthening = analysis.restructuring.filter((o) => o.kind === "exception_strengthening");
    expect(strengthening.length).toBeGreaterThan(0);

    const ltvCushion = strengthening.find((o) => o.changedVariable.includes("Requested LTV"));
    expect(ltvCushion).toBeDefined();
    expect(ltvCushion!.rationale).toContain("does not create eligibility");
    expect(ltvCushion!.programsPotentiallyUnlockedIds).toHaveLength(0); // not an eligibility unlock
    // The program it strengthens is one that's still ineligible on LTV.
    expect(ltvCushion!.programsPotentiallyUnlocked.join(" ")).toContain("Horizon");
  });

  it("never marks an exception-strengthening option as an eligibility unlock", () => {
    const analysis = analyzeScenario(scenario({}), catalog);
    for (const o of analysis.restructuring) {
      if (o.kind === "exception_strengthening") {
        expect(o.programsPotentiallyUnlockedIds).toHaveLength(0);
        expect(o.rationale).not.toContain("would unlock");
      }
    }
  });
});