import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

interface ImportedProgram {
  lender: string;
  name: string;
  config: Record<string, unknown> & {
    incomeDocTypes: string[];
    propertyTypeLtvCaps: Record<string, number>;
    minDownPercent: number;
    pnlTaxReturnsRequired?: boolean;
    importStatus: string;
  };
}

let payload: {
  lenderCount: number;
  programCount: number;
  pendingReviewCount: number;
  programs: ImportedProgram[];
};

beforeAll(() => {
  const root = path.resolve(__dirname, "../..");
  payload = JSON.parse(
    execFileSync(process.execPath, ["scripts/ingest_mtg_broker_pending_2026_08_22.mjs", "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }),
  );
});

describe("Mtg.Broker pending-review catalog import 2026-08-22", () => {
  it("contains the complete deduplicated residential NON-QM extraction", () => {
    expect(payload.lenderCount).toBe(74);
    expect(payload.programCount).toBe(385);
    expect(payload.pendingReviewCount).toBe(385);
    expect(new Set(payload.programs.map((item) => `${item.lender}:${item.name}`)).size).toBe(385);
  });

  it("keeps every imported program quarantined pending human guideline review", () => {
    expect(payload.programs.every((item) => item.config.importStatus === "imported_pending_review")).toBe(true);
  });

  it("enforces the standing 10% minimum down and condo caps", () => {
    for (const item of payload.programs) {
      expect(item.config.minDownPercent).toBe(10);
      expect(item.config.propertyTypeLtvCaps.condo).toBeLessThanOrEqual(85);
      expect(item.config.propertyTypeLtvCaps.non_warrantable_condo).toBeLessThanOrEqual(80);
    }
  });

  it("keeps P&L-only separate from bank statements and never requires tax returns", () => {
    const pnlPrograms = payload.programs.filter((item) => item.config.incomeDocTypes.includes("pnl_only"));
    expect(pnlPrograms.length).toBe(50);
    for (const item of pnlPrograms) {
      expect(item.config.incomeDocTypes).not.toContain("bank_statement");
      expect(item.config.pnlTaxReturnsRequired).toBe(false);
    }
  });
});
