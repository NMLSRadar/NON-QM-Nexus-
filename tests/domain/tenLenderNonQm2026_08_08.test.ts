import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";
// @ts-ignore executable ingestion module intentionally has no declaration file
import { PROGRAMS, SOURCES, publicCatalogUpdates } from "../../scripts/ingest_ten_lender_nonqm_2026_08_08.mjs";

const named = (text: string) => PROGRAMS.find((program: { name: string }) => program.name === text);
const transcript = (text: string) => extractFromTranscript(text);

describe("ten-lender Non-QM guideline and routing update — 2026-08-08", () => {
  it("covers all ten requested lenders without duplicate normalized names", () => {
    const direct = new Set(PROGRAMS.map((program: { lender: string }) => program.lender));
    const gated = new Set(publicCatalogUpdates.map((item: { lender: string }) => item.lender));
    expect(new Set([...direct, ...gated])).toEqual(new Set([
      "NewRez", "theLender", "BluePoint Mortgage", "Oaktree Funding Corporation",
      "Forward Lending", "Redwood Residential Acquisition Corporation", "LendingOne",
      "Velocity Mortgage Capital", "CoreVest Finance", "Maverick Lending Solutions",
    ]));
    expect(new Set(PROGRAMS.map((program: { lender: string; name: string }) => `${program.lender}|${program.name}`)).size).toBe(PROGRAMS.length);
  });

  it("stores official HTTPS sources and verification dates", () => {
    expect(Object.values(SOURCES).every((url) => String(url).startsWith("https://"))).toBe(true);
    for (const program of PROGRAMS as Array<{ source: string; effectiveDate: string; config: { lastVerifiedDate: string } }>) {
      expect(program.source).toMatch(/^https:\/\//);
      expect(program.effectiveDate).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
      expect(program.config.lastVerifiedDate).toBe("2026-08-08");
    }
  });

  it("1. separates 12-month personal bank statements", () => {
    expect(named("SmartSelf — 12-Month Personal Bank Statement")?.config.bankStatementMonthsEligible).toEqual([12]);
  });
  it("2. separates 24-month business bank statements", () => {
    expect(named("Non-QHEM — 24-Month Business Bank Statement")?.config.bankStatementAccountTypes).toEqual(["business"]);
  });
  it("3. does not invent ITIN Full Doc eligibility", () => {
    expect(PROGRAMS.some((p: any) => p.config.citizenshipEligible?.includes("itin") && p.config.incomeDocTypes?.includes("full_doc"))).toBe(false);
  });
  it("4. does not invent ITIN Bank Statement eligibility", () => {
    expect(PROGRAMS.some((p: any) => p.config.citizenshipEligible?.includes("itin") && p.config.incomeDocTypes?.includes("bank_statement"))).toBe(false);
  });
  it("5. does not invent ITIN DSCR eligibility", () => {
    expect(PROGRAMS.some((p: any) => p.config.itinDscrEligible === true)).toBe(false);
  });
  it("6. creates WVOE as an independent path", () => {
    expect(named("Gold — Written VOE")?.config.incomeDocTypes).toEqual(["wvoe_only"]);
  });
  it("7. creates 1099 as an independent path", () => {
    expect(named("SmartSelf — One-Year 1099")?.config.incomeDocTypes).toEqual(["1099"]);
  });
  it("8. keeps standard DSCR >=1.00", () => {
    expect(named("SmartVest — Standard DSCR")?.config.minDscr).toBe(1);
  });
  it("9. keeps DSCR below 1.00 separate", () => {
    expect(named("SmartVest — Low DSCR 0.50-0.99")?.config.minDscr).toBe(.5);
  });
  it("10. keeps no-ratio DSCR separate", () => {
    expect(named("Investor Advantage — No-Ratio")?.config.minDscr).toBe(0);
  });
  it("11. preserves Airbnb/STR eligibility only when confirmed", () => {
    expect(named("SmartVest STR — Standard DSCR")?.config.strIncomeEligible).toBe(true);
    expect(named("theSuperNONI — DSCR + Asset Depletion")?.config.strIncomeEligible).toBe(false);
  });
  it("12. preserves Foreign National as a separate DSCR path", () => {
    expect(named("Foreign National DSCR — No U.S. FICO")?.config.foreignNationalDscrEligible).toBe(true);
  });
  it("13. keeps non-permanent-resident eligibility explicit", () => {
    expect(named("Non-QHEM — Full Documentation")?.config.citizenshipEligible).toContain("non_permanent_resident");
  });
  it("14. recognizes one-year self-employed bank statement", () => {
    expect(named("SmartSelf — One-Year Self-Employed Bank Statement")?.config.minSelfEmploymentMonths).toBe(12);
  });
  it("15. stores documented clean mortgage-history overlay", () => {
    expect(named("SmartVest — Standard DSCR")?.config.maxMortgageLates30x12).toBe(0);
  });
  for (const units of [5, 6, 7, 8]) {
    it(`${14 + units}. routes a ${units}-unit property to the 5-8 unit class`, () => {
      const result = transcript(`Experienced investor buying a ${units} unit apartment building with a DSCR loan.`);
      expect(result.propertyType?.value).toBe("5_8_unit");
    });
  }
  it("20. preserves asset utilization/depletion programs", () => {
    expect(named("SmartEdge — Asset Qualifier")?.config.incomeDocTypes).toEqual(["asset_depletion"]);
  });

  it("voice cross-classifies ITIN plus bank statement instead of dropping either dimension", () => {
    const result = transcript("Borrower has an ITIN, 720 FICO, 20 percent down and wants to qualify using bank statements.");
    expect(result.citizenship?.value).toBe("itin");
    expect(result.incomeDocType?.value).toBe("bank_statement");
  });
  it("voice cross-classifies 6-unit DSCR STR and experienced investor", () => {
    const result = transcript("Experienced investor buying a six-unit property at 70 percent LTV using Airbnb income for DSCR.");
    expect(result.propertyType?.value).toBe("5_8_unit");
    expect(result.incomeDocType?.value).toBe("dscr");
    expect(result.occupancy?.value).toBe("investment");
    expect(result.strIncomeUsed?.value).toBe("yes");
  });
  it("voice cross-classifies 14 months self-employed plus bank statements", () => {
    const result = transcript("Borrower has been self-employed for 14 months and wants a bank statement loan.");
    expect(result.incomeDocType?.value).toBe("bank_statement");
    expect(result.oneYearSelfEmployed?.value).toBe("yes");
  });
});
