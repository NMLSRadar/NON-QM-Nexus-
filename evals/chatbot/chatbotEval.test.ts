import { describe, it, expect } from "vitest";
import { runEvalSuite } from "./evalRunner";
import { GOLDEN_SET } from "./golden";

/**
 * Chatbot eval suite — the precision gate. Runs in CI (npm test) against the
 * eval seed catalog. Any grounding, hallucination, or tenant-isolation failure
 * here means the chatbot is NOT improved and must not be reported as such.
 */
describe("chatbot eval suite (precision gate)", () => {
  it("has a golden set of at least 60 fixtures incl. 10 unanswerable + 10 typo/shorthand", () => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(60);
    expect(GOLDEN_SET.filter((f) => f.unanswerable).length).toBeGreaterThanOrEqual(10);
    expect(GOLDEN_SET.filter((f) => f.typoOrShorthand).length).toBeGreaterThanOrEqual(10);
  });

  it("passes the full graded suite", async () => {
    const summary = await runEvalSuite();
    // Intent accuracy target >= 95%.
    expect(summary.intentAccuracy, `intent accuracy ${summary.intentAccuracy}`).toBeGreaterThanOrEqual(0.95);
    // 100% of factual claims traceable to a tool result.
    expect(summary.groundingRate, "grounding rate must be 1.0").toBe(1);
    // Correct-refusal on unanswerable questions = 100%.
    expect(summary.correctRefusal, "correct-refusal rate must be 1.0").toBe(1);
    // Hallucinated-entity rate = 0.
    expect(summary.hallucinationRate, "hallucination rate must be 0").toBe(0);
    // Answer completeness per the answer contract.
    expect(summary.completenessRate, "completeness rate must be 1.0").toBe(1);

    if (summary.failures.length > 0) {
      console.error("Chatbot eval failures:", summary.failures);
    }
    expect(summary.failures, `failures: ${JSON.stringify(summary.failures)}`).toHaveLength(0);
  });
});