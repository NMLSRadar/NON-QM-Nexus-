/**
 * Chatbot eval runner — grades the golden set against the eval seed catalog
 * through the deterministic path (no LLM), so CI can assert the precision
 * guarantees without API keys. Latency/first-token metrics are covered by the
 * route layer (see assistant logging) and unit latency tests.
 */

import { runChatAssistant } from "@/lib/ai/chatbot/orchestrate";
import { evalCatalog } from "./seed";
import { seedProfiles } from "@/domain/lenderPosture";
import { GOLDEN_SET, type ChatbotFixture } from "./golden";

export interface FixtureGrade {
  id: string;
  question: string;
  intentOk: boolean;
  answeredOk: boolean;
  grounded: boolean;
  hallucinated: boolean;
  complete: boolean;
  ok: boolean;
}

export interface EvalSummary {
  total: number;
  passed: number;
  intentAccuracy: number;
  groundingRate: number;
  correctRefusal: number;
  hallucinationRate: number;
  completenessRate: number;
  failures: Array<{ id: string; reason: string }>;
}

export async function runEvalSuite(): Promise<EvalSummary> {
  const catalog = evalCatalog();
  const posture = seedProfiles("org_eval");
  const grades: FixtureGrade[] = [];

  for (const fixture of GOLDEN_SET) {
    grades.push(await gradeFixture(fixture, catalog, posture));
  }

  const intentOk = grades.filter((g) => g.intentOk).length;
  const grounded = grades.filter((g) => g.grounded).length;
  // Correct-refusal: a fixture that expects answered=false must ALSO get a
  // false reply (answeredOk true means reply.answered === fixture.answered).
  const refusalsExpected = grades.filter((g) => !fixtureAnswered(g)).length;
  const refusalsCorrect = grades.filter((g) => !fixtureAnswered(g) && g.answeredOk).length;
  const hallucinated = grades.filter((g) => g.hallucinated).length;
  const complete = grades.filter((g) => g.complete).length;
  const passed = grades.filter((g) => g.ok).length;

  const failures = grades
    .filter((g) => !g.ok)
    .map((g) => ({ id: g.id, reason: collectReasons(g) }));

  return {
    total: grades.length,
    passed,
    intentAccuracy: intentOk / grades.length,
    groundingRate: grounded / grades.length,
    correctRefusal: refusalsExpected ? refusalsCorrect / refusalsExpected : 1,
    hallucinationRate: hallucinated / grades.length,
    completenessRate: complete / grades.length,
    failures,
  };
}

function fixtureAnswered(f: FixtureGrade): boolean {
  // Grades carry no expected flag; derive from the fixture list.
  return GOLDEN_SET.find((x) => x.id === f.id)?.answered ?? false;
}

async function gradeFixture(
  fixture: ChatbotFixture,
  catalog: ReturnType<typeof evalCatalog>,
  posture: ReturnType<typeof seedProfiles>,
): Promise<FixtureGrade> {
  const run = await runChatAssistant({
    catalog,
    postureProfiles: posture,
    messages: [{ role: "user", content: fixture.question }],
  });
  const reply = run.reply;

  const intentOk = run.log.intent === fixture.expectedIntent;
  const answeredOk = reply.answered === fixture.answered;

  // Grounding: every row's programId traces to a tool result.
  const toolIds = new Set(run.log.toolResults.flatMap((r) => r.programIds));
  const rowIds = reply.rows.map((r) => r.programId);
  const grounded = rowIds.every((id) => toolIds.has(id));

  // Hallucination: no forbidden substring, and no estimated price figures on
  // pricing questions.
  const answerLower = reply.answer.toLowerCase();
  const mustNot = (fixture.mustNotContain ?? []).map((s) => s.toLowerCase());
  const hallucinated = mustNot.some((s) => answerLower.includes(s));

  // Completeness: answered fixtures must carry a non-empty answer.
  const complete = reply.answered ? reply.answer.trim().length > 0 : true;

  const ok = intentOk && answeredOk && grounded && !hallucinated && complete;
  return { id: fixture.id, question: fixture.question, intentOk, answeredOk, grounded, hallucinated, complete, ok };
}

function collectReasons(g: FixtureGrade): string {
  const parts: string[] = [];
  if (!g.intentOk) parts.push("intent mismatch");
  if (!g.answeredOk) parts.push("answered mismatch");
  if (!g.grounded) parts.push("ungrounded row");
  if (g.hallucinated) parts.push("hallucinated entity/price");
  if (!g.complete) parts.push("incomplete answer");
  return parts.join(", ");
}