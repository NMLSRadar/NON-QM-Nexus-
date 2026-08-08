import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

type Program = {
  name: string; category: string; doc: string[]; months?: number; account?: string;
  minFico: number; minDscr?: number; baseMaxLtv: number; maxLoanAmount: number;
  minReservesMonths: number; lienPosition: string; occupancies: string[];
  citizenshipEligible: string[]; noFicoPolicy?: string | null; noFicoMaxLtv?: number | null;
  itinDscrEligible?: boolean | null; pnlTaxReturnsRequired?: boolean | null;
  pnlPeriodMonths?: number | null; pnlSupportingBankStatementsMonths?: number | null;
  standardExpenseFactor?: number | null; minimumExpenseFactor?: number | null;
  assetQualifierMethods?: string[] | null; firstTimeHomebuyerAllowed?: boolean | null;
  strIncomeMaxLtv?: number | null; ioDscrPaymentAllowed?: boolean | null;
  propertyTypes: string[]; matrixRows: number; matrix: Array<Record<string, unknown>>;
  source: string; sourceDocument: string; sourcePages: number[];
  effectiveDate: string; lastVerifiedDate: string;
};
let programs: Program[];
let byName: Map<string, Program>;

beforeAll(() => {
  const root = path.resolve(__dirname, "../..");
  const raw = execFileSync(process.execPath, ["scripts/acc_mortgage_complete_audit_2026_08_08.mjs", "--dry-run"], { cwd: root, encoding: "utf8" });
  const audit = JSON.parse(raw);
  expect(audit.programCount).toBe(44);
  expect(audit.scenarioQa).toHaveLength(35);
  expect(audit.scenarioQa.every((x: { eligible: boolean }) => x.eligible)).toBe(true);
  programs = audit.programs;
  byName = new Map(programs.map((p) => [p.name, p]));
});
const p = (name: string) => { const found = byName.get(name); expect(found, `Missing ${name}`).toBeTruthy(); return found!; };
const hasTier = (x: Program, predicate: (r: Record<string, unknown>) => boolean) => x.matrix.some(predicate);

