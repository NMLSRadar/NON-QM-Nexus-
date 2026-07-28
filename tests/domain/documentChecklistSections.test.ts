import { describe, expect, it } from "vitest";
import { buildDocumentChecklistSections } from "@/app/document-checklists/sections";

// Regression tests for the external-audit-flagged mapping bugs on
// /document-checklists (2026-07-28):
//   a. DSCR had no section; its items (lease/STR history, 1007/1025
//      appraisal, PITIA components) leaked into "Foreign National"
//      because that section's synthetic scenario hardcoded
//      incomeDocType: "dscr".
//   b. ITIN listed bank-statement items (12-mo statements, business
//      narrative, ownership evidence) as universally "Required" because
//      its synthetic scenario hardcoded incomeDocType: "bank_statement".
//   c. Asset Depletion and 1099 sections were missing entirely.
describe("Document checklist sections — every supported income type has its own section", () => {
  const sections = buildDocumentChecklistSections();
  const titles = sections.map((s) => s.title);

  it("includes a section for every income doc type the schema models, plus the two citizenship overlays", () => {
    for (const title of ["Bank Statement", "Profit & Loss (P&L) Only", "DSCR", "Asset Depletion", "1099", "Full Documentation", "Foreign National", "ITIN"]) {
      expect(titles, `missing section: ${title}`).toContain(title);
    }
  });
});

describe("DSCR items never render under Foreign National", () => {
  const sections = buildDocumentChecklistSections();
  const dscr = sections.find((s) => s.title === "DSCR")!;
  const foreignNational = sections.find((s) => s.title === "Foreign National")!;

  it("DSCR has its own section containing the real DSCR-specific documents", () => {
    const labels = dscr.purchase.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes("lease agreement") || l.includes("str operating history"))).toBe(true);
    expect(labels.some((l) => l.includes("1007") || l.includes("1025"))).toBe(true);
    expect(labels.some((l) => l.includes("taxes, insurance, hoa"))).toBe(true);
  });

  it("Foreign National does NOT contain any DSCR-specific document (the exact bug reported)", () => {
    const labels = foreignNational.purchase.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes("lease agreement") || l.includes("str operating history"))).toBe(false);
    expect(labels.some((l) => l.includes("1007") || l.includes("1025"))).toBe(false);
    expect(labels.some((l) => l.includes("taxes, insurance, hoa"))).toBe(false);
  });

  it("Foreign National shows income documentation as program-dependent, not a specific doc type's items", () => {
    const labels = foreignNational.purchase.map((i) => i.label.toLowerCase());
    const note = foreignNational.purchase.find((i) => i.label.toLowerCase().includes("income documentation"));
    expect(note).toBeDefined();
    expect(note?.required).toBe(false);
    // still keeps its own real FN-specific items
    expect(labels.some((l) => l.includes("passport"))).toBe(true);
    expect(labels.some((l) => l.includes("visa"))).toBe(true);
  });
});

describe("ITIN bank-statement items are not universally required", () => {
  const sections = buildDocumentChecklistSections();
  const itin = sections.find((s) => s.title === "ITIN")!;

  it("the main ITIN list contains no bank-statement-specific item marked required", () => {
    const bankStatementRequired = itin.purchase.filter(
      (i) => i.required && (i.label.toLowerCase().includes("bank statement") || i.label.toLowerCase().includes("business narrative") || i.label.toLowerCase().includes("ownership")),
    );
    expect(bankStatementRequired).toHaveLength(0);
  });

  it("bank-statement items appear ONLY in the conditional 'if applicable' sub-list, marked not required", () => {
    expect(itin.conditionalTitle).toMatch(/bank-statement-documented ITIN/i);
    expect(itin.conditionalPurchase && itin.conditionalPurchase.length).toBeGreaterThan(0);
    for (const item of itin.conditionalPurchase ?? []) {
      expect(item.required).toBe(false);
    }
    const conditionalLabels = (itin.conditionalPurchase ?? []).map((i) => i.label.toLowerCase());
    expect(conditionalLabels.some((l) => l.includes("months") && l.includes("business"))).toBe(true);
  });

  it("ITIN still shows its own real universal identity items as required", () => {
    const labels = itin.purchase.filter((i) => i.required).map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes("both pages"))).toBe(true);
    expect(labels.some((l) => l.includes("second form of identification"))).toBe(true);
  });
});

describe("Purchase vs. Refinance toggle", () => {
  const sections = buildDocumentChecklistSections();

  it("every section's Purchase list requires a purchase contract, never a mortgage statement", () => {
    for (const s of sections) {
      const labels = s.purchase.map((i) => i.label.toLowerCase());
      expect(labels.some((l) => l.includes("purchase contract")), s.title).toBe(true);
      expect(labels.some((l) => l.includes("mortgage statement")), s.title).toBe(false);
    }
  });

  it("every section's Refinance list requires a current mortgage statement, never a purchase contract", () => {
    for (const s of sections) {
      const labels = s.refinance.map((i) => i.label.toLowerCase());
      expect(labels.some((l) => l.includes("mortgage statement")), s.title).toBe(true);
      expect(labels.some((l) => l.includes("purchase contract")), s.title).toBe(false);
    }
  });
});
