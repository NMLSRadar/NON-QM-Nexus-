import { describe, expect, it } from "vitest";
import { evaluateGroup, evaluateRule, buildContext } from "@/domain/rules/evaluate";
import { evaluateOperator } from "@/domain/rules/operators";
import { isRuleActive } from "@/domain/rules/activeRules";
import { runCalculations } from "@/domain/calc";
import type { Rule } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";

function scenario(overrides: Partial<Scenario>): Scenario {
  return {
    id: "t",
    organizationId: "org_demo",
    name: "test",
    createdByUserId: "u",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function ctxFor(overrides: Partial<Scenario>) {
  const s = scenario(overrides);
  return buildContext(s, runCalculations(s));
}

describe("operators", () => {
  it("handles numeric comparisons", () => {
    expect(evaluateOperator(700, "gte", 680)).toBe(true);
    expect(evaluateOperator(650, "gte", 680)).toBe(false);
    expect(evaluateOperator(650, "lt", 680)).toBe(true);
    expect(evaluateOperator(5, "between", [1, 10])).toBe(true);
    expect(evaluateOperator(11, "between", [1, 10])).toBe(false);
  });

  it("returns UNKNOWN (null) for missing values instead of passing", () => {
    expect(evaluateOperator(undefined, "gte", 680)).toBeNull();
    expect(evaluateOperator(null, "equals", "primary")).toBeNull();
  });

  it("handles set membership", () => {
    expect(evaluateOperator("primary", "in", ["primary", "second_home"])).toBe(true);
    expect(evaluateOperator("investment", "not_in", ["primary"])).toBe(true);
  });

  it("handles existence", () => {
    expect(evaluateOperator(undefined, "not_exists")).toBe(true);
    expect(evaluateOperator(0, "exists")).toBe(true);
  });
});

describe("nested groups", () => {
  it("evaluates nested AND/OR", () => {
    const ctx = ctxFor({ fico: 700, occupancy: "primary", incomeDocType: "bank_statement" });
    const group = {
      all: [
        { field: "incomeDocType", operator: "equals" as const, value: "bank_statement" },
        {
          any: [
            { field: "occupancy", operator: "equals" as const, value: "primary" },
            { field: "fico", operator: "gte" as const, value: 760 },
          ],
        },
      ],
    };
    expect(evaluateGroup(ctx, group)).toBe(true);
  });

  it("AND short-circuits false over unknown", () => {
    const ctx = ctxFor({}); // fico missing
    const group = {
      all: [
        { field: "fico", operator: "gte" as const, value: 700 }, // unknown
        { field: "occupancy", operator: "equals" as const, value: "primary" }, // unknown
      ],
    };
    expect(evaluateGroup(ctx, group)).toBeNull();
  });

  it("OR returns true when any branch is true even with unknowns", () => {
    const ctx = ctxFor({ occupancy: "primary" });
    const group = {
      any: [
        { field: "fico", operator: "gte" as const, value: 700 }, // unknown
        { field: "occupancy", operator: "equals" as const, value: "primary" }, // true
      ],
    };
    expect(evaluateGroup(ctx, group)).toBe(true);
  });
});

const baseRule: Rule = {
  id: "r1",
  lenderId: "l",
  programId: "p",
  guidelineVersionId: "g",
  category: "fico",
  name: "Min FICO 680",
  conditions: { all: [{ field: "fico", operator: "gte", value: 680 }] },
  outcomeWhenTrue: "pass",
  outcomeWhenFalse: "fail",
  severity: "hard",
  userExplanation: "FICO must be at least 680.",
  verificationStatus: "human_verified",
};

describe("rule evaluation", () => {
  it("hard-fail rule fails when conditions are false", () => {
    const r = evaluateRule(ctxFor({ fico: 650 }), baseRule);
    expect(r.outcome).toBe("fail");
  });

  it("passes when conditions are true", () => {
    const r = evaluateRule(ctxFor({ fico: 700 }), baseRule);
    expect(r.outcome).toBe("pass");
  });

  it("maps missing inputs to manual review, never silent pass", () => {
    const r = evaluateRule(ctxFor({}), baseRule);
    expect(r.outcome).toBe("manual_review");
  });

  it("supports warning rules", () => {
    const warnRule: Rule = { ...baseRule, outcomeWhenFalse: "warning", severity: "soft" };
    const r = evaluateRule(ctxFor({ fico: 650 }), warnRule);
    expect(r.outcome).toBe("warning");
  });

  it("supports manual-review rules", () => {
    const mrRule: Rule = {
      ...baseRule,
      conditions: { all: [{ field: "bankStatement.hasCashDeposits", operator: "equals", value: true }] },
      outcomeWhenTrue: "manual_review",
      outcomeWhenFalse: "pass",
    };
    const r = evaluateRule(
      ctxFor({ bankStatement: { personalOrBusiness: "business", months: 12, hasCashDeposits: true } }),
      mrRule,
    );
    expect(r.outcome).toBe("manual_review");
  });

  it("rules can read calculated values via calc.*", () => {
    const ltvRule: Rule = {
      ...baseRule,
      conditions: { all: [{ field: "calc.ltv", operator: "lte", value: 80 }] },
    };
    const passing = evaluateRule(
      ctxFor({ loanPurpose: "purchase", purchasePrice: 400_000, estimatedValue: 400_000, requestedLoanAmount: 300_000 }),
      ltvRule,
    );
    expect(passing.outcome).toBe("pass");

    const failing = evaluateRule(
      ctxFor({ loanPurpose: "purchase", purchasePrice: 400_000, estimatedValue: 400_000, requestedLoanAmount: 340_000 }),
      ltvRule,
    );
    expect(failing.outcome).toBe("fail");
  });
});

describe("effective-date selection", () => {
  const dated: Rule = { ...baseRule, effectiveDate: "2026-01-01", expirationDate: "2026-12-31" };

  it("is active within its window", () => {
    expect(isRuleActive(dated, new Date("2026-06-15"))).toBe(true);
  });

  it("is inactive before its effective date", () => {
    expect(isRuleActive(dated, new Date("2025-12-31"))).toBe(false);
  });

  it("is inactive on/after expiration (expired guideline handling)", () => {
    expect(isRuleActive(dated, new Date("2026-12-31"))).toBe(false);
    expect(isRuleActive(dated, new Date("2027-03-01"))).toBe(false);
  });

  it("draft and AI-extracted rules are never active", () => {
    expect(isRuleActive({ ...dated, verificationStatus: "draft" }, new Date("2026-06-15"))).toBe(false);
    expect(isRuleActive({ ...dated, verificationStatus: "ai_extracted_pending_review" }, new Date("2026-06-15"))).toBe(false);
  });
});
