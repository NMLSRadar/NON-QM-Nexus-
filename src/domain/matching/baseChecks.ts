import { RuleOutcome, RuleSeverity } from "../types/enums";
import type { Program } from "../types/program";
import type { Scenario } from "../types/scenario";
import type { CalculationSummary, RuleEvaluationResult } from "../types/results";

function result(
  id: string,
  name: string,
  category: string,
  outcome: RuleOutcome,
  severity: RuleSeverity,
  explanation: string,
): RuleEvaluationResult {
  return { ruleId: id, ruleName: name, category, outcome, severity, userExplanation: explanation };
}

/**
 * Derive the applicable maximum LTV for a scenario under a program by combining
 * the base cap, the FICO/occupancy LTV matrix, and the most restrictive value.
 */
export function deriveMaxLtv(scenario: Scenario, program: Program): number {
  let cap = program.baseMaxLtv;
  if (program.ltvMatrix && scenario.fico != null) {
    const applicable = program.ltvMatrix
      .filter((e) => e.minFico <= scenario.fico! && (!e.occupancy || e.occupancy === scenario.occupancy))
      .sort((a, b) => b.minFico - a.minFico)[0];
    if (applicable) cap = Math.min(cap, applicable.maxLtv);
  }
  return cap;
}

/**
 * Deterministic base eligibility checks derived directly from a program's
 * configured constraints. These run for every program so that even programs
 * without custom rules produce fully explained pass/fail results.
 */
