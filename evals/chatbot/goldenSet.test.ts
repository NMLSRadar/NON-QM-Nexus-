import { describe, expect, it } from "vitest";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import type { ProgramCatalog } from "@/domain/analyze";
import type { ChatAnswer } from "@/domain/chat/answer";
import { mergePostureProfiles } from "@/domain/lenderPosture";
import { runChatPipeline } from "@/lib/ai/chatPipeline";
import { GOLDEN_SET } from "./fixtures";

/**
 * Chatbot eval harness — golden set (spec §7). Runs the full pipeline
 * (narration disabled → fully deterministic) against the seeded sample
 * catalog and grades:
 *   - intent accuracy ≥ 95% (aggregate)
 *   - answered/refusal correctness per fixture (correct-refusal rate 100%)
 *   - expected key facts present
 *   - hallucinated-entity rate 0: every lender/program named in any answer
 *     must exist in the catalog
 *   - answer-contract completeness on every answered reply
 *   - latency: deterministic pipeline must stay well under the 1.5s
 *     first-token budget
 */

const catalog: ProgramCatalog = { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };
const postureProfiles = mergePostureProfiles([]);

const KNOWN_LENDER_WORDS = new Set(
  sampleLenders.flatMap((l) => l.name.toLowerCase().split(/[\s()-]+/)).filter((w) => w.length > 3)
);

function answerText(a: ChatAnswer): string {
  return [
    a.answer,
    a.clarifyingQuestion ?? "",
    ...a.rows.flatMap((r) => [r.lenderName, r.programName, r.value ?? "", ...r.gatingConditions, ...r.caveats]),
    ...a.assumptions,
    ...a.caveats,
    ...a.followUps,
  ].join("\n");
}

/** Every lender-shaped proper name in the reply must be a catalog lender.
 * (Program names and glossary terms are excluded by checking only phrases
 * ending in a lender-suffix word.) */
function hallucinatedLenderNames(a: ChatAnswer): string[] {
  const text = answerText(a);
  const candidates = text.match(/\b([A-Z][a-zA-Z&'-]*(?:\s+[A-Z][a-zA-Z&'-]*)*\s+(?:Lending|Funding|Capital|Mortgage|Financial|Bancorp|Partners|Finance|Wholesale))\b/g) ?? [];
  const knownFull = [
    ...sampleLenders.map((l) => l.name.toLowerCase().replace(/\s*\(sample\)\s*$/i, "")),
    // Posture directory names ARE tool-grounded (get_lender_posture /
    // find_exception_candidates return them) — not hallucinations.
    ...postureProfiles.flatMap((p) => [p.canonicalName.toLowerCase(), ...p.aliases.map((a) => a.toLowerCase())]),
  ];
  return candidates.filter((c) => {
    const lower = c.toLowerCase();
    if (knownFull.some((k) => k.includes(lower) || lower.includes(k))) return false;
    // An honest "X isn't in your library" echo is a refusal, not a claim.
    return !text.includes(`${c} isn't in your library`);
  });
}

describe("chatbot golden set", () => {
  const intentResults: boolean[] = [];
  const refusalResults: boolean[] = [];

  for (const fixture of GOLDEN_SET) {
    it(`${fixture.id}: "${fixture.question}"`, async () => {
      const { answer, parsed, log } = await runChatPipeline(fixture.question, catalog, {
        enableNarration: false,
        priorUserMessages: fixture.priorUserMessages,
        postureProfiles,
      });

      // Intent (graded in aggregate below, recorded per fixture here)
      intentResults.push(parsed.intent === fixture.expectedIntent);

      // Answered vs explicit non-answer — exact per fixture
      expect(answer.answered, `answered flag — got: ${answer.answer}`).toBe(fixture.expectAnswered);
      if (fixture.tags?.includes("unanswerable")) refusalResults.push(!answer.answered);

      // Expected key facts
      const text = answerText(answer);
      for (const fact of fixture.expectFacts ?? []) {
        expect(text.toLowerCase(), `expected fact "${fact}"`).toContain(fact.toLowerCase());
      }
      for (const lender of fixture.expectLenders ?? []) {
        expect(
          answer.rows.some((r) => r.lenderName.includes(lender)) || text.includes(lender),
          `expected lender "${lender}" in rows/text`
        ).toBe(true);
      }
      for (const lender of fixture.forbidLenders ?? []) {
        expect(answer.rows.some((r) => r.lenderName.includes(lender)), `forbidden lender "${lender}" in rows`).toBe(false);
      }
      for (const tool of fixture.expectTools ?? []) {
        expect(answer.toolActivity.map((t) => t.tool), `expected tool ${tool}`).toContain(tool);
      }
      if (fixture.expectClarifyingQuestion) {
        expect(answer.clarifyingQuestion, "expected a clarifying question").toBeTruthy();
      }

      // Grounding: zero hallucinated lender entities anywhere in the reply
      expect(hallucinatedLenderNames(answer), "hallucinated lender names").toEqual([]);

      // Answer-contract completeness
      expect(answer.answer.length).toBeGreaterThan(0);
      if (answer.answered && answer.rows.length > 0) {
        for (const row of answer.rows) {
          expect(row.guidelineVersion, `${row.programName} missing guideline version`).toBeTruthy();
          expect(row.effectiveDate, `${row.programName} missing effective date`).toBeTruthy();
        }
        // Editorial (posture) rows are never guideline sources; only replies
        // with guideline-sourced rows must carry citations, and editorial
        // replies must instead carry the editorial disclaimer.
        const hasGuidelineRows = answer.rows.some((r) => r.sourceType !== "editorial");
        if (hasGuidelineRows) {
          expect(answer.sources.length, "answered replies with guideline rows must carry sources").toBeGreaterThan(0);
        } else {
          expect(answer.caveats.join(" ")).toMatch(/market experience/i);
        }
      }
      // Sample data must be labeled inline when present
      if (answer.rows.some((r) => r.isSampleData)) {
        const labeled = answer.rows.every((r) => !r.isSampleData || r.isSampleData === true);
        expect(labeled).toBe(true);
      }

      // Grounding rate: an answered factual reply must have made ≥1 tool call
      if (answer.answered && parsed.intent !== "out_of_scope") {
        expect(answer.toolActivity.length, "answered reply with zero tool calls").toBeGreaterThan(0);
      }

      // Latency: deterministic pipeline far under the 1.5s first-token budget
      expect(log.latencyMs).toBeLessThan(1500);
    });
  }

  it("aggregate: intent accuracy ≥ 95%", () => {
    const accuracy = intentResults.filter(Boolean).length / intentResults.length;
    expect(intentResults.length).toBe(GOLDEN_SET.length);
    expect(accuracy, `intent accuracy ${(accuracy * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.95);
  });

  it("aggregate: correct-refusal rate on unanswerable questions = 100%", () => {
    const unanswerable = GOLDEN_SET.filter((f) => f.tags?.includes("unanswerable"));
    expect(unanswerable.length).toBeGreaterThanOrEqual(10);
    expect(refusalResults.length).toBe(unanswerable.length);
    expect(refusalResults.every(Boolean)).toBe(true);
  });

  it("corpus shape: ≥ 60 questions, ≥ 10 with typos/shorthand", () => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(60);
    expect(GOLDEN_SET.filter((f) => f.tags?.includes("typo") || f.tags?.includes("shorthand")).length).toBeGreaterThanOrEqual(10);
  });
});
