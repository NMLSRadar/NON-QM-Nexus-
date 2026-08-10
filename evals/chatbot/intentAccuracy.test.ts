import { describe, expect, it } from "vitest";
import { sampleLenders } from "@/data/sampleLenders";
import { parseChatQuery } from "@/domain/chat/parse";
import { GOLDEN_SET } from "./fixtures";

/** Reports the exact Stage A intent accuracy over the golden set (the
 * aggregate gate lives in goldenSet.test.ts; this prints the number so the
 * figure cited in docs/chatbot.md is verifiable from a single test run). */
describe("intent accuracy report", () => {
  it("computes and reports the accuracy", () => {
    const knownLenderNames = sampleLenders.map((l) => l.name.replace(/\s*\((sample|demo)\)\s*$/i, ""));
    const misses: string[] = [];
    for (const f of GOLDEN_SET) {
      const parsed = parseChatQuery(f.question, { knownLenderNames });
      if (parsed.intent !== f.expectedIntent) misses.push(`${f.id}: expected ${f.expectedIntent}, got ${parsed.intent}`);
    }
    const accuracy = (GOLDEN_SET.length - misses.length) / GOLDEN_SET.length;
    console.info(`[chatbot-eval] intent accuracy: ${(accuracy * 100).toFixed(1)}% (${GOLDEN_SET.length - misses.length}/${GOLDEN_SET.length})`, misses);
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
  });
});
