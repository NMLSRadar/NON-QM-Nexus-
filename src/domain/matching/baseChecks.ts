import { RuleOutcome, RuleSeverity, MORTGAGE_LATES_SEVERITY, MORTGAGE_LATES_CATEGORY_LABELS } from "../types/enums";
import type { Program, FiveToEightUnitLtvMatrixEntry, EligibilityLtvMatrixEntry, PurposeLtvMatrixEntry } from "../types/program";
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

/** Resolve the scenario-specific reserve requirement. Conditional rows stack
 * by taking the highest matching requirement; they are never added together. */
export function deriveRequiredReservesMonths(
  scenario: Scenario,
  program: Program,
  dscr?: number | null,
  leverage?: number | null,
): number {
  const actualLeverage = leverage ?? null;
  const matching = (program.reserveRules ?? [])
    .filter((r) => r.minLoanAmountExclusive == null || (scenario.requestedLoanAmount != null && scenario.requestedLoanAmount > r.minLoanAmountExclusive))
    .filter((r) => r.maxLoanAmount == null || (scenario.requestedLoanAmount != null && scenario.requestedLoanAmount <= r.maxLoanAmount))
    .filter((r) => r.minLtvExclusive == null || (actualLeverage != null && actualLeverage > r.minLtvExclusive))
    .filter((r) => r.maxLtv == null || (actualLeverage != null && actualLeverage <= r.maxLtv))
    .filter((r) => r.minFico == null || (scenario.fico != null && scenario.fico >= r.minFico))
    .filter((r) => r.maxFicoExclusive == null || (scenario.fico != null && scenario.fico < r.maxFicoExclusive))
    .filter((r) => r.minDscr == null || (dscr != null && dscr >= r.minDscr))
    .filter((r) => r.maxDscrExclusive == null || (dscr != null && dscr < r.maxDscrExclusive))
    .filter((r) => r.citizenship == null || scenario.citizenship === r.citizenship)
    .filter((r) => r.occupancy == null || scenario.occupancy === r.occupancy)
    .filter((r) => r.loanPurpose == null || scenario.loanPurpose === r.loanPurpose)
    .filter((r) => r.firstTimeHomebuyer == null || scenario.firstTimeHomebuyer === r.firstTimeHomebuyer)
    .filter((r) => r.firstTimeInvestor == null || scenario.firstTimeInvestor === r.firstTimeInvestor)
    .map((r) => r.months);
  return Math.max(program.minReservesMonths, ...matching);
}

/**
 * Look up the applicable 5-8 unit LTV/FICO/loan-amount tier for a scenario,
 * per the lookup rule documented on FiveToEightUnitLtvMatrixEntry: the
 * smallest loan-amount band that still covers the requested loan amount,
 * then within that band the highest FICO tier the scenario's FICO clears.
 * Returns undefined when the matrix doesn't cover this loan amount/FICO
 * combination at all (e.g. FICO below every tier documented for the
 * applicable band) — this is a real, meaningful "no match," never
 * silently defaulted to the program's general 1-4 unit figures.
 */
function findFiveToEightUnitTier(scenario: Scenario, program: Program): FiveToEightUnitLtvMatrixEntry | undefined {
  if (!program.fiveToEightUnitLtvMatrix || program.fiveToEightUnitLtvMatrix.length === 0) return undefined;
  if (scenario.fico == null || scenario.requestedLoanAmount == null) return undefined;
  const band = program.fiveToEightUnitLtvMatrix
    .filter((e) => e.maxLoanAmount >= scenario.requestedLoanAmount!)
    .sort((a, b) => a.maxLoanAmount - b.maxLoanAmount)[0];
  if (!band) return undefined;
  return program.fiveToEightUnitLtvMatrix
    .filter((e) => e.maxLoanAmount === band.maxLoanAmount && e.minFico <= scenario.fico!)
    .sort((a, b) => b.minFico - a.minFico)[0];
}

function findEligibilityLtvTier(
  scenario: Scenario,
  program: Program,
  dscr?: number | null,
): EligibilityLtvMatrixEntry | undefined {
  const matrix = program.eligibilityLtvMatrix;
  if (!matrix?.length) return undefined;
  return matrix
    .filter((e) => e.loanPurpose == null || e.loanPurpose === scenario.loanPurpose)
    .filter((e) => e.occupancy == null || e.occupancy === scenario.occupancy)
    .filter((e) => e.propertyType == null || e.propertyType === scenario.propertyType)
    .filter((e) => e.citizenship == null || e.citizenship === scenario.citizenship)
    .filter((e) => e.incomeDocType == null || e.incomeDocType === scenario.incomeDocType)
    .filter((e) => e.lienPosition == null || e.lienPosition === (scenario.lienPosition ?? "first_lien"))
    .filter((e) => e.maxLoanAmount == null || (scenario.requestedLoanAmount != null && scenario.requestedLoanAmount <= e.maxLoanAmount))
    .filter((e) => e.minFico == null || (scenario.fico != null && scenario.fico >= e.minFico))
    .filter((e) => e.minDscr == null || (dscr != null && dscr >= e.minDscr))
    .filter((e) => e.maxDscrExclusive == null || (dscr != null && dscr < e.maxDscrExclusive))
    .sort((a, b) => {
      const specificity = (e: EligibilityLtvMatrixEntry) =>
        Number(e.loanPurpose != null) + Number(e.occupancy != null) + Number(e.propertyType != null) +
        Number(e.citizenship != null) + Number(e.incomeDocType != null) + Number(e.lienPosition != null) + Number(e.minDscr != null) + Number(e.maxDscrExclusive != null);
      return specificity(b) - specificity(a)
        || (a.maxLoanAmount ?? Number.MAX_SAFE_INTEGER) - (b.maxLoanAmount ?? Number.MAX_SAFE_INTEGER)
        || (b.minFico ?? 0) - (a.minFico ?? 0);
    })[0];
}

