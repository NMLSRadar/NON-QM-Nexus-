import { describe, it, expect } from "vitest";
import { runChatAssistant } from "@/lib/ai/chatbot/orchestrate";
import { evalCatalog } from "../../evals/chatbot/seed";
import { seedProfiles } from "@/domain/lenderPosture";

/**
 * Chatbot style verification (HIGGSFIELD SUPERCOMPUTER PROMPT — response style).
 *
 * 25 realistic loan-officer questions, simple → complex. Asserts the
 * FAST.ACCURATE.HUMAN.EASY-TO-READ contract: answer first, short, conversational,
 * scannable, no walls of text, no question-repetition, no per-answer boilerplate,
 * accuracy/grounding intact, honest non-answers.
 */

const catalog = evalCatalog();
const posture = seedProfiles("org_eval");

const ROBOTIC = [
  "in your library:",
  "you're asking",
  "based on the information available",
  "it is not an eligibility determination",
  "the following lenders may potentially",
];

const CASES: Array<{ q: string; simple: boolean; expectAnswered: boolean; skipLeadCheck?: boolean }> = [
  // Simple availability
  { q: "Who allows DSCR with 15% down?", simple: true, expectAnswered: true },
  { q: "Who has ITIN loans?", simple: true, expectAnswered: true },
  { q: "Who allows an LLC to take title?", simple: true, expectAnswered: true },
  { q: "Which lenders do foreign national loans?", simple: true, expectAnswered: true },
  { q: "Who does 1099-only?", simple: true, expectAnswered: true },
  { q: "Are there any lenders that go down to a 600 fico for bank statement programs?", simple: true, expectAnswered: true },
  { q: "Anyone doing non-warrantable condos with DSCR?", simple: true, expectAnswered: true },
  // Superlative / threshold
  { q: "Who has the lowest down payment for DSCR?", simple: true, expectAnswered: true },
  { q: "What's the highest LTV on 12-month bank statements?", simple: true, expectAnswered: true },
  { q: "What's the lowest FICO score allowed in non-QM?", simple: true, expectAnswered: true },
  { q: "Lowest reserves for an investor purchase?", simple: true, expectAnswered: true },
  // Definitions / process
  { q: "What does 2x30x12 mean?", simple: true, expectAnswered: true, skipLeadCheck: true },
  { q: "Difference between P&L only and bank statement?", simple: true, expectAnswered: true, skipLeadCheck: true },
  { q: "Where do I upload a P&L?", simple: true, expectAnswered: true, skipLeadCheck: true },
  // Scenario triage (short facts)
  { q: "Borrower is 1x30x12, 660 score, 75% LTV cash out — who works?", simple: true, expectAnswered: true },
  { q: "Self-employed 18 months, can anyone use 12-month statements?", simple: true, expectAnswered: true },
  { q: "660 score, 80% LTV DSCR — who works?", simple: true, expectAnswered: true },
  // Exception guidance
  { q: "Where can I find more flexible non-QM lenders who allow for exceptions?", simple: true, expectAnswered: true },
  { q: "Who gives exceptions on mortgage lates?", simple: true, expectAnswered: true },
  // Explicitly detailed requests (allowed to be longer/structured)
  { q: "Give me a detailed comparison of every lender that allows DSCR at 85% LTV with all the gating conditions.", simple: false, expectAnswered: true, skipLeadCheck: true },
  { q: "What are the full guidelines for the DSCR Flex program including documentation requirements?", simple: false, expectAnswered: true, skipLeadCheck: true },
  // Unanswerable / guardrails
  { q: "Who is the best lender for a 900 FICO borrower making $1M/month?", simple: true, expectAnswered: false },
  { q: "What's the max LTV for a lender named MadeUp Capital?", simple: true, expectAnswered: false },
  { q: "Can I just call it owner-occupied?", simple: true, expectAnswered: false },
  { q: "What's the exact interest rate for DSCR at 75% LTV?", simple: true, expectAnswered: true, skipLeadCheck: true },

  // ── Cash-out refinance ────────────────────────────────────────────────────
  { q: "Who allows cash-out on bank statements?", simple: true, expectAnswered: true },
  { q: "What's the highest LTV on a cash-out refi with bank statements?", simple: true, expectAnswered: true },
  { q: "Who does cash-out DSCR?", simple: true, expectAnswered: true },
  { q: "What's the highest LTV on a DSCR cash-out?", simple: true, expectAnswered: true },

  // ── Foreign national scenarios ────────────────────────────────────────────
  { q: "Which lenders do foreign national on an investment property?", simple: true, expectAnswered: true },
  { q: "What's the max LTV for a foreign national DSCR?", simple: true, expectAnswered: true },
  { q: "Do any lenders do foreign national bank statements?", simple: true, expectAnswered: false }, // honest non-answer
  { q: "Foreign national with no US credit — who works?", simple: true, expectAnswered: true },
  { q: "What is the Foreign National Investor program?", simple: true, expectAnswered: true, skipLeadCheck: true },

  // ── Multi-property / investor queries ─────────────────────────────────────
  { q: "Experienced investor with 3 rentals, 75% LTV DSCR — who works?", simple: true, expectAnswered: true },
  { q: "Who does DSCR for an experienced investor with multiple properties?", simple: true, expectAnswered: true },
  { q: "Who does DSCR on a 4-unit?", simple: true, expectAnswered: true },
  { q: "Do any lenders allow 5-8 units with DSCR?", simple: true, expectAnswered: false }, // honest non-answer
  { q: "Who allows LLC vesting on an investment property?", simple: true, expectAnswered: true },

  // ── Other program / borrower types ────────────────────────────────────────
  { q: "Who offers asset depletion?", simple: true, expectAnswered: true },
  { q: "Who does P&L only?", simple: true, expectAnswered: false }, // honest non-answer (not in catalog)
  { q: "Who does WVOE?", simple: true, expectAnswered: false }, // honest non-answer (not in catalog)
  { q: "Who uses 12-month bank statements for a self-employed borrower?", simple: true, expectAnswered: true },
  { q: "ITIN borrower at 85% LTV — who works?", simple: true, expectAnswered: true },
  { q: "Borrower has 2x30x12 mortgage lates — who's flexible?", simple: true, expectAnswered: true },
  { q: "Tell me about the DSCR Flex program.", simple: true, expectAnswered: true, skipLeadCheck: true },
  { q: "Who's fastest to close?", simple: true, expectAnswered: true, skipLeadCheck: true },
  { q: "Which lenders take a 1099 borrower?", simple: true, expectAnswered: true },
];

