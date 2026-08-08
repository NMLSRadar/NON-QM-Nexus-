import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { buildGuidelineContext } from "@/lib/ai/assistantContext";
import { resolveSeededProfiles } from "@/domain/lenderIntelligence";
import type { Lender, Program } from "@/domain/types/program";

const repoRoot = path.resolve(process.cwd());

function dryRun() {
  const raw = execFileSync(process.execPath, ["scripts/luxury_mortgage_full_audit_2026_08_08.mjs", "--dry-run"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return JSON.parse(raw);
}

describe("Luxury Mortgage comprehensive guideline audit 2026-08-08", () => {
  it("publishes eight distinct, searchable programs without burying P&L or Graduate", () => {
    const payload = dryRun();
    expect(payload.programCount).toBe(8);
    expect(payload.scenarioQa).toHaveLength(8);
    const names = payload.programs.map((p: { name: string }) => p.name);
    expect(names).toContain("Simple Access — P&L Only (1 Year)");
    expect(names).toContain("LUXURY MORTGAGE CORP. — GRADUATE PROGRAM");
    expect(names).toContain("Simple Access — Investor Cash Flow (5–10 Unit)");
  });

  it("locks the verified Graduate headline, future-income trigger and no-PMI discovery tags", () => {
    const payload = dryRun();
    const graduate = payload.programs.find((p: { name: string }) => p.name.includes("GRADUATE PROGRAM"));
    expect(graduate).toMatchObject({ minFico: 720, baseMaxLtv: 90, maxLoanAmount: 1_500_000, futureEmploymentEligible: true });
    expect(graduate.searchTags).toEqual(expect.arrayContaining(["Medical Graduate", "Engineer Loan", "90% LTV No PMI", "offer letter"]));
  });

  it("keeps P&L Only tax-return-free and assigns full matrices to Bank, 1099, Asset and DSCR", () => {
    const payload = dryRun();
    const pnl = payload.programs.find((p: { name: string }) => p.name.includes("P&L Only"));
    expect(pnl.pnlTaxReturnsRequired).toBe(false);
    expect(pnl.matrixRows).toBe(9);
    for (const token of ["Bank Statement", "1099 Only", "Asset Qualifier", "DSCR 1–4"]) {
      const program = payload.programs.find((p: { name: string }) => p.name.includes(token));
      expect(program.matrixRows).toBeGreaterThan(30);
    }
  });

  it("resolves Luxury as a specialty routing profile", () => {
    const lender: Lender = { id: "lux", organizationId: "o", name: "Luxury Mortgage Corp.", isSampleData: false, active: true, tierLevel: 1 };
    const resolved = resolveSeededProfiles([lender]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.profile.strengths).toEqual(expect.arrayContaining(["p&l only", "recent professional graduate", "future employment contract"]));
  });

  it("serializes exact matrices, search tags and specialty facts into AI context", () => {
    const lender: Lender = { id: "lux", organizationId: "o", name: "Luxury Mortgage Corp.", isSampleData: false, active: true, tierLevel: 1 };
    const program = {
      id: "grad", lenderId: "lux", organizationId: "o", name: "LUXURY MORTGAGE CORP. — GRADUATE PROGRAM", isSampleData: false, active: true,
      incomeDocTypes: ["full_doc"], loanPurposes: ["purchase"], occupancies: ["primary"], propertyTypes: ["single_family"], eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen"], vestingEligible: ["individual"], minLoanAmount: 150_000, maxLoanAmount: 1_500_000,
      minFico: 720, baseMaxLtv: 90, minReservesMonths: 3, interestOnlyAvailable: true, prepaymentPenaltyOptions: ["none"],
      eligibilityLtvMatrix: [{ minFico: 720, maxLoanAmount: 1_500_000, maxLtv: 90, occupancy: "primary", loanPurpose: "purchase" }],
      propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80 }, searchTags: ["Graduate Program", "90% LTV No PMI"],
      eligibleProfessions: ["medical", "engineering"], futureEmploymentEligible: true, employmentStartWithinDays: 60, pmiRequired: false,
      documentationRequirements: ["fully executed employment contract"], guidelineVersionId: "g", guidelineVersionLabel: "reviewed", effectiveDate: "2026-08-08", sourceCitation: "source",
    } as Program;
    const context = buildGuidelineContext({ lenders: [lender], programs: [program], rules: [] });
    expect(context).toContain('"eligibilityLtvMatrix"');
    expect(context).toContain('"searchTags":["Graduate Program","90% LTV No PMI"]');
    expect(context).toContain('"employmentStartWithinDays":60');
    expect(context).toContain('"pmiRequired":false');
  });
});
