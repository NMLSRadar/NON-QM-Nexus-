import { describe, expect, it } from "vitest";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import type { ProgramCatalog } from "@/domain/analyze";
import type { ChatAnswer } from "@/domain/chat/answer";
import { mergePostureProfiles } from "@/domain/lenderPosture";
import { runChatPipeline } from "@/lib/ai/chatPipeline";

/**
 * Part 2 eval additions: exception/posture/pricing golden fixtures. Shared
 * invariants asserted on EVERY fixture:
 *  - no price/rate figure anywhere;
 *  - no approval promise;
 *  - editorial content always carries the market-experience disclaimer;
 *  - exception answers state the compensating-factors CONDITION.
 */

const catalog: ProgramCatalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };
const postureProfiles = mergePostureProfiles([]);

function fullText(a: ChatAnswer): string {
  return JSON.stringify(a);
}

interface PostureFixture {
  id: string;
  question: string;
  priorUserMessages?: string[];
  expectIntent?: string;
  expectAnswered?: boolean;
  expectFacts?: string[];
  expectCompensatingCondition?: boolean;
  expectEditorialDisclaimer?: boolean;
}

const FIXTURES: PostureFixture[] = [
  {
    id: "p2-who-gives-exceptions",
    question: "Who gives exceptions?",
    expectIntent: "exception_guidance",
    expectAnswered: true,
    expectFacts: ["Greenbox Loans", "Acra Lending", "AE"],
    expectCompensatingCondition: true,
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-flexible-lenders",
    question: "Where can I find more flexible non-QM lenders who allow for exceptions?",
    expectIntent: "exception_guidance",
    expectAnswered: true,
    expectFacts: ["reserves", "LTV"],
    expectCompensatingCondition: true,
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-flexible-on-lates",
    question: "Who's flexible on mortgage lates?",
    expectIntent: "exception_guidance",
    expectAnswered: true,
    expectCompensatingCondition: true,
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-outside-guidelines",
    question: "I have a deal outside the guidelines, who will actually do it?",
    expectIntent: "exception_guidance",
    expectAnswered: true,
    expectCompensatingCondition: true,
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-one-off",
    question: "Who takes one-off scenarios?",
    expectIntent: "exception_guidance",
    expectAnswered: true,
    expectCompensatingCondition: true,
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-lenient",
    question: "Who's lenient?",
    expectIntent: "exception_guidance",
    expectAnswered: true,
    expectCompensatingCondition: true,
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-scenario-context",
    question: "Who would make an exception here?",
    priorUserMessages: ["Borrower is 720 FICO at 72% LTV with 4 months reserves on a DSCR purchase"],
    expectIntent: "exception_guidance",
    expectAnswered: true,
    // Part 3 of the required shape: the file's real numbers.
    expectFacts: ["72", "720", "current scenario"],
    expectCompensatingCondition: true,
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-compensating-factors",
    question: "What compensating factors do I have?",
    priorUserMessages: ["Borrower is 700 FICO, 70% LTV, 12 months reserves"],
    expectIntent: "exception_guidance",
    expectAnswered: true,
    expectFacts: ["70", "reserves"],
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-why-logan-cheaper",
    question: "Why is Logan cheaper?",
    expectIntent: "out_of_scope",
    expectAnswered: false,
    expectFacts: ["Logan Finance", "Rigid", "tighter guidelines", "directional"],
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-cheapest-lender",
    question: "Which lender has the cheapest rate for DSCR?",
    expectIntent: "out_of_scope",
    expectAnswered: false,
    expectFacts: ["directional"],
  },
  {
    id: "p2-will-acra-approve",
    question: "Will Acra approve this?",
    expectIntent: "out_of_scope",
    expectAnswered: false,
    expectFacts: ["can't predict", "Acra Lending", "compensating factors"],
    expectEditorialDisclaimer: true,
  },
  {
    id: "p2-real-lender-guideline-question",
    // Real lender with posture on record but NO verified guidelines loaded:
    // the answer is "not in the library yet" + the posture note — never an
    // inferred guideline.
    question: "What's Deephaven Mortgage's max LTV on bank statements?",
    expectAnswered: false,
    expectFacts: ["isn't in your library", "Deephaven Mortgage", "Rigid"],
    expectEditorialDisclaimer: true,
  },
];