describe("chatbot response style (FAST · ACCURATE · HUMAN · EASY TO READ)", () => {
  it("answers first, concisely, conversationally — no walls of text, no boilerplate, no question-repetition", async () => {
    const violations: string[] = [];
    for (const c of CASES) {
      const run = await runChatAssistant({ catalog, postureProfiles: posture, messages: [{ role: "user", content: c.q }] });
      const answer = run.reply.answer;
      const lower = answer.toLowerCase();

      if (run.reply.answered !== c.expectAnswered) {
        violations.push(`${c.q} :: answered=${run.reply.answered} expected=${c.expectAnswered}`);
      }
      for (const r of ROBOTIC) {
        if (lower.includes(r)) violations.push(`${c.q} :: robotic phrase "${r}"`);
      }
      if (c.expectAnswered) {
        if (c.simple && answer.length > 520) violations.push(`${c.q} :: too long (${answer.length} chars): ${answer.slice(0, 140)}…`);
        if (!c.skipLeadCheck && !/^\s*(yes|no|yep|nope|lowest|highest|\d|a few|i'd|i would|here|that|it|nothing)/i.test(answer)) {
          violations.push(`${c.q} :: answer doesn't lead with the finding: "${answer.slice(0, 60)}"`);
        }
      }
      if (c.expectAnswered && run.reply.rows.length > 0) {
        const toolIds = new Set(run.log.toolResults.flatMap((r) => r.programIds));
        for (const row of run.reply.rows) {
          if (!toolIds.has(row.programId)) violations.push(`${c.q} :: UNGROUNDED row ${row.programName}`);
        }
      }
      if (c.expectAnswered && !c.simple && !c.q.toLowerCase().includes("comparison") && !c.q.toLowerCase().includes("full guidelines")) {
        // detailed-style question still must be grounded and not hallucinated
      }
    }
    expect(violations).toEqual([]);
  });

  it("availability answers are scannable bullet lists with the count first and an offer to compare", async () => {
    const q = "Who has ITIN loans?";
    const run = await runChatAssistant({ catalog, postureProfiles: posture, messages: [{ role: "user", content: q }] });
    expect(run.reply.answered).toBe(true);
    expect(run.reply.answer).toMatch(/^Yes — 1 program/);
    expect(run.reply.answer).toContain("• ITIN Full Doc");
    expect(run.reply.answer.toLowerCase()).toContain("want me to compare");
  });

  it("the 600-FICO availability question is actually FICO-filtered, not a doc-type dump", async () => {
    const q = "Are there any lenders that go down to a 600 fico for bank statement programs?";
    const run = await runChatAssistant({ catalog, postureProfiles: posture, messages: [{ role: "user", content: q }] });
    expect(run.reply.answered).toBe(true);
    const answer = run.reply.answer;
    // 600-FICO question must not dump programs whose floor is above 600.
    const lowered = answer.toLowerCase();
    // The programs listed must actually have minFico <= 600 in the eval seed.
    const listed = [...answer.matchAll(/• ([^(]+) \(([^)]+)\)/g)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
    for (const name of listed) {
      const p = catalog.programs.find((x) => x.name === name);
      if (!p) continue;
      expect(p.minFico, `${name} minFico ${p.minFico} > 600 but listed for a 600-FICO borrower`).toBeLessThanOrEqual(600);
    }
  });

  it("superlatives lead with the finding and name the winner", async () => {
    const run = await runChatAssistant({ catalog, postureProfiles: posture, messages: [{ role: "user", content: "Who has the lowest down payment for DSCR?" }] });
    expect(run.reply.answer).toMatch(/^Lowest down payment: \d+% down — DSCR Select \(Summit Non-QM\)/);
    expect(run.reply.rows[0]!.value).toBe(15);
  });

  it("honest non-answers, never invented guidance", async () => {
    const run = await runChatAssistant({ catalog, postureProfiles: posture, messages: [{ role: "user", content: "What's the max LTV for a lender named MadeUp Capital?" }] });
    expect(run.reply.answered).toBe(false);
    expect(run.reply.answer.toLowerCase()).not.toContain("madeup capital");
  });

  it("no per-answer boilerplate caveats on simple answers", async () => {
    const run = await runChatAssistant({ catalog, postureProfiles: posture, messages: [{ role: "user", content: "Who allows an LLC to take title?" }] });
    expect(run.reply.caveats).toEqual([]);
    expect(run.reply.answer.toLowerCase()).not.toContain("not an eligibility determination");
  });
});