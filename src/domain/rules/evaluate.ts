import { RuleOutcome } from "../types/enums";
import { isCondition, type Rule, type RuleCondition, type RuleGroup } from "../types/program";
import type { RuleEvaluationResult } from "../types/results";
import { buildContext, resolvePath, type EvaluationContext } from "./context";
import { evaluateOperator, type Ternary } from "./operators";
import type { Scenario } from "../types/scenario";
import type { CalculationSummary } from "../types/results";

export { buildContext };
export type { EvaluationContext };

/** Evaluate one leaf condition against the context. */
export function evaluateCondition(ctx: EvaluationContext, cond: RuleCondition): Ternary {
  const actual = resolvePath(ctx, cond.field);
  return evaluateOperator(actual, cond.operator, cond.value);
}

/**
 * Evaluate a nested boolean group with ternary (true/false/unknown) semantics.
 * AND short-circuits on false; OR short-circuits on true; UNKNOWN otherwise
 * propagates so we never silently pass a rule whose inputs are missing.
 */
export function evaluateGroup(ctx: EvaluationContext, group: RuleGroup): Ternary {
  const children = group.all ?? group.any ?? [];
  const isAnd = group.all !== undefined;

  let sawUnknown = false;
  for (const child of children) {
    const result = isCondition(child) ? evaluateCondition(ctx, child) : evaluateGroup(ctx, child);
    if (isAnd) {
      if (result === false) return false;
      if (result === null) sawUnknown = true;
    } else {
      if (result === true) return true;
      if (result === null) sawUnknown = true;
    }
  }
  if (sawUnknown) return null;
  return isAnd; // AND with no false/unknown => true; OR with no true/unknown => false
}

/**
 * Evaluate a single rule. When conditions are TRUE we apply `outcomeWhenTrue`,
 * when FALSE `outcomeWhenFalse`, and when UNKNOWN (missing inputs) we surface a
 * manual-review outcome so a human confirms rather than the engine guessing.
 */
export function evaluateRule(ctx: EvaluationContext, rule: Rule): RuleEvaluationResult {
  const truth = evaluateGroup(ctx, rule.conditions);
  let outcome: RuleOutcome;
  if (truth === true) outcome = rule.outcomeWhenTrue;
  else if (truth === false) outcome = rule.outcomeWhenFalse;
  else outcome = RuleOutcome.ManualReview;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    category: rule.category,
    outcome,
    severity: rule.severity,
    userExplanation: rule.userExplanation,
    internalExplanation: rule.internalExplanation,
    sourceSection: rule.sourceSection,
    sourcePage: rule.sourcePage,
  };
}

/** Convenience: build context and evaluate a list of rules. */
export function evaluateRules(
  scenario: Scenario,
  calc: CalculationSummary,
  rules: Rule[],
): RuleEvaluationResult[] {
  const ctx = buildContext(scenario, calc);
  return rules.map((rule) => evaluateRule(ctx, rule));
}