function findPurposeLtvTier(scenario: Scenario, program: Program, calculatedDscr?: number): PurposeLtvMatrixEntry | undefined {
  if (!program.purposeLtvMatrix?.length || scenario.fico == null || scenario.requestedLoanAmount == null) return undefined;
  const capForPurpose = (entry: PurposeLtvMatrixEntry) => scenario.loanPurpose === "cash_out_refinance"
    ? entry.maxLtvCashOut
    : scenario.loanPurpose === "rate_term_refinance"
      ? entry.maxLtvRateTerm
      : entry.maxLtvPurchase;
  return program.purposeLtvMatrix
    .filter((entry) =>
      entry.maxLoanAmount >= scenario.requestedLoanAmount! &&
      entry.minFico <= scenario.fico! &&
      (!entry.occupancy || entry.occupancy === scenario.occupancy) &&
      (entry.minDscr == null || (calculatedDscr != null && calculatedDscr >= entry.minDscr)))
    .sort((a, b) =>
      (capForPurpose(b) ?? -1) - (capForPurpose(a) ?? -1) ||
      a.maxLoanAmount - b.maxLoanAmount ||
      b.minFico - a.minFico ||
      (b.minDscr ?? 0) - (a.minDscr ?? 0))[0];
}

/**
 * Derive the applicable maximum LTV for a scenario by selecting the lender's
 * most specific published matrix row, then applying any tighter overlays.
 */
