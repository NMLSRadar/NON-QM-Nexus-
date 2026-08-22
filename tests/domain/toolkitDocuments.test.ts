import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createCalculatorReportPdf, createTemplatePdf, createTemplateWorkbook, type ToolkitCalculatorId } from "@/lib/toolkit/documents";

describe("NON-QM Nexus branded toolkit documents", () => {
  it.each(["pnl", "dscr"] as const)("creates a valid branded %s PDF template", async (kind) => {
    const bytes = await createTemplatePdf(kind);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(50_000);
  });

  it.each(["pnl", "dscr"] as const)("creates a valid branded %s XLSX template with embedded official logo", async (kind) => {
    const bytes = await createTemplateWorkbook(kind);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const sheet = workbook.worksheets[0];
    expect(workbook.creator).toBe("NON-QM Nexus");
    expect(sheet).toBeDefined();
    expect(sheet!.getImages().length).toBeGreaterThan(0);
    expect(sheet!.headerFooter.oddFooter).toContain("NON-QM Nexus");
  });

  it("creates a server-recomputed PDF for every calculator and the Reverse Solver", async () => {
    const samples: Record<ToolkitCalculatorId, Record<string, unknown>> = {
      dscr: { lease: 5200, market: 5000, taxes: 12000, hazard: 2400, flood: 0, hoa: 0, loan: 600000, rate: 7.25, term: 30, basis: "lower_of_lease_or_market", interestOnly: false },
      "bank-statement": { deposits: 45000, ownership: 100, expense: 50, months: 12, statementType: "business" },
      pnl: { gross: 600000, expenses: 240000, ownership: 100, months: 12, preparer: "cpa" },
      "asset-depletion": { checking: 250000, brokerage: 500000, stocks: 200000, retirement: 350000, vested: 100, down: 200000, costs: 30000, reserves: 50000, divisor: 120 },
      "1099": { yearOne: 180000, yearTwo: 210000, months: 24, expense: 20 },
      ltv: { price: 850000, value: 875000, loan: 680000, liens: 0, payoff: 600000, costs: 12000, doc: "non_qm", condo: "warrantable" },
      "reverse-solver": { cash: 120000, closing: 3, reserves: 30000, income: 18000, liabilities: 1800, dti: 50, rent: 6000, dscr: 1, paymentFactor: 750, doc: "non_qm", condo: "not_condo" },
    };
    for (const calculator of Object.keys(samples) as ToolkitCalculatorId[]) {
      const bytes = await createCalculatorReportPdf(calculator, samples[calculator], "FILE-2026-014");
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(1);
      expect(bytes.byteLength).toBeGreaterThan(50_000);
    }
  });
});
