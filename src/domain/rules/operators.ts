import type { RuleOperator, RuleValue } from "../types/program";

/**
 * Ternary evaluation: a condition can be TRUE, FALSE, or UNKNOWN (null) when the
 * field it references is absent. UNKNOWN never silently passes a hard rule; the
 * rule evaluator maps UNKNOWN to manual review where appropriate.
 */
export type Ternary = true | false | null;

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function evaluateOperator(actual: unknown, operator: RuleOperator, expected?: RuleValue): Ternary {
  const missing = actual === undefined || actual === null;

  switch (operator) {
    case "exists":
      return !missing;
    case "not_exists":
      return missing;
    case "equals":
      if (missing) return null;
      return actual === expected;
    case "not_equals":
      if (missing) return null;
      return actual !== expected;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toNumber(actual);
      const b = toNumber(expected as RuleValue);
      if (a === null || b === null) return null;
      if (operator === "gt") return a > b;
      if (operator === "gte") return a >= b;
      if (operator === "lt") return a < b;
      return a <= b;
    }
    case "between": {
      const a = toNumber(actual);
      if (a === null || !Array.isArray(expected) || expected.length !== 2) return null;
      const lo = toNumber(expected[0]);
      const hi = toNumber(expected[1]);
      if (lo === null || hi === null) return null;
      return a >= lo && a <= hi;
    }
    case "in":
      if (missing) return null;
      return Array.isArray(expected) ? (expected as Array<string | number>).includes(actual as string | number) : false;
    case "not_in":
      if (missing) return null;
      return Array.isArray(expected) ? !(expected as Array<string | number>).includes(actual as string | number) : true;
    case "contains":
      if (missing) return null;
      if (Array.isArray(actual)) return (actual as Array<unknown>).includes(expected);
      if (typeof actual === "string") return actual.includes(String(expected));
      return false;
    default:
      return null;
  }
}
