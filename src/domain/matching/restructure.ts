import { MatchStatus } from "../types/enums";
import type { Lender, Program, Rule } from "../types/program";
import type { Scenario } from "../types/scenario";
import type { RestructuringOption } from "../types/results";
import { runCalculations } from "../calc";
import { evaluateProgram } from "./evaluateProgram";

const ELIGIBLE_STATUSES: MatchStatus[] = [
  MatchStatus.StrongMatch,
  MatchStatus.Eligible,
  MatchStatus.Conditional,
  MatchStatus.ManualReview,
];

interface Variant {
  changedVariable: string;
  currentValue: string;
  suggestedValue: string;
  rationale: string;
  requiredVerification: string[];
  mutate: (s: Scenario) => Scenario;
}

/**
 * Scenario restructuring engine.
 *
 * Tests reasonable, HONEST alternate structures by re-running the deterministic
 * engine on modified copies of the scenario, and reports which programs each
 * change would unlock. It never suggests misrepresenting occupancy, income,
 * assets, employment, ownership, citizenship, property use, or loan purpose —
 * every variant is a genuine change in the deal structure the borrower could actually
 * make, with the verification it would require.
 */
export function generateRestructuringOptions(
  scenario: Scenario,
  programs: Array<{ program: Program; lender: Lender }>,
  rules: Rule[],
  asOf: Date = new Date(),
): RestructuringOption[] {
  const baselineCalc = runCalculations(scenario);
  const baselineEligible = new Set(
    programs
      .filter(({ program, lender }) => {
        const evaluation = evaluateProgram(scenario, baselineCalc, program, lender, rules, asOf);
        return !evaluation.guidelineVerificationRequired && ELIGIBLE_STATUSES.includes(evaluation.status);
      })
      .map(({ program }) => program.id),
  );

  const variants = buildVariants(scenario);
  const options: RestructuringOption[] = [];

  for (const variant of variants) {
    const modified = variant.mutate(structuredClone(scenario));
    const calc = runCalculations(modified);

    const unlocked: string[] = [];
    const unlockedIds: string[] = [];
    const remaining: string[] = [];

    for (const { program, lender } of programs) {
      const evaluation = evaluateProgram(modified, calc, program, lender, rules, asOf);
      if (!evaluation.guidelineVerificationRequired && ELIGIBLE_STATUSES.includes(evaluation.status) && !baselineEligible.has(program.id)) {
        unlocked.push(`${lender.name} — ${program.name}`);
        unlockedIds.push(program.id);
        for (const w of evaluation.warnings) remaining.push(`${program.name}: ${w.userExplanation}`);
        for (const m of evaluation.manualReviewItems) remaining.push(`${program.name}: ${m.userExplanation}`);
      }
    }

    if (unlocked.length > 0) {
      options.push({
        changedVariable: variant.changedVariable,
        currentValue: variant.currentValue,
        suggestedValue: variant.suggestedValue,
        programsPotentiallyUnlocked: unlocked,
        programsPotentiallyUnlockedIds: unlockedIds,
        remainingConcerns: dedupe(remaining).slice(0, 6),
        requiredVerification: variant.requiredVerification,
        rationale: variant.rationale,
      });
    }
  }

  return options;
}

