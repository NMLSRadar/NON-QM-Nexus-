import { DISCLAIMER, IncomeDocType } from "./types/enums";
import type { Lender, Program, Rule } from "./types/program";
import type { Scenario } from "./types/scenario";
import type { AnalysisResult } from "./types/results";
import { runCalculations } from "./calc";
import { evaluateProgram, rankEvaluations } from "./matching/evaluateProgram";
import { generateRestructuringOptions } from "./matching/restructure";
import { generateNeedsList } from "./matching/needsList";
import { classifyBankStatementComplexity } from "./matching/bankStatementComplexity";

export interface ProgramCatalog {
  lenders: Lender[];
  programs: Program[];
  rules: Rule[];
}

/**
 * Top-level deterministic analysis pipeline:
 *   1. run all calculations (traced),
 *   2. evaluate every active program,
 *   3. rank results transparently,
 *   4. generate restructuring options for anything not cleanly eligible,
 *   5. generate the broker-facing needs list.
 *
 * No AI is involved anywhere in this pipeline. AI features consume this
 * result as input; they never modify it.
 */
export function analyzeScenario(
  scenario: Scenario,
  catalog: ProgramCatalog,
  asOf: Date = new Date(),
): AnalysisResult {
  const calculation = runCalculations(scenario);

  const bankStatementFileClassification =
    scenario.incomeDocType === IncomeDocType.BankStatement
      ? classifyBankStatementComplexity(scenario, calculation)
      : undefined;

  const lenderById = new Map(catalog.lenders.map((l) => [l.id, l]));
  const activePairs = catalog.programs
    .filter((p) => p.active)
    .map((program) => ({ program, lender: lenderById.get(program.lenderId) }))
    .filter((pair): pair is { program: Program; lender: Lender } => pair.lender != null && pair.lender.active);

  const evaluations = rankEvaluations(
    activePairs.map(({ program, lender }) =>
      evaluateProgram(
        scenario,
        calculation,
        program,
        lender,
        catalog.rules,
        asOf,
        bankStatementFileClassification?.classification,
      ),
    ),
  );

  const restructuring = generateRestructuringOptions(scenario, activePairs, catalog.rules, asOf);

  // Display upgrade (product spec section 8): a program that is ineligible as
  // requested, but which a legitimate restructuring option would unlock, is
  // surfaced as eligible_with_restructuring rather than plain ineligible.
  const unlockedIds = new Set(restructuring.flatMap((o) => o.programsPotentiallyUnlockedIds));
  const displayEvaluations = rankEvaluations(
    evaluations.map((e) =>
      e.status === "ineligible" && unlockedIds.has(e.programId)
        ? { ...e, status: "eligible_with_restructuring" as const }
        : e,
    ),
  );
  const needsList = generateNeedsList(scenario);

  return {
    scenarioId: scenario.id,
    calculation,
    evaluations: displayEvaluations,
    restructuring,
    needsList,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    bankStatementFileClassification,
  };
}
