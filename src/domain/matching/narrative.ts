import { RuleOutcome, RuleSeverity } from "../types/enums";
import type { ProgramEvaluation } from "../types/results";

/**
 * "Why This Lender?" and the AI Analysis narrative — both generated
 * DETERMINISTICALLY from the same real rule-evaluation data already
 * computed by evaluateProgram.ts. No text here is ever invented or
 * LLM-generated; every bullet traces to a real Pass rule result or a real
 * program field, matching the app's standing "no black-box AI eligibility
 * decisions" guarantee. This module only decides HOW to phrase facts that
 * already exist, never WHICH facts are true.
 */

const CATEGORY_PRIORITY = ["ltv", "dscr", "dti", "documentation", "borrower", "eligibility", "reserves", "features"];

/** Up to 6 of the most relevant reasons THIS program fits, drawn only from
 * its own real passing rule results (never another program's, never
 * invented). Sorted by category priority so the most load-bearing facts
 * (LTV, DSCR, documentation) surface first. */
export function whyThisLender(e: ProgramEvaluation, maxItems = 6): string[] {
  const passes = e.ruleResults.filter((r) => r.outcome === RuleOutcome.Pass);
  const sorted = [...passes].sort((a, b) => {
    const ai = CATEGORY_PRIORITY.indexOf(a.category);
    const bi = CATEGORY_PRIORITY.indexOf(b.category);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of sorted) {
    if (seen.has(r.userExplanation)) continue;
    seen.add(r.userExplanation);
    out.push(r.userExplanation);
    if (out.length >= maxItems) break;
  }
  if (e.interestOnlyAvailable && out.length < maxItems) out.push("Interest-only payment option available.");
  return out;
}

/** Real, non-hard concerns worth flagging before submission — the soft
 * fails, warnings, and manual-review items this SAME program's own rule
 * evaluation already produced. Never invented; a program with none of
 * these returns an empty array (the card simply omits the section). */
export function potentialIssues(e: ProgramEvaluation): string[] {
  const soft = e.ruleResults.filter((r) => r.outcome === RuleOutcome.Fail && r.severity !== RuleSeverity.Hard);
  const items = [...e.warnings, ...soft, ...e.manualReviewItems];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of items) {
    if (seen.has(r.userExplanation)) continue;
    seen.add(r.userExplanation);
    out.push(r.userExplanation);
  }
  return out;
}

/** A short, templated summary paragraph — every clause maps to a real
 * field on this evaluation (score, status, LTV/DTI/DSCR caps, reserve
 * months, warning count). Deliberately NOT free-form LLM prose: the goal
 * is a readable sentence, not novel reasoning the rule engine didn't
 * already produce. */
export function aiNarrative(e: ProgramEvaluation, rank: number, runnerUpName?: string): string {
  const rankWord = rank === 0 ? "ranks first" : `ranks #${rank + 1}`;
  const facts: string[] = [];
  if (e.maxLtv != null) facts.push(`up to ${e.maxLtv}% LTV`);
  if (e.maxDti != null) facts.push(`DTI up to ${e.maxDti}%`);
  const dscrPass = e.ruleResults.find((r) => r.category === "dscr" && r.outcome === RuleOutcome.Pass);
  if (dscrPass) facts.push("the DSCR requirement satisfied");
  if (e.estimatedReservesRequiredMonths != null) facts.push(`${e.estimatedReservesRequiredMonths} months of reserves required`);
  const factsText = facts.length > 0 ? ` based on ${joinNaturally(facts)}` : "";

  const concernCount = potentialIssues(e).length;
  const concernClause =
    concernCount > 0
      ? ` ${concernCount === 1 ? "One item" : `${concernCount} items`} noted below should be confirmed before submission.`
      : " No outstanding concerns were identified for this scenario.";

  const comparisonClause = runnerUpName
    ? ` ${runnerUpName} is also competitive, but ${e.lenderName} currently scores higher overall.`
    : "";

  return `${e.lenderName} ${rankWord} with a ${e.matchScore}% match score${factsText}.${concernClause}${comparisonClause}`;
}

function joinNaturally(items: string[]): string {
  if (items.length === 1) return items[0] ?? "";
  const last = items[items.length - 1] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${last}`;
}