describe("ACC Mortgage August 3, 2026 — 35 cross-contamination controls", () => {
  const cases: Array<[string, () => void]> = [
    ["01 Prime Full Doc remains a first-mortgage full-doc path", () => { const x=p("ACC Prime — Full Documentation"); expect(x.doc).toEqual(["full_doc"]); expect(x.category).toBe("First Mortgages"); }],
    ["02 Prime personal bank statements retain the personal-account method", () => { const x=p("ACC Prime — 12-Month Personal Bank Statement"); expect([x.months,x.account,x.standardExpenseFactor]).toEqual([12,"personal",0]); }],
    ["03 Prime business bank statements retain the business expense factor", () => { const x=p("ACC Prime — 12-Month Business Bank Statement"); expect([x.account,x.standardExpenseFactor,x.minimumExpenseFactor]).toEqual(["business",50,10]); }],
    ["04 Prime 24-month paths are distinct from 12-month paths", () => { expect(p("ACC Prime — 24-Month Personal Bank Statement").months).toBe(24); expect(p("ACC Prime — 24-Month Business Bank Statement").months).toBe(24); }],
    ["05 Prime Plus has 12-month but no unsupported 24-month bank path", () => { expect(p("ACC Prime Plus — 12-Month Personal Bank Statement").months).toBe(12); expect(byName.has("ACC Prime Plus — 24-Month Personal Bank Statement")).toBe(false); }],
    ["06 P&L Only never requires borrower tax returns", () => { for(const x of programs.filter((q)=>q.doc[0]==="pnl_only")) expect(x.pnlTaxReturnsRequired).toBe(false); }],
    ["07 P&L statement period and support statements stay separate", () => { const x=p("ACC Prime — P&L Only"); expect([x.pnlPeriodMonths,x.pnlSupportingBankStatementsMonths]).toEqual([12,2]); }],
    ["08 1099 is not merged into P&L or bank statements", () => { expect(p("ACC Prime — 1099").doc).toEqual(["1099"]); }],
    ["09 WVOE remains searchable as its own documentation path", () => { expect(p("ACC Mortgage — Written VOE / WVOE").doc).toEqual(["wvoe"]); }],
    ["10 Asset Depletion retains its own method", () => { const x=p("ACC Mortgage — Asset Depletion"); expect(x.doc).toEqual(["asset_depletion"]); expect(x.assetQualifierMethods?.join(" ")).toContain("divided by 60"); }],
    ["11 Prime does not inherit Prime Plus ITIN eligibility", () => { expect(p("ACC Prime — Full Documentation").citizenshipEligible).not.toContain("itin"); }],
    ["12 Prime Plus carries ITIN eligibility", () => { expect(p("ACC Prime Plus — Full Documentation").citizenshipEligible).toContain("itin"); }],
    ["13 ITIN Full Doc is a distinct ITIN-category record", () => { const x=p("ACC Mortgage — ITIN Full Doc"); expect(x.category).toBe("ITIN"); expect(x.citizenshipEligible).toEqual(["itin"]); }],
    ["14 ITIN Personal Bank Statements remain separate", () => { const x=p("ACC ITIN — 12-Month Personal Bank Statements"); expect([x.account,x.doc[0]]).toEqual(["personal","bank_statement"]); }],
    ["15 ITIN Business Bank Statements remain separate", () => { const x=p("ACC ITIN — 12-Month Business Bank Statements"); expect([x.account,x.standardExpenseFactor]).toEqual(["business",50]); }],
    ["16 ITIN P&L does not import a tax-return requirement", () => { expect(p("ACC Mortgage — ITIN P&L Only").pnlTaxReturnsRequired).toBe(false); }],
    ["17 ITIN 1099 remains distinct", () => { expect(p("ACC Mortgage — ITIN 1099").doc).toEqual(["1099"]); }],
    ["18 Standard DSCR explicitly permits 0.00", () => { expect(p("ACC Standard DSCR").minDscr).toBe(0); }],
    ["19 Standard DSCR contains a 0.00-to-0.75 ratio tier", () => { expect(hasTier(p("ACC Standard DSCR"),(r)=>r.minDscr===0&&r.maxDscrExclusive===0.75)).toBe(true); }],
    ["20 DSCR LTV is FICO and ratio tiered", () => { const x=p("ACC Standard DSCR"); expect(hasTier(x,(r)=>r.minFico===700&&r.minDscr===1&&r.maxLtv===80)).toBe(true); expect(hasTier(x,(r)=>r.minFico===680&&r.minDscr===0&&r.maxLtv===70)).toBe(true); }],
    ["21 DSCR reserves change at the $1.5M boundary", () => { const x=p("ACC Standard DSCR"); expect(x.minReservesMonths).toBe(2); expect(hasTier(x,(r)=>r.maxLoanAmount===2_000_000&&r.reservesMonths===12)).toBe(true); }],
    ["22 Foreign National DSCR remains a borrower-specific record", () => { const x=p("ACC Foreign National DSCR"); expect(x.citizenshipEligible).toEqual(["foreign_national"]); expect(x.minFico).toBe(680); }],
    ["23 NPR, DACA and Asylum are not merged with Foreign National", () => { expect(p("ACC Non-Permanent Resident DSCR").citizenshipEligible).toEqual(["non_permanent_resident"]); expect(p("ACC DACA DSCR").citizenshipEligible).toEqual(["daca"]); expect(p("ACC Asylum DSCR").citizenshipEligible).toEqual(["asylum"]); }],
    ["24 ITIN DSCR requires the documented 1.00 overlay", () => { const x=p("ACC Mortgage — ITIN DSCR"); expect([x.itinDscrEligible,x.minDscr]).toEqual([true,1]); }],
    ["25 ITIN DSCR does not inherit standard 0.00 DSCR", () => { expect(p("ACC Mortgage — ITIN DSCR").minDscr).not.toBe(0); }],
    ["26 Short-Term Rental DSCR carries its leverage overlay", () => { expect(p("ACC Short-Term Rental DSCR").strIncomeMaxLtv).toBe(75); }],
    ["27 First-time-homebuyer DSCR carries its 700/70 overlay", () => { const x=p("ACC First-Time Homebuyer DSCR"); expect([x.minFico,x.baseMaxLtv,x.firstTimeHomebuyerAllowed]).toEqual([700,70,true]); }],
    ["28 DSCR can use interest-only payment where documented", () => { expect(p("ACC Standard DSCR").ioDscrPaymentAllowed).toBe(true); }],
    ["29 Second-lien records use standalone-second and CLTV grid semantics", () => { for(const x of programs.filter((q)=>q.category==="Second Liens")) { expect(x.lienPosition).toBe("standalone_second"); expect(x.matrix.every((r)=>r.lienPosition==="standalone_second")).toBe(true); } }],
    ["30 Closed-End Second Prime Full Doc retains its $750k ceiling", () => { expect(p("ACC Closed-End Second — Prime Full Documentation").maxLoanAmount).toBe(750_000); }],
    ["31 Closed-End Second Prime has separate 12/24 personal/business paths", () => { for(const n of ["12-Month Personal","12-Month Business","24-Month Personal","24-Month Business"]) expect(p(`ACC Closed-End Second — Prime ${n} Bank Statement`).doc).toEqual(["bank_statement"]); }],
    ["32 Closed-End Second P&L remains Prime-only and tax-return-free", () => { const x=p("ACC Closed-End Second — Prime P&L Only"); expect(x.pnlTaxReturnsRequired).toBe(false); expect(byName.has("ACC Closed-End Second — Prime Plus P&L Only")).toBe(false); }],
    ["33 Closed-End Second Prime Plus remains Full Doc only", () => { expect(p("ACC Closed-End Second — Prime Plus Full Documentation").doc).toEqual(["full_doc"]); expect(programs.filter((x)=>x.name.startsWith("ACC Closed-End Second — Prime Plus"))).toHaveLength(1); }],
    ["34 Closed-End Second DSCR is investment-only and excludes condotels", () => { const x=p("ACC Closed-End Second — DSCR"); expect(x.occupancies).toEqual(["investment"]); expect(x.propertyTypes).not.toContain("condotel"); }],
    ["35 every active path carries August 3 source traceability", () => { expect(programs).toHaveLength(44); for(const x of programs){ expect(x.effectiveDate).toBe("2026-08-03"); expect(x.lastVerifiedDate).toBe("2026-08-08"); expect(x.source).toMatch(/^https:\/\//); expect(x.sourceDocument).toContain("Effective 08/03/2026"); expect(x.sourcePages.length).toBeGreaterThan(0); } }],
  ];
  it.each(cases)("%s", (_name, check) => check());
});
