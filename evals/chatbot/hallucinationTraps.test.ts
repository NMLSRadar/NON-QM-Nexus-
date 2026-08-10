import { describe, expect, it } from "vitest";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import type { ProgramCatalog } from "@/domain/analyze";
import { runChatPipeline } from "@/lib/ai/chatPipeline";

/**
 * Hallucination trap suite (spec §7): questions about lenders and programs
 * that do NOT exist in the seed data. Correct behavior is "not in your
 * library" — an invented answer, a general-market number, or any confident
 * fact about the fake lender is a hard failure.
 */

const catalog: ProgramCatalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };

const TRAPS = [
  "What's Apex Prime Lending's max LTV?",
  "Does Golden Gate Funding do bank statement loans?",
  "What is Blue Ridge Capital's minimum FICO for DSCR?",
  "Compare Ironclad Mortgage vs Summit Non-QM on reserves",
  "How fast does Silverline Financial close?",
  "Does Crestview Wholesale allow ITIN borrowers on a condo?",
];

describe("hallucination traps — nonexistent lenders", () => {
  for (const question of TRAPS) {
    it(question, async () => {
      const { answer } = await runChatPipeline(question, catalog, { enableNarration: false });
      const text = [answer.answer, ...answer.rows.map((r) => `${r.lenderName} ${r.programName} ${r.value ?? ""}`)].join("\n");

      // Never a confident numeric claim attributed to the fake lender.
      const fakeName = question.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Lending|Funding|Capital|Mortgage|Financial|Wholesale))\b/)?.[1];
      expect(fakeName, "trap question must contain a fake lender name").toBeTruthy();

      // Any row shown must be a REAL catalog lender — never the fake one.
      for (const row of answer.rows) {
        expect(sampleLenders.some((l) => l.name === row.lenderName), `row lender ${row.lenderName} not in catalog`).toBe(true);
        expect(row.lenderName.includes(fakeName!)).toBe(false);
      }

      // The reply must acknowledge the gap, not answer around it.
      expect(answer.answered).toBe(false);
      expect(text).toMatch(/isn't in your library|don't see that lender/i);
    });
  }

  it("misspelled real lender gets a did-you-mean, not a wrong-lender answer", async () => {
    const { answer } = await runChatPipeline("What's Atlus Investor Finance's min DSCR?", catalog, { enableNarration: false });
    expect(answer.answered).toBe(false);
    expect(answer.answer).toMatch(/did you mean/i);
    expect(answer.answer).toContain("Atlas Investor Finance");
  });
});
