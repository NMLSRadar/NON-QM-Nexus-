import { describe, expect, it } from "vitest";
import { analyzeScenario } from "@/domain/analyze";
import { classifyStatus, rankEvaluations } from "@/domain/matching/evaluateProgram";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import { sampleScenarios } from "@/data/sampleScenarios";
import type { RuleEvaluationResult } from "@/domain/types/results";

const catalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };
const ASOF = new Date("2026-07-01");

function byId(id: string) {
  const s = sampleScenarios.find((x) => x.id === id);
  if (!s) throw new Error(`missing scenario ${id}`);
  return s;
}

function evalFor(scenarioId: string, programId: string) {
  const result = analyzeScenario(byId(scenarioId), catalog, ASOF);
  const e = result.evaluations.find((x) => x.programId === programId);
  if (!e) throw new Error(`missing evaluation ${programId}`);
  return e;
}

function rr(outcome: RuleEvaluationResult["outcome"], severity: RuleEvaluationResult["severity"] = "soft"): RuleEvaluationResult {
  return { ruleId: "x", ruleName: "x", category: "x", outcome, severity, userExplanation: "" };
}

describe("status classification", () => {
  it("hard fail => ineligible", () => {
    expect(classifyStatus([rr("pass"), rr("fail", "hard")], 90)).toBe("ineligible");
  });
  it("soft fail => conditional", () => {
    expect(classifyStatus([rr("pass"), rr("fail", "soft")], 90)).toBe("conditional");
  });
  it("manual review with no fails => manual_review", () => {
    expect(classifyStatus([rr("pass"), rr("manual_review")], 90)).toBe("manual_review");
  });
  it("warnings => conditional", () => {
    expect(classifyStatus([rr("pass"), rr("warning")], 90)).toBe("conditional");
  });
  it("clean + high score => strong match", () => {
    expect(classifyStatus([rr("pass")], 90)).toBe("strong_match");
  });
  it("clean + moderate score => eligible", () => {
    expect(classifyStatus([rr("pass")], 70)).toBe("eligible");
  });
});

describe("sample scenario regression: bank-statement primary (scn_bs_primary)", () => {
  it("computes the documented qualifying income ($14,700)", () => {
    const result = analyzeScenario(byId("scn_bs_primary"), catalog, ASOF);
    expect(result.calculation.qualifyingMonthlyIncome?.value).toBe(14_700);
  });

  it("Summit BS12 requires manual review of cash/ATM deposits", () => {
    const e = evalFor("scn_bs_primary", "prog_summit_bs12");
    expect(["manual_review", "conditional"]).toContain(e.status);
    expect(e.manualReviewItems.map((m) => m.ruleId)).toContain("r_summit_bs_cash_deposits");
  });

  it("derives max LTV 85 from the FICO matrix (FICO 725)", () => {
    const e = evalFor("scn_bs_primary", "prog_summit_bs12");
    expect(e.maxLtv).toBe(85);
  });
});

describe("sample scenario regression: DSCR investor (scn_dscr)", () => {
  it("is eligible or strong at Atlas DSCR with DSCR >= 1", () => {
    const result = analyzeScenario(byId("scn_dscr"), catalog, ASOF);
    expect(result.calculation.dscr?.value).toBeGreaterThan(1);
    const e = evalFor("scn_dscr", "prog_atlas_dscr");
    expect(["strong_match", "eligible", "manual_review"]).toContain(e.status);
    expect(e.failedRules).toHaveLength(0);
  });
});

describe("sample scenario regression: first-time investor (scn_dscr_fti)", () => {
  it("fails the DSCR>=1.20 first-time-investor rule when DSCR is below 1.20", () => {
    const result = analyzeScenario(byId("scn_dscr_fti"), catalog, ASOF);
    const dscr = result.calculation.dscr?.value ?? 0;
    const e = evalFor("scn_dscr_fti", "prog_atlas_dscr");
    if (dscr < 1.2) {
      expect(e.status).toBe("ineligible");
      expect(e.failedRules.map((f) => f.ruleId)).toContain("r_atlas_dscr_fti");
    } else {
      expect(e.failedRules.map((f) => f.ruleId)).not.toContain("r_atlas_dscr_fti");
    }
  });
});

