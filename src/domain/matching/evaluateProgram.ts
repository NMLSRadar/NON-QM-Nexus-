import { DISCLAIMER, MatchStatus, RuleOutcome, RuleSeverity } from "../types/enums";
import type { Lender, Program, Rule } from "../types/program";
import type { Scenario } from "../types/scenario";
import type { CalculationSummary, ProgramEvaluation, RuleEvaluationResult } from "../types/results";
import { selectActiveRules } from "../rules/activeRules";
import { evaluateRules } from "../rules/evaluate";
import { baseProgramChecks, deriveMaxDti, deriveMaxLtv, deriveRequiredReservesMonths } from "./baseChecks";
import { incomeDocTypeLabel, resolveDocumentationProfile } from "./documentationProfile";
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
  const resolution = resolveDocumentationProfile(program, scenario.incomeDocType);
  if (resolution.status === "verification_required") {
    const explanation = `Guideline verification required for ${resolution.displayName}: ${resolution.issues.join(" ")}`;
    const verificationResult: RuleEvaluationResult = {
      ruleId: `${program.id}:documentation-profile-verification`,
      ruleName: "Documentation program profile verification",
      category: "documentation",
      outcome: RuleOutcome.ManualReview,
      severity: RuleSeverity.Hard,
      userExplanation: explanation,
    };
    return {
      programId: program.id,
      lenderId: lender.id,
      lenderTierLevel: lender.tierLevel,
      programName: `${program.name} — ${resolution.displayName}`,
      lenderName: lender.name,
      isSampleData: program.isSampleData || lender.isSampleData,
      status: MatchStatus.ManualReview,
      matchScore: 0,
      scoreBreakdown: [{ factor: "Verified documentation profile", points: 0, maxPoints: 100, note: explanation }],
      documentationType: resolution.displayName,
      matchedIncomeDocType: scenario.incomeDocType,
      guidelineVerificationRequired: true,
      profileVerificationIssues: resolution.issues,
      estimatedQualifyingIncome: calc.qualifyingMonthlyIncome?.value ?? undefined,
      incomeDocTypes: scenario.incomeDocType ? [scenario.incomeDocType] : [],
      loanPurposes: [],
      occupancies: [],
      propertyTypes: [],
      citizenshipEligible: [],
      foreignNationalSpecialist: false,
      itinSpecialist: false,
      bankStatementCleanExecution: false,
      bankStatementFlexible: false,
      premierProduct: false,
      itinDscrConfirmed: false,
      interestOnlyAvailable: false,
      ruleResults: [verificationResult],
      failedRules: [],
      warnings: [],
      manualReviewItems: [verificationResult],
      guidelineVersion: program.guidelineVersionLabel,
      effectiveDate: program.effectiveDate,
      lastVerifiedDate: program.lastVerifiedDate,
      sourceCitation: program.sourceCitation,
      disclaimer: DISCLAIMER,
    };
  }

  const scopedProgram = resolution.program;
  const pnl85Disclaimer =
    scenario.incomeDocType === "pnl_only" && calc.ltv?.value === 85
      ? "Important: At 85% LTV, the lender will most likely require two months of bank statements to support the Profit & Loss statement."
      : undefined;
  const active = selectActiveRules(
    customRules.filter((r) =>
      r.programId === program.id &&
      (resolution.ruleIds == null || resolution.ruleIds.includes(r.id))),
    asOf,
  );

  const ruleResults: RuleEvaluationResult[] = [
    ...baseProgramChecks(scenario, calc, scopedProgram),
    ...evaluateRules(scenario, calc, active),
  ];

  const { score, breakdown } = computeScore(scenario, calc, scopedProgram, ruleResults, bankStatementClassification);
  const status = classifyStatus(ruleResults, score);

  return {
    programId: program.id,
    lenderId: lender.id,
    lenderTierLevel: lender.tierLevel,
    programName: scopedProgram.name,
    lenderName: lender.name,
    isSampleData: scopedProgram.isSampleData || lender.isSampleData,
    status,
    matchScore: score,
    scoreBreakdown: breakdown,
    maxLtv: deriveMaxLtv(scenario, scopedProgram, calc.dscr?.value ?? undefined),
    maxLoanAmount: scenario.incomeDocType === "pnl_only" ? (scopedProgram.pnlMaxLoanAmount ?? scopedProgram.maxLoanAmount) : scopedProgram.maxLoanAmount,
    minFico: scenario.incomeDocType === "pnl_only" ? (scopedProgram.pnlMinFico ?? scopedProgram.minFico) : scopedProgram.minFico,
    maxDti: scenario.incomeDocType === "pnl_only"
      ? (scopedProgram.pnlMaxDti ?? deriveMaxDti(scenario, scopedProgram, calc.ltv?.value))
      : deriveMaxDti(scenario, scopedProgram, calc.ltv?.value),
    estimatedQualifyingIncome: calc.qualifyingMonthlyIncome?.value ?? undefined,
    estimatedReservesRequiredMonths: deriveRequiredReservesMonths(scenario, scopedProgram, calc.dscr?.value, calc.ltv?.value),
    documentationType: resolution.displayName || incomeDocTypeLabel(scenario.incomeDocType),
    matchedIncomeDocType: scenario.incomeDocType,
    guidelineVerificationRequired: false,
    profileSourceCitation: resolution.sourceCitation,
    profileSourceSection: resolution.sourceSection,
    profileSourcePage: resolution.sourcePage,
    pnl85SupportingStatementDisclaimer: pnl85Disclaimer,
    incomeDocTypes: scenario.incomeDocType ? [scenario.incomeDocType] : scopedProgram.incomeDocTypes,
    loanPurposes: scopedProgram.loanPurposes,
    occupancies: scopedProgram.occupancies,
    propertyTypes: scopedProgram.propertyTypes,
    citizenshipEligible: scopedProgram.citizenshipEligible,
    foreignNationalSpecialist: scopedProgram.foreignNationalSpecialist ?? false,
    itinSpecialist: scopedProgram.itinSpecialist ?? false,
    bankStatementCleanExecution: scopedProgram.bankStatementCleanExecution ?? false,
    bankStatementFlexible: scopedProgram.bankStatementFlexible ?? false,
    premierProduct: scopedProgram.premierProduct ?? false,
    itinDscrConfirmed:
      scenario.citizenship === "itin" &&
      scenario.incomeDocType === "dscr" &&
      ((scopedProgram.minDscr === 0 || scopedProgram.minDscr == null) ? scopedProgram.itinNoRatioEligible === true : scopedProgram.itinDscrEligible === true),
    lienPosition: scopedProgram.lienPosition,
    interestOnlyAvailable: scopedProgram.interestOnlyAvailable,
    ruleResults,
    failedRules: ruleResults.filter((r) => r.outcome === RuleOutcome.Fail),
    warnings: ruleResults.filter((r) => r.outcome === RuleOutcome.Warning),
    manualReviewItems: ruleResults.filter((r) => r.outcome === RuleOutcome.ManualReview),
    guidelineVersion: scopedProgram.guidelineVersionLabel,
    effectiveDate: scopedProgram.effectiveDate,
    lastVerifiedDate: scopedProgram.lastVerifiedDate,
    sourceCitation: scopedProgram.sourceCitation,
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
