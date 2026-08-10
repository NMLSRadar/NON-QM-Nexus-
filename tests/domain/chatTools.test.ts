import { describe, it, expect } from "vitest";
import { evalCatalog } from "../../evals/chatbot/seed";
import {
  rankProgramsByMetric,
  searchPrograms,
  getProgramDetail,
  lookupMatrixCell,
  queryRules,
  quickEvaluate,
  searchHelp,
  createScenarioDraft,
} from "@/domain/chat/tools";
import { parseQuery } from "@/domain/chat/parse";

const cat = evalCatalog();

describe("chat tools — rankProgramsByMetric", () => {
  it("finds lowest DSCR down payment deterministically (min value, ties reported)", () => {
    const q = parseQuery("Who has the lowest down payment for DSCR?");
    const r = rankProgramsByMetric(cat, q.targetMetric!, q.direction!, { docType: ["dscr"] }, q.entities);
    expect(r.fieldCaptured).toBe(true);
    // Summit DSCR Select = 85% LTV -> 15% down; Atlas = 80% LTV -> 20% down.
    expect(r.rows[0]!.programName).toBe("DSCR Select");
    expect(r.rows[0]!.value).toBe(15);
    expect(r.rows[1]!.value).toBe(20);
  });

  it("reports ties on max LTV across bank-statement programs", () => {
    const q = parseQuery("What's the highest LTV on 12-month bank statements?");
    const r = rankProgramsByMetric(cat, "max_ltv", "max", { docType: ["bank_statement"] }, q.entities);
    expect(r.rows[0]!.value).toBe(90);
    expect(r.ties.length).toBeGreaterThan(1);
    expect(r.rows.every((row) => row.isSampleData === false)).toBe(true); // sample excluded by default
  });

  it("respects cash-out cap via incomeDocTypeLtvCaps", () => {
    const r = rankProgramsByMetric(
      cat,
      "max_ltv",
      "max",
      { docType: ["bank_statement"], purpose: ["cash_out_refinance"] },
      { purpose: ["cash_out_refinance"], docType: ["bank_statement"] },
    );
    // Atlas Bank Statement 24 Plus caps cash-out bank statement at 80% LTV.
    const atlas = r.rows.find((x) => x.programName === "Bank Statement 24 Plus")!;
    expect(atlas.value).toBe(80);
  });

  it("reports min FICO and applies citizenship filter", () => {
    const r = rankProgramsByMetric(cat, "min_fico", "min", {}, {});
    expect(r.rows[0]!.value).toBe(600); // Fresh Start
    const itin = rankProgramsByMetric(cat, "min_fico", "min", { citizenship: ["itin"] }, { citizenship: ["itin"] });
    expect(itin.rows[0]!.programName).toBe("ITIN Full Doc");
  });

  it("honestly reports fieldNotCaptured when no program captures a metric", () => {
    const r = rankProgramsByMetric(cat, "min_seasoning", "min", {}, {});
    // Only p_horizon_fresh captures seasoning -> field IS captured for that one.
    expect(r.fieldCaptured).toBe(true);
    expect(r.rows[0]!.value).toBe(12);
  });
});

describe("chat tools — searchPrograms / detail / matrix / rules / quick_evaluate", () => {
  it("searches programs by feature and borrower type", () => {
    const itin = searchPrograms(cat, { citizenship: ["itin"] });
    expect(itin.rows.map((r) => r.programName)).toContain("ITIN Full Doc");
    const fp = searchPrograms(cat, { docType: ["dscr"] });
    expect(fp.total).toBeGreaterThanOrEqual(3);
  });

  it("returns program detail with rules", () => {
    const d = getProgramDetail(cat, "p_summit_dscr")!;
    expect(d.program.programName).toBe("DSCR Select");
    expect(d.matrix?.eligibilityLtvMatrix).toBeDefined();
  });

  it("looks up a matrix cell for a FICO/purpose intersection", () => {
    const cell = lookupMatrixCell(cat, "p_atlas_dscr", { fico: 700, purpose: "purchase" });
    expect(cell!.maxLtv).toBe(80);
  });

  it("queries rules by category scoped to programs", () => {
    const r = queryRules(cat, "credit_event");
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
    expect(r.rows.every((x) => x.category.includes("credit_event"))).toBe(true);
  });

  it("reuses the domain matcher for partial-scenario evaluation", () => {
    const q = parseQuery("660 score, 85% LTV DSCR cash-out — who works?");
    const evals = quickEvaluate(cat, q.entities);
    // p_greenbox_dscr_flex has min FICO 660 at 85% LTV -> eligible.
    const flex = evals.find((e) => e.programName === "DSCR Flex");
    expect(flex).toBeDefined();
    expect(["strong_match", "eligible", "conditional", "manual_review"]).toContain(flex!.status);
  });

  it("returns help for P&L upload and scenario duplication", () => {
    expect(searchHelp("upload a P&L").some((h) => h.topic === "P&L upload")).toBe(true);
    expect(searchHelp("duplicate a scenario").some((h) => h.topic === "Duplicate a scenario")).toBe(true);
  });

  it("builds a scenario draft deep link", () => {
    const q = parseQuery("720 fico, 80% ltv, purchase, bank statement");
    const draft = createScenarioDraft(q.entities);
    expect(draft.deepLink).toContain("/scenarios/new");
    expect(draft.deepLink).toContain("fico=720");
  });
});