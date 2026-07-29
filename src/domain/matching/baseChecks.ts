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
  // A citizenship-specific cap (e.g. "Non-Permanent Resident Aliens:
  // Maximum 75% LTV") only ever tightens the cap, never loosens it — a
  // program's general LTV ceiling still applies if no cap is documented
  // for this specific citizenship classification.
  const citizenshipCap = scenario.citizenship ? program.citizenshipLtvCaps?.[scenario.citizenship] : undefined;
  if (citizenshipCap != null) cap = Math.min(cap, citizenshipCap);
  // A no-FICO / nonnumeric-credit-profile LTV cap (F-1 visa / no-FICO fix,
  // 2026-07-28) applies the same "only ever tightens" rule — never loosens
  // the base/matrix/citizenship-derived cap, and only when this scenario
  // actually has no numeric FICO (a numeric-FICO borrower is unaffected).
  if (scenario.fico == null && scenario.creditProfileType && scenario.creditProfileType !== "us_fico_score" && program.noFicoMaxLtv != null) {
    cap = Math.min(cap, program.noFicoMaxLtv);
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

  // Mortgage / housing history (30-day lates in the trailing 12 months) —
  // real guideline language like "0x30x12" / "1x30x12 allowed with LLPA".
  // Only evaluated when BOTH the scenario stated a count AND the program
  // has a documented ceiling — undefined on either side means "not yet
  // known", never a silent guess. Exceeding the ceiling is a hard fail
  // (the guideline's own housing-history requirement); landing exactly at
  // it is flagged as a soft/conditional note (an LLPA or pricing
  // adjustment commonly applies at the ceiling, distinct from a clean
  // history) rather than a plain pass.
  if (scenario.creditEvents?.mortgageLates30x12 != null && program.maxMortgageLates30x12 != null) {
    const lates = scenario.creditEvents.mortgageLates30x12;
    const max = program.maxMortgageLates30x12;
    if (lates > max) {
      out.push(result(`${p}:lates`, "Mortgage/housing history (30-day lates)", "credit", RuleOutcome.Fail, RuleSeverity.Hard,
        `${lates}x30 in the last 12 months exceeds this program's housing-history requirement (max ${max}x30x12).`));
    } else if (lates === max && max > 0) {
      out.push(result(`${p}:lates`, "Mortgage/housing history (30-day lates)", "credit", RuleOutcome.Warning, RuleSeverity.Soft,
        `${lates}x30 in the last 12 months is at this program's housing-history ceiling — typically allowed only with an LLPA/pricing adjustment; confirm final pricing.`));
    } else {
      out.push(result(`${p}:lates`, "Mortgage/housing history (30-day lates)", "credit", RuleOutcome.Pass, RuleSeverity.Soft,
        `${lates}x30 in the last 12 months is within this program's housing-history requirement (max ${max}x30x12).`));
    }
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
  } else if (scenario.creditProfileType && scenario.creditProfileType !== "us_fico_score") {
    // No numeric FICO — F-1 visa / no-FICO fix (2026-07-28). Never
    // auto-reject just because `minFico` can't be evaluated numerically,
    // and never invent an eligibility answer the guideline doesn't
    // actually state — the outcome depends entirely on the program's
    // documented `noFicoPolicy` (undefined = guidelines do not specify).
    const label = { no_fico: "No FICO", no_us_credit: "No U.S. Credit", foreign_credit: "Foreign Credit Report", insufficient_credit_history: "Insufficient Credit History", unknown: "Credit Score Unknown" }[scenario.creditProfileType];
    switch (program.noFicoPolicy) {
      case "eligible":
        out.push(result(`${p}:nofico`, "No-FICO credit profile", "fico", RuleOutcome.Pass, RuleSeverity.Info,
          `${label} borrowers are explicitly eligible per this program's guidelines — no numeric FICO required.`));
        break;
      case "eligible_with_alternative_credit":
        out.push(result(`${p}:nofico`, "No-FICO credit profile", "fico", RuleOutcome.ManualReview, RuleSeverity.Soft,
          `${label} may be eligible with alternative credit documentation (foreign credit report, credit-reference letters, housing/mortgage payment history, or additional reserves) — confirm the specific documentation required with the lender's AE.`));
        break;
      case "requires_foreign_credit":
        out.push(result(`${p}:nofico`, "No-FICO credit profile", "fico", RuleOutcome.ManualReview, RuleSeverity.Soft,
          `This program requires a foreign credit report/reference for a ${label} borrower — confirm the borrower can provide one.`));
        break;
      case "requires_us_fico":
        out.push(result(`${p}:nofico`, "No-FICO credit profile", "fico", RuleOutcome.Fail, RuleSeverity.Hard,
          `This program requires a numeric U.S. FICO score; a ${label} borrower is not eligible.`));
        break;
      default:
        out.push(result(`${p}:nofico`, "No-FICO credit profile", "fico", RuleOutcome.ManualReview, RuleSeverity.Soft,
          `This program's guidelines do not specify ${label} eligibility yet — confirm with the lender's AE before assuming approval or denial.`));
        break;
    }
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
