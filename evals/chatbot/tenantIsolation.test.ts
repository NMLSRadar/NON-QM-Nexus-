import { describe, expect, it } from "vitest";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import type { ProgramCatalog } from "@/domain/analyze";
import type { Lender, Program } from "@/domain/types/program";
import { runChatPipeline } from "@/lib/ai/chatPipeline";

/**
 * Tenant-isolation suite (spec §7): the identical question asked with Org A's
 * and Org B's catalogs must return only the asking org's visible programs.
 * The pipeline's isolation property is structural — it can only see the
 * catalog value handed to it (repo.getCatalog(org) applies RLS/tier gating
 * server-side) — and this suite locks that property in.
 */

const orgACatalog: ProgramCatalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };

const orgBLenders: Lender[] = [
  { id: "lender_b1", organizationId: "org_b", name: "Beacon Point Capital", isSampleData: false, active: true, tierLevel: 1 },
];
const orgBPrograms: Program[] = [
  {
    id: "prog_b1_dscr",
    lenderId: "lender_b1",
    organizationId: "org_b",
    name: "Rental Pro DSCR",
    isSampleData: false,
    active: true,
    incomeDocTypes: ["dscr"],
    loanPurposes: ["purchase", "cash_out_refinance"],
    occupancies: ["investment"],
    propertyTypes: ["single_family", "condo"],
    eligibleStates: "ALL",
    citizenshipEligible: ["us_citizen", "permanent_resident"],
    vestingEligible: ["individual", "llc"],
    minLoanAmount: 125_000,
    maxLoanAmount: 2_000_000,
    minFico: 680,
    minDscr: 1.1,
    baseMaxLtv: 75,
    minReservesMonths: 6,
    interestOnlyAvailable: false,
    prepaymentPenaltyOptions: ["3yr_stepdown"],
    guidelineVersionId: "gv_b1_v1",
    guidelineVersionLabel: "v1.0",
    effectiveDate: "2026-03-01",
    sourceCitation: "Org B guideline, Section 1",
  },
];
const orgBCatalog: ProgramCatalog = { lenders: orgBLenders, programs: orgBPrograms, rules: [] };

const QUESTIONS = [
  "Who has the lowest down payment for DSCR?",
  "Which lenders allow LLC vesting?",
  "What's the lowest FICO allowed?",
];

describe("tenant isolation — same question, different orgs", () => {
  for (const question of QUESTIONS) {
    it(question, async () => {
      const [a, b] = await Promise.all([
        runChatPipeline(question, orgACatalog, { enableNarration: false }),
        runChatPipeline(question, orgBCatalog, { enableNarration: false }),
      ]);

      const aText = JSON.stringify(a.answer);
      const bText = JSON.stringify(b.answer);

      // Org B's answer must never mention any Org A lender, and vice versa.
      for (const lender of sampleLenders) {
        const bare = lender.name.replace(/\s*\(Sample\)\s*$/i, "");
        expect(bText.includes(bare), `Org B answer leaked "${bare}"`).toBe(false);
      }
      for (const lender of orgBLenders) {
        expect(aText.includes(lender.name), `Org A answer leaked "${lender.name}"`).toBe(false);
      }

      // Rows are strictly own-catalog.
      for (const row of a.answer.rows) {
        expect(sampleLenders.some((l) => l.name === row.lenderName)).toBe(true);
      }
      for (const row of b.answer.rows) {
        expect(orgBLenders.some((l) => l.name === row.lenderName)).toBe(true);
      }
    });
  }
});