describe("sample scenario regression: rural property (scn_rural)", () => {
  it("is ineligible everywhere (no sample program accepts rural)", () => {
    const result = analyzeScenario(byId("scn_rural"), catalog, ASOF);
    for (const e of result.evaluations) {
      expect(e.status).toBe("ineligible");
    }
  });
});

describe("sample scenario regression: recent bankruptcy (scn_recent_bk)", () => {
  it("is ineligible at Summit (48-mo seasoning) and at Fresh Start at 80% LTV (70% cap)", () => {
    const summit = evalFor("scn_recent_bk", "prog_summit_bs12");
    expect(summit.status).toBe("ineligible");
    const fresh = evalFor("scn_recent_bk", "prog_harbor_recent_credit");
    expect(fresh.status).toBe("ineligible");
    expect(fresh.failedRules.map((f) => f.ruleId)).toContain("r_harbor_fresh_bk_ltv");
  });

  it("restructuring suggests lowering LTV and it unlocks Fresh Start", () => {
    const result = analyzeScenario(byId("scn_recent_bk"), catalog, ASOF);
    const ltvOption = result.restructuring.find((o) => o.changedVariable.includes("LTV"));
    expect(ltvOption).toBeDefined();
    expect(ltvOption!.programsPotentiallyUnlocked.join(" ")).toContain("Fresh Start");
  });
});

describe("sample scenario regression: high DTI (scn_high_dti)", () => {
  it("is ineligible on DTI now", () => {
    const result = analyzeScenario(byId("scn_high_dti"), catalog, ASOF);
    expect(result.calculation.dti?.value).toBeGreaterThan(50);
    const e = evalFor("scn_high_dti", "prog_evergreen_fulldoc");
    expect(e.status).toBe("ineligible");
  });

  it("restructuring via debt payoff unlocks at least one program", () => {
    const result = analyzeScenario(byId("scn_high_dti"), catalog, ASOF);
    const payoff = result.restructuring.find((o) => o.changedVariable.includes("liabilities"));
    expect(payoff).toBeDefined();
    expect(payoff!.programsPotentiallyUnlocked.length).toBeGreaterThan(0);
  });
});

describe("sample scenario regression: foreign national (scn_foreign_national)", () => {
  it("matches Harbor FN with OFAC manual review", () => {
    const e = evalFor("scn_foreign_national", "prog_harbor_fn");
    expect(e.status).toBe("manual_review");
    expect(e.manualReviewItems.map((m) => m.ruleId)).toContain("r_harbor_fn_ofac");
  });

  it("is ineligible at citizen-only programs", () => {
    const e = evalFor("scn_foreign_national", "prog_summit_bs12");
    expect(e.status).toBe("ineligible");
  });
});

describe("ranking", () => {
  it("orders by status band then score", () => {
    const result = analyzeScenario(byId("scn_bs_primary"), catalog, ASOF);
    const ranked = rankEvaluations(result.evaluations);
    const bands = ranked.map((e) => e.status);
    const order = ["strong_match", "eligible", "conditional", "eligible_with_restructuring", "manual_review", "ineligible"];
    const indices = bands.map((b) => order.indexOf(b));
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it("every evaluation carries a score breakdown and disclaimer", () => {
    const result = analyzeScenario(byId("scn_dscr"), catalog, ASOF);
    for (const e of result.evaluations) {
      expect(e.scoreBreakdown.length).toBeGreaterThan(0);
      expect(e.disclaimer).toContain("Preliminary scenario analysis only");
      expect(e.isSampleData).toBe(true);
    }
  });
});

describe("needs list", () => {
  it("includes bank-statement items for bank-statement scenarios", () => {
    const result = analyzeScenario(byId("scn_bs_primary"), catalog, ASOF);
    const labels = result.needsList.map((n) => n.label.toLowerCase());
    expect(labels.some((l) => l.includes("bank statements"))).toBe(true);
    expect(labels.some((l) => l.includes("cash/atm"))).toBe(true);
  });

  it("includes passport items for foreign nationals", () => {
    const result = analyzeScenario(byId("scn_foreign_national"), catalog, ASOF);
    expect(result.needsList.some((n) => n.label.toLowerCase().includes("passport"))).toBe(true);
  });
});
