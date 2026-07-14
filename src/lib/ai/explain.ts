import { AI_SYSTEM_PREAMBLE, asUntrustedData, getAiProvider } from "./provider";
import type { AnalysisResult } from "@/domain/types/results";
import type { Scenario } from "@/domain/types/scenario";

/**
 * Generate a narrative explanation of a deterministic analysis result.
 * The AI receives the completed analysis as fact data — it cannot change any
 * numbers, only explain them. Not wired into the demo UI by default; enable by
 * configuring an AI provider (see docs/ai-safety.md).
 */
export async function explainAnalysis(scenario: Scenario, analysis: AnalysisResult): Promise<string> {
  const provider = getAiProvider();

  const facts = {
    calculations: analysis.calculation.results.map((r) => ({ key: r.key, label: r.label, value: r.value, unit: r.unit, formula: r.formula })),
    topPrograms: analysis.evaluations.slice(0, 5).map((e) => ({
      program: e.programName,
      lender: e.lenderName,
      status: e.status,
      score: e.matchScore,
      failedRules: e.failedRules.map((f) => f.userExplanation),
      warnings: e.warnings.map((w) => w.userExplanation),
      manualReview: e.manualReviewItems.map((m) => m.userExplanation),
    })),
    restructuring: analysis.restructuring,
  };

  const scenarioSummary = {
    loanPurpose: scenario.loanPurpose,
    occupancy: scenario.occupancy,
    propertyType: scenario.propertyType,
    state: scenario.state,
    incomeDocType: scenario.incomeDocType,
    notes: scenario.notes, // untrusted free text — passed as data below
  };

  return provider.complete({
    messages: [
      { role: "system", content: AI_SYSTEM_PREAMBLE },
      {
        role: "user",
        content: [
          "Write a concise broker-facing explanation of this preliminary NON-QM scenario analysis.",
          "Explain why the top programs matched or failed, plainly. End with the standard disclaimer that this is a preliminary analysis, not a loan approval.",
          asUntrustedData("deterministic_analysis_facts", JSON.stringify(facts, null, 2)),
          asUntrustedData("scenario_summary", JSON.stringify(scenarioSummary, null, 2)),
        ].join("\n\n"),
      },
    ],
  });
}
