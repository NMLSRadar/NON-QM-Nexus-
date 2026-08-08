import { DISCLAIMER, MatchStatus, RuleOutcome, RuleSeverity } from "../types/enums";
import type { Lender, Program, Rule } from "../types/program";
import type { Scenario } from "../types/scenario";
import type { CalculationSummary, ProgramEvaluation, RuleEvaluationResult } from "../types/results";
import { selectActiveRules } from "../rules/activeRules";
import { evaluateRules } from "../rules/evaluate";
import { baseProgramChecks, deriveMaxLtv, deriveRequiredReservesMonths } from "./baseChecks";
import { computeScore } from "./score";
import type { BankStatementFileClassification } from "./bankStatementComplexity";

/**
 * Classify a program's overall status from its rule results.
 *
 *  - Any hard fail            => Ineligible
 *  - Any soft fail            => Conditional (potentially curable)
 *  - Any manual-review item   => ManualReview (if nothing failed)
 *  - Any warning              => Conditional
 *  - All pass, score >= 85    => StrongMatch
 *  - All pass                 => Eligible
 */
export function classifyStatus(ruleResults: RuleEvaluationResult[], score: number): MatchStatus {
  const hardFail = ruleResults.some((r) => r.outcome === RuleOutcome.Fail && r.severity === RuleSeverity.Hard);
  if (hardFail) return MatchStatus.Ineligible;

  const softFail = ruleResults.some((r) => r.outcome === RuleOutcome.Fail);
  const manual = ruleResults.some((r) => r.outcome === RuleOutcome.ManualReview);
  const warning = ruleResults.some((r) => r.outcome === RuleOutcome.Warning);

  if (softFail) return MatchStatus.Conditional;
  if (manual) return MatchStatus.ManualReview;
  if (warning) return MatchStatus.Conditional;
  if (score >= 85) return MatchStatus.StrongMatch;
  return MatchStatus.Eligible;
}

/** Evaluate a single program against a scenario with full transparency. */
export function evaluateProgram(
  scenario: Scenario,
  calc: CalculationSummary,
  program: Program,
  lender: Lender,
  customRules: Rule[],
  asOf: Date = new Date(),
  bankStatementClassification?: BankStatementFileClassification,
): ProgramEvaluation {
  const active = selectActiveRules(
    customRules.filter((r) => r.programId === program.id),
    asOf,
  );

  const ruleResults: RuleEvaluationResult[] = [
    ...baseProgramChecks(scenario, calc, program),
    ...evaluateRules(scenario, calc, active),
  ];

  const { score, breakdown } = computeScore(scenario, calc, program, ruleResults, bankStatementClassification);
  const status = classifyStatus(ruleResults, score);

  return {
    programId: program.id,
    lenderId: lender.id,
    lenderTierLevel: lender.tierLevel,
    programName: program.name,
    lenderName: lender.name,
    isSampleData: program.isSampleData || lender.isSampleData,
    status,
    matchScore: score,
    scoreBreakdown: breakdown,
    maxLtv: deriveMaxLtv(scenario, program, calc.dscr?.value ?? undefined),
    maxLoanAmount: program.maxLoanAmount,
    minFico: program.minFico,
    maxDti: program.maxDti,
    estimatedQualifyingIncome: calc.qualifyingMonthlyIncome?.value ?? undefined,
    estimatedReservesRequiredMonths: deriveRequiredReservesMonths(scenario, program, calc.dscr?.value, calc.ltv?.value),
    documentationType: program.incomeDocTypes.join(", "),
    incomeDocTypes: program.incomeDocTypes,
    loanPurposes: program.loanPurposes,
    occupancies: program.occupancies,
    propertyTypes: program.propertyTypes,
    citizenshipEligible: program.citizenshipEligible,
    foreignNationalSpecialist: program.foreignNationalSpecialist ?? false,
    itinSpecialist: program.itinSpecialist ?? false,
    bankStatementCleanExecution: program.bankStatementCleanExecution ?? false,
    bankStatementFlexible: program.bankStatementFlexible ?? false,
    premierProduct: program.premierProduct ?? false,
    itinDscrConfirmed:
      scenario.citizenship === "itin" &&
      scenario.incomeDocType === "dscr" &&
      ((program.minDscr === 0 || program.minDscr == null) ? program.itinNoRatioEligible === true : program.itinDscrEligible === true),
    lienPosition: program.lienPosition,
    interestOnlyAvailable: program.interestOnlyAvailable,
    ruleResults,
    failedRules: ruleResults.filter((r) => r.outcome === RuleOutcome.Fail),
    warnings: ruleResults.filter((r) => r.outcome === RuleOutcome.Warning),
    manualReviewItems: ruleResults.filter((r) => r.outcome === RuleOutcome.ManualReview),
    guidelineVersion: program.guidelineVersionLabel,
    effectiveDate: program.effectiveDate,
    lastVerifiedDate: program.lastVerifiedDate,
    sourceCitation: program.sourceCitation,
    disclaimer: DISCLAIMER,
  };
}

const STATUS_RANK: Record<MatchStatus, number> = {
  [MatchStatus.StrongMatch]: 0,
  [MatchStatus.Eligible]: 1,
  [MatchStatus.Conditional]: 2,
  [MatchStatus.EligibleWithRestructuring]: 3,
  [MatchStatus.ManualReview]: 4,
  [MatchStatus.Ineligible]: 5,
};

/** Rank evaluations: status band first, then score, then lighter documentation. */
export function rankEvaluations(evaluations: ProgramEvaluation[]): ProgramEvaluation[] {
  return [...evaluations].sort((a, b) => {
    const band = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (band !== 0) return band;
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return a.programName.localeCompare(b.programName);
  });
}
