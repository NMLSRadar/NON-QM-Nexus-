import { RuleOutcome, RuleSeverity } from "../types/enums";
import type { Program } from "../types/program";
import type { Scenario } from "../types/scenario";
import type { CalculationSummary, RuleEvaluationResult } from "../types/results";
import { deriveMaxLtv } from "./baseChecks";

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
): { score: number; breakdown: ScoreBreakdownEntry[] } {
  const breakdown: ScoreBreakdownEntry[] = [];

  // 1. LTV headroom (25)
  const maxLtv = deriveMaxLtv(scenario, program);
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
  }

  // 3. DTI fit (15)
  if (program.maxDti != null && calc.dti?.value != null) {
    const buffer = program.maxDti - calc.dti.value;
    const pts = buffer < 0 ? 0 : Math.min(15, 8 + Math.min(7, buffer / 2));
    breakdown.push({ factor: "DTI fit", points: round(pts), maxPoints: 15, note: `DTI ${calc.dti.value}% vs max ${program.maxDti}%.` });
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
    const ok = reservesMonths >= program.minReservesMonths;
    breakdown.push({ factor: "Reserves fit", points: ok ? 10 : 4, maxPoints: 10, note: `${reservesMonths} mo vs required ${program.minReservesMonths} mo.` });
  }

  // 6. Documentation burden (10) — lighter doc => more points
  const burden = documentationBurden(program);
  breakdown.push({ factor: "Documentation burden", points: round(10 - burden), maxPoints: 10, note: `Relative burden score ${burden}/10 (lower is lighter).` });

  // 7. Penalties for warnings / manual review (subtractive, capped at 10)
  const warnings = ruleResults.filter((r) => r.outcome === RuleOutcome.Warning).length;
  const manual = ruleResults.filter((r) => r.outcome === RuleOutcome.ManualReview).length;
  const penalty = Math.min(10, warnings * 2 + manual * 3);
  breakdown.push({ factor: "Warnings / manual review", points: round(10 - penalty), maxPoints: 10, note: `${warnings} warning(s), ${manual} manual-review item(s).` });

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