function buildVariants(s: Scenario): Variant[] {
  const variants: Variant[] = [];
  const value = s.estimatedValue ?? s.purchasePrice;

  // Lower LTV / higher down payment
  if (s.requestedLoanAmount != null && value != null && value > 0) {
    const currentLtv = (s.requestedLoanAmount / value) * 100;
    for (const target of [80, 75, 70]) {
      if (currentLtv > target + 0.01) {
        const newLoan = Math.floor((value * target) / 100);
        variants.push({
          changedVariable: "Requested LTV / loan amount",
          currentValue: `${currentLtv.toFixed(1)}% LTV ($${s.requestedLoanAmount.toLocaleString()})`,
          suggestedValue: `${target}% LTV ($${newLoan.toLocaleString()})`,
          rationale: `Reducing LTV to ${target}% may satisfy stricter LTV caps and lower reserve requirements.`,
          requiredVerification: ["Source and season the additional down-payment funds."],
          mutate: (x) => ({ ...x, requestedLoanAmount: newLoan }),
        });
      }
    }
  }

  // Reduce / eliminate cash out
  if (s.requestedCashOut != null && s.requestedCashOut > 0 && s.requestedLoanAmount != null) {
    variants.push({
      changedVariable: "Requested cash out",
      currentValue: `$${s.requestedCashOut.toLocaleString()}`,
      suggestedValue: "$0 (rate-and-term structure)",
      rationale: "Removing cash out typically raises the allowable LTV and removes cash-out overlays.",
      requiredVerification: ["Confirm payoff structure qualifies as rate-and-term under the target program."],
      mutate: (x) => ({
        ...x,
        requestedCashOut: 0,
        requestedLoanAmount: Math.max(0, (x.requestedLoanAmount ?? 0) - (s.requestedCashOut ?? 0)),
        loanPurpose: x.loanPurpose === "cash_out_refinance" ? "rate_term_refinance" : x.loanPurpose,
      }),
    });
  }

  // Pay off liabilities to cut DTI
  if ((s.monthlyLiabilities ?? 0) > 300 && (s.liquidAssets ?? 0) > 0) {
    const reduced = Math.round((s.monthlyLiabilities ?? 0) * 0.5);
    variants.push({
      changedVariable: "Monthly liabilities (debt payoff)",
      currentValue: `$${(s.monthlyLiabilities ?? 0).toLocaleString()}/mo`,
      suggestedValue: `$${reduced.toLocaleString()}/mo after documented payoff`,
      rationale: "Paying off revolving/installment debt at or before closing lowers DTI.",
      requiredVerification: ["Document payoff of specific accounts; confirm assets remain sufficient for down payment and reserves."],
      mutate: (x) => ({ ...x, monthlyLiabilities: reduced }),
    });
  }

  // Switch bank-statement period 12 <-> 24 months
  if (s.bankStatement) {
    const other = s.bankStatement.months === 12 ? 24 : 12;
    variants.push({
      changedVariable: "Bank-statement period",
      currentValue: `${s.bankStatement.months} months`,
      suggestedValue: `${other} months`,
      rationale: `Some programs price or qualify differently on ${other}-month averages; a different window may better represent income.`,
      requiredVerification: [`Provide the full ${other}-month statement set; deposits will be re-averaged.`],
      mutate: (x) => ({ ...x, bankStatement: x.bankStatement ? { ...x.bankStatement, months: other as 12 | 24 } : undefined }),
    });
  }

  // Switch income documentation method (honest alternatives only)
  if (s.incomeDocType === "bank_statement" && s.pnl == null) {
    variants.push({
      changedVariable: "Income-documentation method",
      currentValue: "Bank statements",
      suggestedValue: "CPA-prepared P&L (where the borrower genuinely qualifies)",
      rationale: "If a CPA/EA can prepare a compliant P&L, some programs accept P&L-only documentation with different limits.",
      requiredVerification: ["CPA/EA-prepared P&L covering the required period; supporting business statements are commonly required."],
      mutate: (x) => ({
        ...x,
        incomeDocType: "pnl_only",
        pnl: {
          periodMonths: 12,
          netIncome:
            x.bankStatement?.averageMonthlyEligibleDeposits != null && x.bankStatement.expenseFactorPercent != null
              ? Math.round(x.bankStatement.averageMonthlyEligibleDeposits * 12 * (1 - x.bankStatement.expenseFactorPercent / 100))
              : undefined,
          ownershipPercent: x.bankStatement?.ownershipPercent,
          preparer: "cpa",
          supportingBankStatements: true,
        },
      }),
    });
  }

  // Add reserves from documented retirement assets
  if ((s.retirementAssets ?? 0) > 0 && (s.liquidAssets ?? 0) >= 0) {
    variants.push({
      changedVariable: "Documented eligible reserves",
      currentValue: `$${(s.liquidAssets ?? 0).toLocaleString()} liquid documented`,
      suggestedValue: "Add retirement/other verifiable assets to the reserve calculation",
      rationale: "Documenting additional eligible assets (often at a haircut) can satisfy reserve requirements.",
      requiredVerification: ["Recent statements for each added account; confirm the program's haircut for retirement funds."],
      mutate: (x) => ({ ...x, otherEligibleAssets: (x.otherEligibleAssets ?? 0) + Math.round((x.retirementAssets ?? 0) * 0.6) }),
    });
  }

  // Long-term market rent instead of short-term-rental income
  if (s.dscr?.shortTermRental) {
    variants.push({
      changedVariable: "Rental-income basis",
      currentValue: "Short-term-rental income",
      suggestedValue: "Long-term market rent (appraiser's 1007)",
      rationale: "Qualifying on long-term market rent removes STR history/haircut overlays at many programs.",
      requiredVerification: ["Appraiser market-rent analysis; confirm the borrower intends long-term leasing."],
      mutate: (x) => ({ ...x, dscr: x.dscr ? { ...x.dscr, shortTermRental: false } : undefined }),
    });
  }

  // Wait out credit-event seasoning
  const ce = s.creditEvents;
  if (ce?.bankruptcyMonthsSinceDischarge != null && ce.bankruptcyMonthsSinceDischarge < 24) {
    const wait = 24 - ce.bankruptcyMonthsSinceDischarge;
    variants.push({
      changedVariable: "Bankruptcy seasoning",
      currentValue: `${ce.bankruptcyMonthsSinceDischarge} months since discharge`,
      suggestedValue: `24+ months (wait ~${wait} more month${wait === 1 ? "" : "s"})`,
      rationale: "Many programs step down their credit-event seasoning requirement at 24 months.",
      requiredVerification: ["Discharge documentation with dates; re-check guidelines at application time."],
      mutate: (x) => ({
        ...x,
        creditEvents: { ...x.creditEvents, bankruptcyMonthsSinceDischarge: 24 },
      }),
    });
  }

  return variants;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
