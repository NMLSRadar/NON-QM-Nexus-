import { RuleOutcome, RuleSeverity } from "../types/enums";
import type { Program } from "../types/program";
import type { Scenario } from "../types/scenario";
import type { CalculationSummary, RuleEvaluationResult } from "../types/results";
import { deriveMaxDti, deriveMaxLtv, deriveRequiredReservesMonths } from "./baseChecks";
import type { BankStatementFileClassification } from "./bankStatementComplexity";

export interface ScoreBreakdownEntry {
  factor: string;
  points: number;
  maxPoints: number;
  note: string;
}

/**
 * Transparent, weighted match score (0-100). Every factor exposes its points
 * and a human note so the UI can explain why one program ranks above another.
 * Pricing is deliberately NOT a factor — the platform does not include pricing
 * unless a verified integration exists.
 */
export function computeScore(
  scenario: Scenario,
  calc: CalculationSummary,
  program: Program,
  ruleResults: RuleEvaluationResult[],
  bankStatementClassification?: BankStatementFileClassification,
): { score: number; breakdown: ScoreBreakdownEntry[] } {
  const breakdown: ScoreBreakdownEntry[] = [];

  // 1. LTV headroom (25)
  const maxLtv = deriveMaxLtv(scenario, program, calc.dscr?.value ?? undefined);
  const ltv = calc.ltv?.value;
  if (ltv != null) {
    const headroom = maxLtv - ltv;
    const pts = ltv > maxLtv ? 0 : Math.min(25, 15 + Math.max(0, Math.min(10, headroom)));
    breakdown.push({ factor: "LTV fit", points: round(pts), maxPoints: 25, note: `Requested ${ltv}% vs max ${maxLtv}% (${headroom.toFixed(1)}pt headroom).` });
  }

  // 2. FICO fit (20)
  if (scenario.fico != null) {
    const buffer = scenario.fico - program.minFico;
    const pts = buffer < 0 ? 0 : Math.min(20, 12 + Math.min(8, buffer / 5));
    breakdown.push({ factor: "FICO fit", points: round(pts), maxPoints: 20, note: `FICO ${scenario.fico} vs min ${program.minFico}.` });
  } else if (scenario.creditProfileType && scenario.creditProfileType !== "us_fico_score") {
    // No-FICO / nonnumeric-credit-profile fit (F-1 visa / no-FICO fix,
    // 2026-07-28) — replaces the ordinary FICO-fit factor entirely (it's
    // the same underlying dimension, just resolved to a documented policy
    // instead of a number) rather than silently omitting the factor.
    const pts = program.noFicoPolicy === "eligible" ? 18 : program.noFicoPolicy === "eligible_with_alternative_credit" || program.noFicoPolicy === "requires_foreign_credit" ? 10 : 0;
    breakdown.push({
      factor: "No-FICO credit profile fit",
      points: pts,
      maxPoints: 20,
      note:
        program.noFicoPolicy === "eligible"
          ? "Program explicitly accepts a no-FICO borrower."
          : program.noFicoPolicy === "eligible_with_alternative_credit"
            ? "Program accepts a no-FICO borrower with alternative credit documentation."
            : program.noFicoPolicy === "requires_foreign_credit"
              ? "Program requires a foreign credit report for a no-FICO borrower."
              : program.noFicoPolicy === "requires_us_fico"
                ? "Program requires a numeric U.S. FICO score."
                : "Program's guidelines do not specify no-FICO eligibility.",
    });
  }

  // 3. DTI fit (15)
  const maxDti = deriveMaxDti(scenario, program, calc.ltv?.value);
  if (maxDti != null && calc.dti?.value != null) {
    const buffer = maxDti - calc.dti.value;
    const pts = buffer < 0 ? 0 : Math.min(15, 8 + Math.min(7, buffer / 2));
    breakdown.push({ factor: "DTI fit", points: round(pts), maxPoints: 15, note: `DTI ${calc.dti.value}% vs applicable max ${maxDti}%.` });
  } else if (program.minDscr != null && calc.dscr?.value != null) {
    const buffer = calc.dscr.value - program.minDscr;
    const pts = buffer < 0 ? 0 : Math.min(15, 8 + Math.min(7, buffer * 10));
    breakdown.push({ factor: "DSCR fit", points: round(pts), maxPoints: 15, note: `DSCR ${calc.dscr.value} vs min ${program.minDscr}.` });
  }

  // 4. Loan amount fit (10)
  if (scenario.requestedLoanAmount != null) {
    const inRange = scenario.requestedLoanAmount >= program.minLoanAmount && scenario.requestedLoanAmount <= program.maxLoanAmount;
    breakdown.push({ factor: "Loan amount fit", points: inRange ? 10 : 0, maxPoints: 10, note: inRange ? "Within program range." : "Outside program range." });
  }

  // 5. Reserves fit (10)
  const reservesMonths = calc.results.find((r) => r.key === "available_reserves_months")?.value ?? null;
  if (reservesMonths != null) {
    const requiredReserves = deriveRequiredReservesMonths(scenario, program, calc.dscr?.value, calc.ltv?.value);
    const ok = reservesMonths >= requiredReserves;
    breakdown.push({ factor: "Reserves fit", points: ok ? 10 : 4, maxPoints: 10, note: `${reservesMonths} mo vs required ${requiredReserves} mo.` });
  }

  // 6. Documentation burden (10) — lighter doc => more points
  const burden = documentationBurden(program);
  breakdown.push({ factor: "Documentation burden", points: round(10 - burden), maxPoints: 10, note: `Relative burden score ${burden}/10 (lower is lighter).` });

  // 7. Penalties for warnings / manual review (subtractive, capped at 10)
  const warnings = ruleResults.filter((r) => r.outcome === RuleOutcome.Warning).length;
  const manual = ruleResults.filter((r) => r.outcome === RuleOutcome.ManualReview).length;
  const penalty = Math.min(10, warnings * 2 + manual * 3);
  breakdown.push({ factor: "Warnings / manual review", points: round(10 - penalty), maxPoints: 10, note: `${warnings} warning(s), ${manual} manual-review item(s).` });

  // 8. Foreign National specialist (5) — an admin-curated editorial signal
  // ONLY, per user direction 2026-07-28: never a substitute for real
  // eligibility (a program that fails citizenship/LTV/etc. still scores a
  // hard-fail cap regardless of this flag — see below) and never a hidden
  // ranking override. Capped small relative to the substantive factors
  // above so it can nudge a close tie, not overcome a genuinely stronger
  // real match; disclosed here in the breakdown so it's always auditable.
  if (scenario.citizenship === "foreign_national" && program.foreignNationalSpecialist) {
    breakdown.push({
      factor: "Foreign National specialist",
      points: 5,
      maxPoints: 5,
      note: "Curated by platform admins as a specialist Foreign National lender (broad guidelines, consistent execution) — editorial signal, not a guideline fact.",
    });
  }

  // 9. ITIN specialist (5) — the identical editorial-signal pattern as
  // Foreign National specialist above, applied to ITIN scenarios.
  if (scenario.citizenship === "itin" && program.itinSpecialist) {
    breakdown.push({
      factor: "ITIN specialist",
      points: 5,
      maxPoints: 5,
      note: "Curated by platform admins as a specialist ITIN lender (broad guidelines, consistent execution) — editorial signal, not a guideline fact.",
    });
  }

  // 10. Bank statement clean-file execution (5) — editorial signal, ONLY
  // for a program flagged as a strong clean-file executor AND ONLY when
  // this scenario's own bank-statement file classification is "clean".
  // Never applies to a moderate/high/manual-review file, where guideline
  // flexibility should outrank pricing/technology per the platform spec.
  if (
    bankStatementClassification === "clean" &&
    program.bankStatementCleanExecution &&
    program.incomeDocTypes.includes("bank_statement")
  ) {
    breakdown.push({
      factor: "Bank statement clean-file execution",
      points: 5,
      maxPoints: 5,
      note: "Curated by platform admins as a strong execution option for a CLEAN bank statement file (pricing/technology) — editorial signal, not a guideline fact, and only applied because this file has no flagged complications.",
    });
  }

  // 11. Bank statement guideline flexibility (5) — the mirror-image
  // editorial signal: ONLY for a program flagged as broadly flexible AND
  // ONLY when the file classification is moderate, high complexity, or
  // manual-review-recommended (never for a clean file).
  if (
    bankStatementClassification &&
    bankStatementClassification !== "clean" &&
    program.bankStatementFlexible &&
    program.incomeDocTypes.includes("bank_statement")
  ) {
    breakdown.push({
      factor: "Bank statement guideline flexibility",
      points: 5,
      maxPoints: 5,
      note: "Curated by platform admins as a broadly flexible Non-QM bank statement lender — editorial signal, not a guideline fact, and only applied because this file has a flagged complication requiring flexibility.",
    });
  }

  // 12. Gift funds fit (5) — Secondary Voice Vitals Expansion (2026-07-31),
  // the identical editorial/documentary-signal pattern used elsewhere in
  // this scoring model: only a POSITIVE signal (an explicit real
  // allowance), never a penalty here — a real restriction is already
  // reflected via the warning-count factor above (#7).
  if (scenario.giftFundsUsed === "yes" && program.giftFundsAllowed === true) {
    breakdown.push({
      factor: "Gift funds fit",
      points: 5,
      maxPoints: 5,
      note: "This program's current guideline explicitly allows gift funds — a real, documented fit for this borrower's funding source.",
    });
  }

  // 13. DSCR short-term-rental income fit (5) — DSCR only, same pattern.
  if (scenario.incomeDocType === "dscr" && scenario.dscr?.strIncomeUsed === "yes" && program.strIncomeEligible === true) {
    breakdown.push({
      factor: "DSCR short-term-rental income fit",
      points: 5,
      maxPoints: 5,
      note: "This program's current guideline explicitly allows Airbnb/VRBO/AirDNA/Rentalizer-style short-term-rental income for DSCR qualification.",
    });
  }

  // 14. One-year self-employment fit (5) — per spec, "prioritize lenders
  // that permit one-year self-employment."
  if (scenario.oneYearSelfEmployed === "yes" && program.minSelfEmploymentMonths != null && program.minSelfEmploymentMonths <= 12) {
    breakdown.push({
      factor: "One-year self-employment fit",
      points: 5,
      maxPoints: 5,
      note: "This program's current guideline explicitly permits a one-year (12-month) self-employment history, matching this borrower's current standing.",
    });
  }

  // Any hard fail zeroes the practical score for ranking purposes.
  const hardFail = ruleResults.some((r) => r.outcome === RuleOutcome.Fail && r.severity === RuleSeverity.Hard);

  const raw = breakdown.reduce((s, b) => s + b.points, 0);
  const maxTotal = breakdown.reduce((s, b) => s + b.maxPoints, 0);
  const normalized = maxTotal > 0 ? (raw / maxTotal) * 100 : 0;
  const score = hardFail ? Math.min(normalized, 20) : normalized;

  return { score: round(score), breakdown };
}

function documentationBurden(program: Program): number {
  // Rough relative burden by primary doc type (0 lightest .. 10 heaviest).
  if (program.incomeDocTypes.includes("dscr")) return 2;
  if (program.incomeDocTypes.includes("asset_depletion")) return 5;
  if (program.incomeDocTypes.includes("pnl_only")) return 5;
  if (program.incomeDocTypes.includes("bank_statement")) return 6;
  if (program.incomeDocTypes.includes("1099")) return 6;
  if (program.incomeDocTypes.includes("full_doc")) return 8;
  return 6;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