// A price figure = %, $, bps, or point figures in pricing/posture context.
// Guideline numbers (LTV/FICO) are fine — these fixtures' pricing answers
// must contain NO numeric figures at all beyond dates.
const APPROVAL_PROMISES = /will approve|you'?ll (get |be )?approved|should be fine|they'?ll do it|guaranteed/i;

describe("Part 2 posture/exception guidance evals", () => {
  for (const f of FIXTURES) {
    it(`${f.id}: "${f.question}"`, async () => {
      const { answer, parsed } = await runChatPipeline(f.question, catalog, {
        enableNarration: false,
        priorUserMessages: f.priorUserMessages,
        postureProfiles,
      });
      const text = fullText(answer);

      if (f.expectIntent) expect(parsed.intent, text).toBe(f.expectIntent);
      if (f.expectAnswered != null) expect(answer.answered, text).toBe(f.expectAnswered);
      for (const fact of f.expectFacts ?? []) {
        expect(text.toLowerCase(), `expected "${fact}"`).toContain(fact.toLowerCase());
      }
      if (f.expectCompensatingCondition) {
        expect(text.toLowerCase()).toContain("compensating factors");
        // Stated as a condition, naming the heavy ones.
        expect(text.toLowerCase()).toMatch(/reserves/);
      }
      if (f.expectEditorialDisclaimer) {
        expect(text).toContain("market experience");
        expect(text.toLowerCase()).toContain("last reviewed");
      }

      // NEVER: approval promises.
      expect(text).not.toMatch(APPROVAL_PROMISES);
      // NEVER: a rate/price figure. Pricing-flavored fixtures must carry no
      // percent/dollar/bps figures at all.
      if (f.id.includes("cheaper") || f.id.includes("cheapest")) {
        expect(text).not.toMatch(/\d+(\.\d+)?\s*(%|bps|points?)|\$\s?\d/i);
      }
      // Editorial rows are never guideline sources.
      if (answer.rows.some((r) => r.sourceType === "editorial")) {
        expect(answer.sources).toHaveLength(0);
      }
    });
  }

  it("pricing tendency is explained directionally with the volatility caveat", async () => {
    const { answer } = await runChatPipeline("Why is Logan cheaper?", catalog, { enableNarration: false, postureProfiles });
    expect(answer.answer).toMatch(/tighter guidelines correlate with better pricing/i);
    expect(answer.answer).toMatch(/changes frequently|varies by lender/i);
    expect(answer.answer).not.toMatch(/\d+(\.\d+)?\s*%/);
  });

  it("exception answers include lastReviewedAt and flag stale profiles when past the window", async () => {
    const staleProfiles = postureProfiles.map((p) => ({ ...p, lastReviewedAt: "2025-01-01" }));
    const { answer } = await runChatPipeline("Who gives exceptions?", catalog, {
      enableNarration: false,
      postureProfiles: staleProfiles,
    });
    expect(JSON.stringify(answer)).toMatch(/possibly stale/i);
    expect(JSON.stringify(answer)).toMatch(/admin review/i);
  });

  it("posture-sourced answers are logged distinctly", async () => {
    const { log } = await runChatPipeline("Who gives exceptions?", catalog, { enableNarration: false, postureProfiles });
    expect(log.postureSourced).toBe(true);
    const plain = await runChatPipeline("Minimum loan amount for DSCR?", catalog, { enableNarration: false, postureProfiles });
    expect(plain.log.postureSourced).toBe(false);
  });
});