export function baseProgramChecks(
  scenario: Scenario,
  calc: CalculationSummary,
  program: Program,
): RuleEvaluationResult[] {
  const out: RuleEvaluationResult[] = [];
  const p = program.id;

  // Income documentation type
  if (scenario.incomeDocType) {
    const ok = program.incomeDocTypes.includes(scenario.incomeDocType);
    out.push(
      result(`${p}:doc`, "Income documentation type", "documentation", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
        ok ? `Program supports ${scenario.incomeDocType} documentation.` : `Program does not offer ${scenario.incomeDocType} documentation.`),
    );
  }

  // Loan purpose
  if (scenario.loanPurpose) {
    const ok = program.loanPurposes.includes(scenario.loanPurpose);
    out.push(result(`${p}:purpose`, "Loan purpose", "eligibility", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `Loan purpose ${scenario.loanPurpose} is eligible.` : `Loan purpose ${scenario.loanPurpose} is not eligible.`));
  }

  // Occupancy
  if (scenario.occupancy) {
    const ok = program.occupancies.includes(scenario.occupancy);
    out.push(result(`${p}:occ`, "Occupancy", "eligibility", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `${scenario.occupancy} occupancy is eligible.` : `${scenario.occupancy} occupancy is not eligible.`));
  }

  // Property type
  if (scenario.propertyType) {
    const ok = program.propertyTypes.includes(scenario.propertyType);
    out.push(result(`${p}:prop`, "Property type", "property", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `${scenario.propertyType} is an eligible property type.` : `${scenario.propertyType} is not an eligible property type.`));
  }

  // State
  if (scenario.state && program.eligibleStates !== "ALL") {
    const ok = program.eligibleStates.includes(scenario.state);
    out.push(result(`${p}:state`, "Property state", "eligibility", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `${scenario.state} is a licensed/eligible state.` : `${scenario.state} is not an eligible state for this program.`));
  }

  // Citizenship
  if (scenario.citizenship) {
    const ok = program.citizenshipEligible.includes(scenario.citizenship);
    out.push(result(`${p}:cit`, "Citizenship / residency", "borrower", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `${scenario.citizenship} borrowers are eligible.` : `${scenario.citizenship} borrowers are not eligible for this program.`));
  }

  // Title vesting
  if (scenario.vesting) {
    const ok = program.vestingEligible.includes(scenario.vesting);
    out.push(result(`${p}:vest`, "Title vesting", "borrower", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `${scenario.vesting} vesting is eligible.` : `${scenario.vesting} vesting is not eligible for this program.`));
  }

  // First-time homebuyer
  if (scenario.firstTimeHomebuyer === true && program.firstTimeHomebuyerAllowed === false) {
    out.push(result(`${p}:ftb`, "First-time homebuyer", "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
      "First-time homebuyers are not eligible for this program."));
  }

  // Investor experience — prefer the richer investorExperience field, fall
  // back to the legacy firstTimeInvestor boolean when that's all that was
  // captured (e.g. an older scenario or a caller that hasn't adopted the
  // richer field yet).
  const investorExperience = scenario.investorExperience ?? (scenario.firstTimeInvestor === true ? "first_time_investor" : undefined);
  if (investorExperience === "first_time_investor" && program.firstTimeInvestorAllowed === false) {
    out.push(result(`${p}:ftinv`, "First-time investor", "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
      "First-time investors are not eligible for this program."));
  }
  if (program.experiencedInvestorRequired === true && investorExperience && investorExperience !== "experienced_investor") {
    out.push(result(`${p}:expinv`, "Experienced investor required", "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
      "This program requires an experienced investor (prior investment-property ownership)."));
  }

  // Loan amount
  if (scenario.requestedLoanAmount != null) {
    const amt = scenario.requestedLoanAmount;
    const ok = amt >= program.minLoanAmount && amt <= program.maxLoanAmount;
    out.push(result(`${p}:amt`, "Loan amount range", "loan_amount", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok
        ? `Loan amount is within $${program.minLoanAmount.toLocaleString()}–$${program.maxLoanAmount.toLocaleString()}.`
        : `Loan amount $${amt.toLocaleString()} is outside $${program.minLoanAmount.toLocaleString()}–$${program.maxLoanAmount.toLocaleString()}.`));
  }

  // FICO
  if (scenario.fico != null) {
    const ok = scenario.fico >= program.minFico;
    out.push(result(`${p}:fico`, "Minimum FICO", "fico", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `FICO ${scenario.fico} ≥ minimum ${program.minFico}.` : `FICO ${scenario.fico} is below the minimum ${program.minFico}.`));
  }

  // LTV vs derived max
  const maxLtv = deriveMaxLtv(scenario, program);
  if (calc.ltv?.value != null) {
    const ok = calc.ltv.value <= maxLtv;
    out.push(result(`${p}:ltv`, "Maximum LTV", "ltv", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `Requested LTV ${calc.ltv.value}% ≤ maximum ${maxLtv}%.` : `Requested LTV ${calc.ltv.value}% exceeds maximum ${maxLtv}%.`));
  }

  // DTI vs limit (only when program uses ratios)
  if (program.maxDti != null && calc.dti?.value != null) {
    const ok = calc.dti.value <= program.maxDti;
    out.push(result(`${p}:dti`, "Maximum DTI", "dti", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `DTI ${calc.dti.value}% ≤ maximum ${program.maxDti}%.` : `DTI ${calc.dti.value}% exceeds maximum ${program.maxDti}%.`));
  }

  // DSCR vs minimum
  if (program.minDscr != null && calc.dscr?.value != null) {
    const ok = calc.dscr.value >= program.minDscr;
    out.push(result(`${p}:dscr`, "Minimum DSCR", "dscr", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `DSCR ${calc.dscr.value} ≥ minimum ${program.minDscr}.` : `DSCR ${calc.dscr.value} is below the minimum ${program.minDscr}.`));
  }

  // Reserves (soft — usually curable)
  const reservesMonths = calc.results.find((r) => r.key === "available_reserves_months")?.value ?? null;
  if (reservesMonths != null) {
    const ok = reservesMonths >= program.minReservesMonths;
    out.push(result(`${p}:res`, "Required reserves", "reserves", ok ? RuleOutcome.Pass : RuleOutcome.Warning, RuleSeverity.Soft,
      ok
        ? `Available reserves ${reservesMonths} mo ≥ required ${program.minReservesMonths} mo.`
        : `Available reserves ${reservesMonths} mo are below the required ${program.minReservesMonths} mo.`));
  }

  // Interest-only availability
  if (scenario.interestOnlyRequested && !program.interestOnlyAvailable) {
    out.push(result(`${p}:io`, "Interest-only option", "features", RuleOutcome.Fail, RuleSeverity.Soft,
      "Interest-only was requested but is not available under this program."));
  }

  return out;
}