export function deriveMaxLtv(scenario: Scenario, program: Program, calculatedDscr?: number | null): number {
  // 5-8 Unit Residential overlay — added 2026-08-01. Real 5-8 unit
  // matrices vary max LTV by loan amount, FICO, AND transaction type
  // simultaneously, a dimension the general ltvMatrix/baseMaxLtv path
  // below cannot express — when a real matrix has been ingested for this
  // property type, it is the AUTHORITATIVE source and takes over the
  // whole derivation (never blended with the program's general 1-4 unit
  // figures, which would misrepresent the lender's actual 5-8 unit grid).
  if (scenario.propertyType === "5_8_unit") {
    const tier = findFiveToEightUnitTier(scenario, program);
    if (tier) {
      return scenario.loanPurpose === "cash_out_refinance" ? tier.maxLtvCashOut
        : scenario.loanPurpose === "rate_term_refinance" ? tier.maxLtvRateTerm
        : tier.maxLtvPurchase; // default/purchase
    }
    // A real matrix exists but this scenario's loan amount/FICO combination
    // falls outside every tier it documents (e.g. FICO below the lowest
    // tier available at the applicable loan-amount band) — never fall
    // through to the program's general 1-4 unit baseMaxLtv/ltvMatrix,
    // which would misrepresent this specific product's real grid.
    if (program.fiveToEightUnitLtvMatrix && program.fiveToEightUnitLtvMatrix.length > 0) return 0;
  }
  if (program.eligibilityLtvMatrix?.length) {
    const tier = findEligibilityLtvTier(scenario, program, calculatedDscr);
    // The lender published a complete matrix, so an uncovered combination is
    // a real no-match rather than permission to use a looser headline cap.
    if (!tier) return 0;
    let matrixCap = tier.maxLtv;
    const citizenshipCap = scenario.citizenship ? program.citizenshipLtvCaps?.[scenario.citizenship] : undefined;
    if (citizenshipCap != null) matrixCap = Math.min(matrixCap, citizenshipCap);
    const propertyTypeCap = scenario.propertyType ? program.propertyTypeLtvCaps?.[scenario.propertyType] : undefined;
    if (propertyTypeCap != null) matrixCap = Math.min(matrixCap, propertyTypeCap);
    if (scenario.fico == null && scenario.creditProfileType && scenario.creditProfileType !== "us_fico_score" && program.noFicoMaxLtv != null) {
      matrixCap = Math.min(matrixCap, program.noFicoMaxLtv);
    }
    const docCap = scenario.incomeDocType && scenario.loanPurpose
      ? program.incomeDocTypeLtvCaps?.[scenario.incomeDocType]?.[scenario.loanPurpose]
      : undefined;
    if (docCap != null) matrixCap = Math.min(matrixCap, docCap);
    if (scenario.incomeDocType === "pnl_only" && scenario.loanPurpose) {
      const pnlCaps = scenario.pnl?.supportingBankStatements === true
        ? program.pnlWithSupportingStatementsLtvCaps
        : program.pnlWithoutSupportingStatementsLtvCaps;
      const pnlCap = pnlCaps?.[scenario.loanPurpose];
      if (pnlCap != null) matrixCap = Math.min(matrixCap, pnlCap);
    }
    if (scenario.investorExperience === "first_time_investor" && program.firstTimeInvestorLtvAdjustment != null) {
      matrixCap -= program.firstTimeInvestorLtvAdjustment;
    }
    if (scenario.incomeDocType === "dscr" && scenario.dscr?.strIncomeUsed === "yes") {
      if (program.strIncomeLtvAdjustment != null) matrixCap -= program.strIncomeLtvAdjustment;
      if (program.strIncomeMaxLtv != null) matrixCap = Math.min(matrixCap, program.strIncomeMaxLtv);
    }
    return Math.max(0, matrixCap);
  }
  if (program.purposeLtvMatrix?.length) {
    const tier = findPurposeLtvTier(scenario, program, calculatedDscr ?? undefined);
    if (!tier) return 0;
    const purposeCap = scenario.loanPurpose === "cash_out_refinance"
      ? tier.maxLtvCashOut
      : scenario.loanPurpose === "rate_term_refinance"
        ? tier.maxLtvRateTerm
        : tier.maxLtvPurchase;
    if (purposeCap == null) return 0;
    let cap = Math.min(program.baseMaxLtv, purposeCap);
    const citizenshipCap = scenario.citizenship ? program.citizenshipLtvCaps?.[scenario.citizenship] : undefined;
    if (citizenshipCap != null) cap = Math.min(cap, citizenshipCap);
    const propertyTypeCap = scenario.propertyType ? program.propertyTypeLtvCaps?.[scenario.propertyType] : undefined;
    if (propertyTypeCap != null) cap = Math.min(cap, propertyTypeCap);
    if (scenario.fico == null && scenario.creditProfileType && scenario.creditProfileType !== "us_fico_score" && program.noFicoMaxLtv != null) {
      cap = Math.min(cap, program.noFicoMaxLtv);
    }
    return cap;
  }
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
  // A property-type-specific cap (e.g. a lender that caps a warrantable
  // condo at 85% LTV and a non-warrantable condo at 80% LTV even though the
  // program's general ceiling is higher) — same "only ever tightens, never
  // loosens" rule as the citizenship cap above. See propertyTypeLtvCaps.
  const propertyTypeCap = scenario.propertyType ? program.propertyTypeLtvCaps?.[scenario.propertyType] : undefined;
  if (propertyTypeCap != null) cap = Math.min(cap, propertyTypeCap);
  // A no-FICO / nonnumeric-credit-profile LTV cap (F-1 visa / no-FICO fix,
  // 2026-07-28) applies the same "only ever tightens" rule — never loosens
  // the base/matrix/citizenship-derived cap, and only when this scenario
  // actually has no numeric FICO (a numeric-FICO borrower is unaffected).
  if (scenario.fico == null && scenario.creditProfileType && scenario.creditProfileType !== "us_fico_score" && program.noFicoMaxLtv != null) {
    cap = Math.min(cap, program.noFicoMaxLtv);
  }
  const docCap = scenario.incomeDocType && scenario.loanPurpose
    ? program.incomeDocTypeLtvCaps?.[scenario.incomeDocType]?.[scenario.loanPurpose]
    : undefined;
  if (docCap != null) cap = Math.min(cap, docCap);
  if (scenario.incomeDocType === "pnl_only" && scenario.loanPurpose) {
    // Unknown support is evaluated conservatively as the no-support tier;
    // the lender's higher cap is only earned by an explicit `true`.
    const pnlCaps = scenario.pnl?.supportingBankStatements === true
      ? program.pnlWithSupportingStatementsLtvCaps
      : program.pnlWithoutSupportingStatementsLtvCaps;
    const pnlCap = pnlCaps?.[scenario.loanPurpose];
    if (pnlCap != null) cap = Math.min(cap, pnlCap);
  }
  if (scenario.investorExperience === "first_time_investor" && program.firstTimeInvestorLtvAdjustment != null) cap -= program.firstTimeInvestorLtvAdjustment;
  if (scenario.incomeDocType === "dscr" && scenario.dscr?.strIncomeUsed === "yes") {
    if (program.strIncomeLtvAdjustment != null) cap -= program.strIncomeLtvAdjustment;
    if (program.strIncomeMaxLtv != null) cap = Math.min(cap, program.strIncomeMaxLtv);
  }
  return Math.max(0, cap);
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

  if (program.matrixConfirmationRequired) {
    out.push(result(`${p}:matrix-confirmation`, "Current lender matrix confirmation", "guideline", RuleOutcome.ManualReview, RuleSeverity.Soft,
      program.matrixConfirmationNotes ?? "The official narrative guideline confirms this product but defers scenario-specific numeric tiers to the lender's current matrix; obtain current matrix confirmation before final eligibility."));
  }

  // Income documentation type
  if (scenario.incomeDocType) {
    const ok = program.incomeDocTypes.includes(scenario.incomeDocType);
    out.push(
      result(`${p}:doc`, "Income documentation type", "documentation", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
        ok ? `Program supports ${scenario.incomeDocType} documentation.` : `Program does not offer ${scenario.incomeDocType} documentation.`),
    );
  }

  if (scenario.incomeDocType === "pnl_only") {
    if (program.pnlPeriodMonths != null && scenario.pnl?.periodMonths != null) {
      const periodOk = scenario.pnl.periodMonths >= program.pnlPeriodMonths;
      out.push(result(`${p}:pnl-period`, "P&L statement period", "documentation", periodOk ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
        periodOk
          ? `${scenario.pnl.periodMonths}-month P&L meets the required ${program.pnlPeriodMonths}-month period.`
          : `${scenario.pnl.periodMonths}-month P&L is shorter than the required ${program.pnlPeriodMonths} months.`));
    }
    if (scenario.pnl?.supportingBankStatements !== true) {
      if (program.pnlWithoutSupportingStatementsMinFico != null && scenario.fico != null) {
        const ficoOk = scenario.fico >= program.pnlWithoutSupportingStatementsMinFico;
        out.push(result(`${p}:pnl-no-support-fico`, "P&L without supporting statements — FICO", "documentation", ficoOk ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
          ficoOk
            ? `FICO ${scenario.fico} meets the ${program.pnlWithoutSupportingStatementsMinFico} minimum for P&L without supporting business statements.`
            : `FICO ${scenario.fico} is below the ${program.pnlWithoutSupportingStatementsMinFico} minimum for P&L without supporting business statements.`));
      }
      if (program.pnlWithoutSupportingStatementsMaxLoanAmount != null && scenario.requestedLoanAmount != null) {
        const loanOk = scenario.requestedLoanAmount <= program.pnlWithoutSupportingStatementsMaxLoanAmount;
        out.push(result(`${p}:pnl-no-support-loan`, "P&L without supporting statements — loan amount", "documentation", loanOk ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
          loanOk
            ? `Loan amount is within the $${program.pnlWithoutSupportingStatementsMaxLoanAmount.toLocaleString("en-US")} no-support limit.`
            : `P&L without supporting business statements is limited to $${program.pnlWithoutSupportingStatementsMaxLoanAmount.toLocaleString("en-US")}.`));
      }
    }
  }

  // Loan purpose
  if (scenario.loanPurpose) {
    const ok = program.loanPurposes.includes(scenario.loanPurpose);
    out.push(result(`${p}:purpose`, "Loan purpose", "eligibility", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
      ok ? `Loan purpose ${scenario.loanPurpose} is eligible.` : `Loan purpose ${scenario.loanPurpose} is not eligible.`));

    if (scenario.incomeDocType) {
      const restrictedPurposes = program.incomeDocTypePurposeRestrictions?.[scenario.incomeDocType];
      if (restrictedPurposes) {
        const docPurposeOk = restrictedPurposes.includes(scenario.loanPurpose);
        out.push(result(`${p}:doc-purpose`, "Documentation-specific loan purpose", "documentation", docPurposeOk ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
          docPurposeOk
            ? `${scenario.incomeDocType} documentation supports ${scenario.loanPurpose}.`
            : `${scenario.incomeDocType} documentation does not support ${scenario.loanPurpose} under this program.`));
      }
    }
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

    // Per-citizenship income-documentation restriction — a program can
    // bundle several doc types under one row while only actually
    // extending a specific citizenship to a SUBSET of them (see
    // Program.citizenshipDocTypeRestrictions). Only evaluated when the
    // citizenship check above already passed (this only ever TIGHTENS an
    // already-eligible citizenship, never substitutes for the base check)
    // and the scenario specifies which doc type it wants.
    if (ok && scenario.incomeDocType) {
      const restriction = program.citizenshipDocTypeRestrictions?.[scenario.citizenship];
      if (restriction && !restriction.includes(scenario.incomeDocType)) {
        out.push(result(`${p}:citdoc`, "Citizenship-specific documentation eligibility", "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
          `${scenario.citizenship} borrowers are eligible for this program generally, but this lender's current guideline does not extend that eligibility to ${scenario.incomeDocType.replace(/_/g, " ")} qualification specifically (only: ${restriction.join(", ").replace(/_/g, " ")}).`));
      }
    }
  }

  // Lien position — a standalone second mortgage (HELOAN/junior lien/
  // piggyback) is a fundamentally different product from an ordinary
  // first-lien program, even one that also supports cash-out refinance.
  // undefined on either side defaults to first_lien (see LienPosition in
  // enums.ts) — this hard-excludes a first-lien program from a standalone-
  // second request, and (just as importantly) excludes a standalone-
  // second product from an ordinary first-lien request.
  {
    const scenarioLien = scenario.lienPosition ?? "first_lien";
    const programLien = program.lienPosition ?? "first_lien";
    if (scenarioLien !== programLien) {
      out.push(result(`${p}:lien`, "Lien position", "eligibility", RuleOutcome.Fail, RuleSeverity.Hard,
        scenarioLien === "standalone_second"
          ? "This is a standalone second-mortgage/HELOAN request, but this program is a first-lien product."
          : "This program is a standalone second-mortgage/HELOAN product, not a first-lien program."));
    }
  }

  // ITIN + DSCR / No-Ratio combination — per the 2026-07-29 ITIN DSCR
  // Update spec, a program listing BOTH itin in citizenshipEligible AND
  // dscr in incomeDocTypes must NEVER be assumed to let the same borrower
  // combine both — the current matrix must expressly confirm it via the
  // dedicated itinDscrEligible/itinNoRatioEligible fields (never inferred
  // from the other two arrays). Only evaluated for an ITIN borrower
  // requesting DSCR-family qualification.
  if (scenario.citizenship === "itin" && scenario.incomeDocType === "dscr") {
    const isNoRatio = program.minDscr === 0 || program.minDscr == null;
    const combinationField = isNoRatio ? program.itinNoRatioEligible : program.itinDscrEligible;
    const combinationLabel = isNoRatio ? "ITIN + No-Ratio DSCR" : "ITIN + DSCR";
    if (combinationField === true) {
      out.push(result(`${p}:itindscr`, `${combinationLabel} combination`, "borrower", RuleOutcome.Pass, RuleSeverity.Hard,
        `This program's current matrix expressly confirms ITIN borrowers may qualify via ${isNoRatio ? "no-ratio DSCR" : "DSCR"}.`));
    } else if (combinationField === false) {
      out.push(result(`${p}:itindscr`, `${combinationLabel} combination`, "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
        `This program's current matrix expressly denies combining ITIN classification with ${isNoRatio ? "no-ratio DSCR" : "DSCR"} qualification — ITIN and DSCR are separate product lines here.`));
    } else {
      out.push(result(`${p}:itindscr`, `${combinationLabel} combination`, "borrower", RuleOutcome.ManualReview, RuleSeverity.Soft,
        `Guideline confirmation required: this program has not yet had ITIN + ${isNoRatio ? "no-ratio DSCR" : "DSCR"} combination eligibility confirmed against its current matrix — never assume it just because ITIN and DSCR each appear separately.`));
    }
  }

  // Foreign National + DSCR combination — same "never infer from the two
  // base arrays" pattern.
  if (scenario.citizenship === "foreign_national" && scenario.incomeDocType === "dscr") {
    if (program.foreignNationalDscrEligible === true) {
      out.push(result(`${p}:fndscr`, "Foreign National + DSCR combination", "borrower", RuleOutcome.Pass, RuleSeverity.Hard,
        "This program's current matrix expressly confirms Foreign National borrowers may qualify via DSCR."));
    } else if (program.foreignNationalDscrEligible === false) {
      out.push(result(`${p}:fndscr`, "Foreign National + DSCR combination", "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
        "This program's current matrix expressly denies combining Foreign National classification with DSCR qualification."));
    } else {
      out.push(result(`${p}:fndscr`, "Foreign National + DSCR combination", "borrower", RuleOutcome.ManualReview, RuleSeverity.Soft,
        "Guideline confirmation required: Foreign National + DSCR combination eligibility has not yet been confirmed against this program's current matrix."));
    }
  }

  // ITIN occupancy-specific restriction — only enforced when the program
  // has EXPLICITLY documented a false for this occupancy (undefined means
  // the guideline doesn't distinguish by occupancy for ITIN borrowers, so
  // the program's general occupancies/citizenshipEligible checks above
  // already fully govern eligibility with no further restriction here).
  if (scenario.citizenship === "itin" && scenario.occupancy === "primary" && program.ownerOccupiedItinEligible === false) {
    out.push(result(`${p}:itinocc`, "ITIN owner-occupied eligibility", "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
      "This program's ITIN eligibility does not extend to owner-occupied/primary-residence transactions per its current matrix."));
  }
  if (scenario.citizenship === "itin" && scenario.occupancy === "investment" && program.investmentItinEligible === false) {
    out.push(result(`${p}:itinocc`, "ITIN investment-property eligibility", "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
      "This program's ITIN eligibility does not extend to investment-property transactions per its current matrix."));
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

  // ---- 5-8 Unit Residential / Small-Balance Multifamily overlay ---------
  // Added 2026-08-01 (Lender Database Audit & 5-8 Unit Expansion spec).
  // Only evaluated when the SCENARIO is actually a 5-8 unit property (a
  // program listing 5_8_unit in propertyTypes but evaluated against a
  // 1-4 unit or 9+ unit scenario is unaffected — these checks are scoped
  // to the property type they document).
  if (scenario.propertyType === "5_8_unit") {
    // This program's 5-8 unit product may require a strictly EXPERIENCED
    // investor even when its general 1-4 unit business does not.
    if (program.fiveToEightUnitExperiencedInvestorRequired === true && investorExperience && investorExperience !== "experienced_investor") {
      out.push(result(`${p}:58expinv`, "5-8 unit: experienced investor required", "borrower", RuleOutcome.Fail, RuleSeverity.Hard,
        "This lender's 5-8 unit residential program requires an experienced investor (documented history of owning and managing non-owner-occupied income-producing investment property) — first-time investors are not eligible for this specific property type."));
    }
    // A per-property-type citizenship restriction tighter than the
    // program's general citizenshipEligible list (e.g. Foreign National/
    // ITIN/DACA excluded from a lender's 5-8 unit product even though
    // they're eligible on its 1-4 unit DSCR program).
    if (scenario.citizenship && program.fiveToEightUnitCitizenshipEligible) {
      const ok = program.fiveToEightUnitCitizenshipEligible.includes(scenario.citizenship);
      out.push(result(`${p}:58citizenship`, "5-8 unit: citizenship eligibility", "borrower", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
        ok ? `${scenario.citizenship} is eligible for this lender's 5-8 unit residential program.`
          : `This lender's 5-8 unit residential program does not extend to ${scenario.citizenship} borrowers, even though the general program may.`));
    }
    // A per-property-type DSCR minimum distinct from the program's general
    // minDscr (e.g. a lender's 5-8 unit product requiring >=1.00 DSCR
    // while its 1-4 unit DSCR product allows a lower/no-ratio minimum).
    if (program.fiveToEightUnitMinDscr != null && calc.dscr?.value != null) {
      const ok = calc.dscr.value >= program.fiveToEightUnitMinDscr;
      out.push(result(`${p}:58dscr`, "5-8 unit: minimum DSCR", "dscr", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
        ok ? `DSCR ${calc.dscr.value} meets this lender's 5-8 unit minimum of ${program.fiveToEightUnitMinDscr}.`
          : `DSCR ${calc.dscr.value} is below this lender's 5-8 unit minimum of ${program.fiveToEightUnitMinDscr}.`));
    }
    // STR income specifically on the 5-8 unit product — mirrors the
    // general DSCR STR check below, but only applies when the lender has
    // documented a property-type-specific answer (never inferred from the
    // program's general strIncomeEligible, since several lenders draw
    // this line differently for 5-8 unit vs. 1-4 unit).
    if (scenario.incomeDocType === "dscr" && scenario.dscr?.strIncomeUsed === "yes" && program.fiveToEightUnitStrIncomeEligible === false) {
      out.push(result(`${p}:58str`, "5-8 unit: short-term-rental income", "income", RuleOutcome.Warning, RuleSeverity.Soft,
        "This lender's 5-8 unit residential guideline treats short-term-rental income as ineligible (the unit is underwritten as vacant, no income credited) — the property will need to qualify on long-term market rent instead."));
    }
    // Guideline-confirmation gap — Phase 16 of the spec: a program listing
    // 5_8_unit as an eligible property type but with NO ingested LTV
    // matrix must never have its general baseMaxLtv/ltvMatrix silently
    // assumed to apply; flag it for manual confirmation instead of a
    // fabricated pass.
    if (!program.fiveToEightUnitLtvMatrix || program.fiveToEightUnitLtvMatrix.length === 0) {
      out.push(result(`${p}:58matrix`, "5-8 unit: guideline confirmation required", "property", RuleOutcome.ManualReview, RuleSeverity.Soft,
        "This lender lists 5-8 unit properties as eligible, but the specific loan-amount/FICO/LTV grid for this property type has not yet been ingested into the platform — confirm the exact LTV, FICO, and DSCR requirements with the lender's AE before relying on this match."));
    } else if (scenario.fico != null && scenario.requestedLoanAmount != null && !findFiveToEightUnitTier(scenario, program)) {
      // A real matrix IS on file, but this scenario's FICO/loan-amount
      // combination doesn't land in any documented tier (e.g. FICO below
      // the lowest tier available at the applicable loan-amount band) —
      // a real, meaningful ineligibility, not a data gap.
      out.push(result(`${p}:58tier`, "5-8 unit: FICO/loan-amount tier", "property", RuleOutcome.Fail, RuleSeverity.Hard,
        `This lender's 5-8 unit residential grid does not have a documented FICO/LTV tier covering a $${scenario.requestedLoanAmount.toLocaleString()} loan at FICO ${scenario.fico} — the borrower may still qualify at a different loan amount or with a higher credit score.`));
    }
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

  // Mortgage/housing-lates CATEGORY (Secondary Voice Vitals Expansion,
  // 2026-07-31) — a richer, 60/90/multiple-aware sibling to the 30x12
  // check above. Only evaluated when BOTH the scenario stated a real
  // category (never "unknown" — that's a legitimate non-answer, never
  // compared) AND the program has a documented maxMortgageLatesCategory.
  // Exceeding the program's tolerated severity is a hard fail; landing
  // exactly at it is a soft warning (an LLPA/pricing adjustment commonly
  // applies at the ceiling), same shape as the 30x12 check.
  if (
    scenario.creditEvents?.mortgageLatesCategory &&
    scenario.creditEvents.mortgageLatesCategory !== "unknown" &&
    program.maxMortgageLatesCategory &&
    program.maxMortgageLatesCategory !== "unknown"
  ) {
    const scenarioSeverity = MORTGAGE_LATES_SEVERITY[scenario.creditEvents.mortgageLatesCategory];
    const maxSeverity = MORTGAGE_LATES_SEVERITY[program.maxMortgageLatesCategory];
    const scenarioLabel = MORTGAGE_LATES_CATEGORY_LABELS[scenario.creditEvents.mortgageLatesCategory];
    const maxLabel = MORTGAGE_LATES_CATEGORY_LABELS[program.maxMortgageLatesCategory];
    if (scenarioSeverity > maxSeverity) {
      out.push(result(`${p}:latescat`, "Mortgage/housing history (lates category)", "credit", RuleOutcome.Fail, RuleSeverity.Hard,
        `${scenarioLabel} exceeds this program's documented housing-history tolerance (max ${maxLabel}).`));
    } else if (scenarioSeverity === maxSeverity && maxSeverity > 0) {
      out.push(result(`${p}:latescat`, "Mortgage/housing history (lates category)", "credit", RuleOutcome.Warning, RuleSeverity.Soft,
        `${scenarioLabel} is at this program's housing-history ceiling (${maxLabel}) — typically allowed only with an LLPA/pricing adjustment; confirm final pricing.`));
    } else {
      out.push(result(`${p}:latescat`, "Mortgage/housing history (lates category)", "credit", RuleOutcome.Pass, RuleSeverity.Soft,
        `${scenarioLabel} is within this program's housing-history tolerance (max ${maxLabel}).`));
    }
  }

  // Gift funds (Secondary Voice Vitals Expansion, 2026-07-31) — never a
  // hard eligibility gate (a real restriction usually just means the
  // borrower needs a different funds source, not that the whole program
  // is off the table), but a genuine, real restriction is surfaced as a
  // warning rather than silently ignored. Only evaluated when the
  // borrower actually said they're using gift funds; "no"/"unknown" never
  // triggers anything here.
  if (scenario.giftFundsUsed === "yes") {
    if (program.giftFundsAllowed === false) {
      out.push(result(`${p}:gift`, "Gift funds", "assets", RuleOutcome.Warning, RuleSeverity.Soft,
        "This program's current guideline does not allow gift funds — the borrower will need an alternative funds source for this program specifically."));
    } else if (program.giftFundsAllowed === true) {
      out.push(result(`${p}:gift`, "Gift funds", "assets", RuleOutcome.Pass, RuleSeverity.Info,
        program.giftFundsNotes ? `Gift funds are explicitly allowed. ${program.giftFundsNotes}` : "Gift funds are explicitly allowed on this program."));
    }
  }

  // DSCR short-term-rental (STR) income (Secondary Voice Vitals
  // Expansion, 2026-07-31) — DSCR programs only, mirrors the gift-funds
  // pattern: a real, documented disallowance is a soft warning (not a
  // hard fail, since the transaction may still qualify on long-term
  // market rent alone), while an explicit allowance is a positive,
  // disclosed note.
  if (scenario.incomeDocType === "dscr" && scenario.dscr?.strIncomeUsed === "yes") {
    if (program.strIncomeEligible === false) {
      out.push(result(`${p}:str`, "DSCR short-term-rental income", "income", RuleOutcome.Warning, RuleSeverity.Soft,
        "This program's current guideline does not allow Airbnb/VRBO/short-term-rental income for DSCR qualification — the property will need to qualify on long-term market rent instead."));
    } else if (program.strIncomeEligible === true) {
      out.push(result(`${p}:str`, "DSCR short-term-rental income", "income", RuleOutcome.Pass, RuleSeverity.Info,
        program.strIncomeNotes ? `Short-term-rental income is explicitly allowed for DSCR qualification. ${program.strIncomeNotes}` : "Short-term-rental (Airbnb/VRBO/AirDNA/Rentalizer-style) income is explicitly allowed for DSCR qualification."));
    }
  }

  // One-year self-employment (Secondary Voice Vitals Expansion,
  // 2026-07-31) — per spec, "suppress lenders requiring two years unless
  // compensating factors exist": modeled as a soft warning (underwriting
  // judgment/compensating factors can still apply), never a hard fail.
  if (scenario.oneYearSelfEmployed === "yes" && program.minSelfEmploymentMonths != null) {
    if (program.minSelfEmploymentMonths > 12) {
      out.push(result(`${p}:1yrse`, "Self-employment history", "borrower", RuleOutcome.Warning, RuleSeverity.Soft,
        `This program's current guideline requires ${program.minSelfEmploymentMonths} months of self-employment history — the borrower has only reached one year (12 months); may still be workable with compensating factors, confirm with the lender's AE.`));
    } else {
      out.push(result(`${p}:1yrse`, "Self-employment history", "borrower", RuleOutcome.Pass, RuleSeverity.Info,
        "This program's current guideline explicitly permits a one-year self-employment history."));
    }
  }

  // Loan amount. A zero/zero range on a matrix-confirmation program means
  // the narrative guide confirmed the product but did not contain the
  // separate numeric matrix — never turn that data gap into a fabricated
  // $0 hard decline.
  if (scenario.requestedLoanAmount != null) {
    const amt = scenario.requestedLoanAmount;
    if (program.matrixConfirmationRequired && program.minLoanAmount === 0 && program.maxLoanAmount === 0) {
      out.push(result(`${p}:amt`, "Loan amount range", "loan_amount", RuleOutcome.ManualReview, RuleSeverity.Soft,
        "The supplied narrative guideline does not contain this program's loan-amount grid; confirm the current lender matrix."));
    } else {
      const ok = amt >= program.minLoanAmount && amt <= program.maxLoanAmount;
      out.push(result(`${p}:amt`, "Loan amount range", "loan_amount", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
        ok
          ? `Loan amount is within $${program.minLoanAmount.toLocaleString()}–$${program.maxLoanAmount.toLocaleString()}.`
          : `Loan amount $${amt.toLocaleString()} is outside $${program.minLoanAmount.toLocaleString()}–$${program.maxLoanAmount.toLocaleString()}.`));
    }
  }

  // FICO. Zero on a matrix-confirmation program is "not supplied," not
  // "no minimum FICO required."
  if (scenario.fico != null) {
    if (program.matrixConfirmationRequired && program.minFico === 0) {
      out.push(result(`${p}:fico`, "Minimum FICO", "fico", RuleOutcome.ManualReview, RuleSeverity.Soft,
        "The supplied narrative guideline defers the minimum FICO and score tiers to the current lender matrix."));
    } else {
      const ok = scenario.fico >= program.minFico;
      out.push(result(`${p}:fico`, "Minimum FICO", "fico", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
        ok ? `FICO ${scenario.fico} ≥ minimum ${program.minFico}.` : `FICO ${scenario.fico} is below the minimum ${program.minFico}.`));
    }
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

  // LTV/CLTV vs derived max. Standalone seconds and HELOCs use combined
  // liens; ordinary first-lien programs continue to use LTV.
  const maxLtv = deriveMaxLtv(scenario, program, calc.dscr?.value);
  const leverage = program.ltvMetric === "cltv" ? calc.cltv : calc.ltv;
  if (leverage?.value != null) {
    const metricLabel = program.ltvMetric === "cltv" ? "CLTV" : "LTV";
    if (program.matrixConfirmationRequired && program.baseMaxLtv === 0 && !program.ltvMatrix?.length && !program.eligibilityLtvMatrix?.length && !program.purposeLtvMatrix?.length) {
      out.push(result(`${p}:ltv`, `Maximum ${metricLabel}`, "ltv", RuleOutcome.ManualReview, RuleSeverity.Soft,
        `The supplied narrative guideline defers the maximum ${metricLabel} grid to the current lender matrix.`));
    } else {
      const ok = leverage.value <= maxLtv;
      out.push(result(`${p}:ltv`, `Maximum ${metricLabel}`, "ltv", ok ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
        ok ? `Requested ${metricLabel} ${leverage.value}% ≤ maximum ${maxLtv}%.` : `Requested ${metricLabel} ${leverage.value}% exceeds maximum ${maxLtv}%.`));
    }

    if (scenario.loanPurpose === "cash_out_refinance" && scenario.requestedCashOut != null && program.cashOutLimits?.length) {
      const limit = [...program.cashOutLimits]
        .filter((r) => leverage.value! <= r.maxLtv)
        .sort((a, b) => a.maxLtv - b.maxLtv)[0];
      if (limit && limit.maxCashOutAmount != null) {
        const cashOk = scenario.requestedCashOut <= limit.maxCashOutAmount;
        out.push(result(`${p}:cashout-cap`, "Maximum cash-out proceeds", "cash_out", cashOk ? RuleOutcome.Pass : RuleOutcome.Fail, RuleSeverity.Hard,
          cashOk
            ? `Requested cash-out $${scenario.requestedCashOut.toLocaleString()} is within the $${limit.maxCashOutAmount.toLocaleString()} cap at ${leverage.value}% leverage.`
            : `Requested cash-out $${scenario.requestedCashOut.toLocaleString()} exceeds the $${limit.maxCashOutAmount.toLocaleString()} cap at ${leverage.value}% leverage.`));
      }
    }
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

  // Reserves (soft — usually curable). Conditional lender overlays stack by
  // taking the highest matching requirement, never by adding months.
  const requiredReserves = deriveRequiredReservesMonths(scenario, program, calc.dscr?.value, leverage?.value);
  const reservesMonths = calc.results.find((r) => r.key === "available_reserves_months")?.value ?? null;
  if (reservesMonths != null) {
    const ok = reservesMonths >= requiredReserves;
    out.push(result(`${p}:res`, "Required reserves", "reserves", ok ? RuleOutcome.Pass : RuleOutcome.Warning, RuleSeverity.Soft,
      ok
        ? `Available reserves ${reservesMonths} mo ≥ required ${requiredReserves} mo.`
        : `Available reserves ${reservesMonths} mo are below the required ${requiredReserves} mo.`));
  }

  // Interest-only availability
  if (scenario.interestOnlyRequested && !program.interestOnlyAvailable) {
    out.push(result(`${p}:io`, "Interest-only option", "features", RuleOutcome.Fail, RuleSeverity.Soft,
      "Interest-only was requested but is not available under this program."));
  }

  return out;
}
