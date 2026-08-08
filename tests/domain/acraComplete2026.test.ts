import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
import { deriveMaxLtv, deriveRequiredReservesMonths } from "@/domain/matching/baseChecks";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
// The production ingestion artifact is deliberately plain ESM so Vercel can
// execute it directly after build; this test supplies its narrow static shape.
// @ts-expect-error Plain .mjs ingestion module has no declaration file.
import { DOCUMENTS as RAW_DOCUMENTS, PROGRAMS as RAW_PROGRAMS } from "../../scripts/ingest_acra_complete_2026_08_08.mjs";

type AcraDefinition = { name: string; primaryDocumentKey: string; config: Record<string, unknown> & { incomeDocTypes: string[]; citizenshipEligible: string[] } };
type AcraDocument = { title: string; url: string; fileName: string };
const PROGRAMS = RAW_PROGRAMS as AcraDefinition[];
const DOCUMENTS = RAW_DOCUMENTS as AcraDocument[];
const byName = (name: string) => PROGRAMS.find((p: AcraDefinition) => p.name === name)!;
const scenario = (overrides: Partial<Scenario>): Scenario => ({
  id: "s", organizationId: "o", createdBy: "u", borrowerReference: "TEST-ACRA",
  loanPurpose: "purchase", occupancy: "primary", propertyType: "single_family",
  propertyValue: 1_000_000, requestedLoanAmount: 750_000, ltv: 75,
  fico: 700, incomeDocType: "bank_statement", citizenship: "itin",
  createdAt: new Date(), updatedAt: new Date(), ...overrides,
} as Scenario);
const program = (name: string): Program => ({ id:name,lenderId:"acra",organizationId:"o",...byName(name).config,name } as unknown as Program);

describe("Acra complete 2026 program update", () => {
  it("keeps each ITIN qualification method in its own program record", () => {
    const expected: Array<[string, string]> = [
      ["Acra ITIN Bank Statement", "bank_statement"],
      ["Acra ITIN Full Doc", "full_doc"],
      ["Acra ITIN DSCR", "dscr"],
      ["Acra ITIN Asset Depletion / ATR-in-Full", "asset_depletion"],
      ["Acra ITIN WVOE", "wvoe_only"],
      ["Acra ITIN 1099", "1099"],
      ["Acra ITIN P&L Only", "pnl_only"],
    ];
    for (const [name, method] of expected) {
      expect(byName(name).config.incomeDocTypes).toEqual([method]);
      expect(byName(name).config.citizenshipEligible).toEqual(["itin"]);
    }
    expect(new Set(PROGRAMS.map((p) => p.name)).size).toBe(PROGRAMS.length);
    expect(PROGRAMS.some((p) => p.name === "ITIN")).toBe(false);
  });

  it("applies the controlling ITIN owner-occupied FICO/LTV overlay", () => {
    const p = program("Acra ITIN Bank Statement");
    expect(deriveMaxLtv(scenario({ fico:700, loanPurpose:"purchase" }), p)).toBe(75);
    expect(deriveMaxLtv(scenario({ fico:700, loanPurpose:"cash_out_refinance" }), p)).toBe(70);
    expect(deriveMaxLtv(scenario({ fico:660, loanPurpose:"purchase" }), p)).toBe(70);
    expect(deriveMaxLtv(scenario({ fico:640, loanPurpose:"rate_term_refinance" }), p)).toBe(60);
  });

  it("applies the separate, tighter ITIN DSCR overlay", () => {
    const p = program("Acra ITIN DSCR");
    expect(deriveMaxLtv(scenario({ fico:700, occupancy:"investment", incomeDocType:"dscr", loanPurpose:"purchase" }), p, 1.1)).toBe(70);
    expect(deriveMaxLtv(scenario({ fico:660, occupancy:"investment", incomeDocType:"dscr", loanPurpose:"cash_out_refinance" }), p, 1.1)).toBe(60);
    expect(p.itinDscrEligible).toBe(true);
    expect(p.ownerOccupiedItinEligible).toBe(false);
  });

  it("applies Acra's 3-12 month reserve tiers instead of reporting zero", () => {
    for (const definition of PROGRAMS) {
      expect(program(definition.name).minReservesMonths, definition.name).toBe(3);
    }

    const bank = program("Acra Bank Statement");
    expect(deriveRequiredReservesMonths(scenario({ citizenship:"us_citizen", fico:700 }), bank, undefined, 75)).toBe(3);
    expect(deriveRequiredReservesMonths(scenario({ citizenship:"us_citizen", fico:700 }), bank, undefined, 86)).toBe(6);
    expect(deriveRequiredReservesMonths(scenario({ citizenship:"us_citizen", fico:610 }), bank, undefined, 65)).toBe(12);

    const itinDscr = program("Acra ITIN DSCR");
    const itinDscrScenario = scenario({ occupancy:"investment", incomeDocType:"dscr", fico:700 });
    expect(deriveRequiredReservesMonths(itinDscrScenario, itinDscr, 1.1, 70)).toBe(3);
    expect(deriveRequiredReservesMonths({ ...itinDscrScenario, firstTimeHomebuyer:true }, itinDscr, 1.15, 70)).toBe(6);
  });

  it("caps condos under the platform-wide property overlays", () => {
    const p = program("Acra Bank Statement");
    expect(deriveMaxLtv(scenario({ citizenship:"us_citizen", propertyType:"condo", fico:780 }), p)).toBe(85);
    expect(deriveMaxLtv(scenario({ citizenship:"us_citizen", propertyType:"non_warrantable_condo", fico:780 }), p)).toBe(80);
  });

  it("voice extraction preserves borrower status and qualification method as separate dimensions", () => {
    const cases: Array<[string,string]> = [
      ["ITIN borrower using 12 months business bank statements", "bank_statement"],
      ["ITIN borrower using W-2s and paystubs full doc", "full_doc"],
      ["ITIN investor buying a rental and qualifying with DSCR rents", "dscr"],
      ["ITIN borrower qualifying from substantial assets using asset depletion", "asset_depletion"],
      ["ITIN wage earner using a written verification of employment WVOE", "wvoe_only"],
    ];
    for (const [text, method] of cases) {
      const x = extractFromTranscript(text);
      expect(x.citizenship?.value, text).toBe("itin");
      expect(x.incomeDocType?.value, text).toBe(method);
    }
  });

  it("registers all five supplied official documents with metadata", () => {
    expect(DOCUMENTS).toHaveLength(5);
    for (const d of DOCUMENTS) {
      expect(d.title).toBeTruthy();
      expect(d.url).toMatch(/^https:\/\//);
      expect(d.fileName).toMatch(/\.pdf$/);
    }
  });
});
