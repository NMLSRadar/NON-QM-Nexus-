import { describe, expect, it } from "vitest";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import type { ProgramCatalog } from "@/domain/analyze";
import {
  createScenarioDraftLink,
  defineTerm,
  getProgramDetail,
  lookupMatrixCell,
  quickEvaluate,
  rankProgramsByMetric,
  searchHelp,
  searchPrograms,
} from "@/domain/chat/tools";

const catalog: ProgramCatalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };

describe("searchPrograms", () => {
  it("ITIN availability returns only itin-eligible programs, with citations", () => {
    const res = searchPrograms(catalog, { citizenship: ["itin"] });
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      const program = samplePrograms.find((p) => p.id === row.programId)!;
      expect(program.citizenshipEligible).toContain("itin");
      expect(row.guidelineVersion).toBeTruthy();
      expect(row.sourceCitation).toBeTruthy();
      expect(row.isSampleData).toBe(true);
    }
  });

  it("LLC vesting filter", () => {
    const res = searchPrograms(catalog, { vesting: ["llc"] });
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(samplePrograms.find((p) => p.id === row.programId)!.vestingEligible).toContain("llc");
    }
  });

  it("conjunctive ITIN + DSCR requires the dedicated combination flag", () => {
    const res = searchPrograms(catalog, { citizenship: ["itin"], docType: ["dscr"] });
    // Atlas DSCR lists itin in citizenshipEligible + dscr doc type, but has no
    // itinDscrEligible flag → must land in unconfirmed, never a confident row.
    expect(res.rows).toHaveLength(0);
    expect(res.unconfirmedRows.length).toBeGreaterThan(0);
    expect(res.unconfirmedRows[0]!.caveats.join(" ")).toMatch(/not yet verified/i);
  });

  it("mortgage-late filter splits tolerant vs undocumented programs", () => {
    const res = searchPrograms(catalog, {
      docType: ["bank_statement"],
      latePattern: { count: 2, days: 30, lookbackMonths: 12, raw: "2x30x12" },
    });
    // Horizon tolerates 2x30x12; Summit (max 1) hard-fails; Harbor Fresh Start tolerates 3.
    const names = res.rows.map((r) => r.programName);
    expect(names).toContain("24-Mo Bank Statement Plus (Sample)");
    expect(names).toContain("Fresh Start Credit-Event (Sample)");
    expect(names).not.toContain("12/24-Mo Bank Statement (Sample)");
  });
});

describe("rankProgramsByMetric", () => {
  it("lowest DSCR down payment is computed server-side with ties + gating", () => {
    const res = rankProgramsByMetric(catalog, "min_down_payment", "min", { docType: ["dscr"] });
    expect(res.rows.length).toBeGreaterThan(0);
    const best = res.rows[0]!;
    // Atlas DSCR Investor: best tier 80 LTV → 20% down.
    expect(best.value).toBe(20);
    expect(best.unit).toBe("percent");
    expect(res.tieSet.length).toBeGreaterThanOrEqual(1);
    expect(res.tieSet.every((r) => r.value === best.value)).toBe(true);
    // Values ordered ascending for a min query
    for (let i = 1; i < res.rows.length; i++) {
      expect(res.rows[i]!.value).toBeGreaterThanOrEqual(res.rows[i - 1]!.value);
    }
  });

  it("lowest FICO across the library, including no-FICO foreign national", () => {
    const res = rankProgramsByMetric(catalog, "min_fico", "min", {});
    const best = res.rows[0]!;
    expect(best.value).toBe(0); // Harbor FN program: FICO not required
    expect(best.gatingConditions.join(" ")).toMatch(/no u\.s\. fico/i);
  });

  it("max DTI excludes DSCR programs as unpopulated with a reason", () => {
    const res = rankProgramsByMetric(catalog, "max_dti", "max", {});
    expect(res.rows[0]!.value).toBe(50);
    expect(res.unpopulated.length).toBeGreaterThan(0);
    expect(res.unpopulated.some((u) => /dscr/i.test(u.reason))).toBe(true);
  });

  it("shortest BK seasoning reads creditEventSeasoning and reports unpopulated programs", () => {
    const res = rankProgramsByMetric(catalog, "min_seasoning", "min", { creditEvents: ["bk7"] });
    expect(res.rows[0]!.value).toBe(12); // Harbor Fresh Start bk7_discharge 12mo
    expect(res.rows[0]!.lenderName).toMatch(/Harbor/);
    expect(res.unpopulated.length).toBeGreaterThan(0);
  });

  it("min loan amount for DSCR", () => {
    const res = rankProgramsByMetric(catalog, "min_loan_amount", "min", { docType: ["dscr"] });
    expect(res.rows[0]!.value).toBe(100_000);
  });
});

describe("lookupMatrixCell / getProgramDetail", () => {
  it("matrix cell honors FICO tier via the matcher's own derivation", () => {
    const cell = lookupMatrixCell(catalog, "prog_summit_bs12", { fico: 705, purpose: "purchase" });
    expect(cell.found).toBe(true);
    expect(cell.maxLtv).toBe(85); // 700-739 tier
    expect(cell.minDownPaymentPct).toBe(15);
  });

  it("unknown program id reports not found — never invents", () => {
    const cell = lookupMatrixCell(catalog, "prog_does_not_exist", { fico: 700 });
    expect(cell.found).toBe(false);
  });

  it("program detail round-trips", () => {
    const detail = getProgramDetail(catalog, "prog_atlas_dscr");
    expect(detail.found).toBe(true);
    expect(detail.detail!.citation.lenderName).toMatch(/Atlas/);
  });
});

describe("quickEvaluate", () => {
  it("reuses the real matcher and reports assumptions", () => {
    const res = quickEvaluate(catalog, { docType: ["dscr"], fico: 700, occupancy: ["investment"] });
    expect(res.assumptionNote).toMatch(/unknown/);
    for (const row of res.rows) {
      expect(row.status).not.toBe("ineligible");
      expect(row.citation.sourceCitation).toBeTruthy();
    }
  });
});

describe("help + glossary + deep link", () => {
  it("finds the P&L upload help entry", () => {
    const res = searchHelp("where do i upload a pnl");
    expect(res.entries[0]?.id).toBe("upload_pnl");
  });
  it("defines the late-pattern shorthand", () => {
    const res = defineTerm("what does 2x30x12 mean mortgage lates");
    expect(res.entries.some((e) => e.id === "late_pattern")).toBe(true);
  });
  it("builds a prefilled scenario link", () => {
    const link = createScenarioDraftLink({ docType: ["dscr"], fico: 700, ltv: 80 });
    expect(link.url).toContain("/scenarios/new?");
    expect(link.url).toContain("incomeDocType=dscr");
    expect(link.url).toContain("fico=700");
  });
});
