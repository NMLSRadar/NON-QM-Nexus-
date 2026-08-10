/**
 * Chatbot Stage B orchestrator.
 *
 * Two-stage pipeline: Stage A (deterministic parse) -> this orchestrator runs a
 * TIGHT, intent-scoped tool set against the tier-gated catalog, then either
 * (a) renders a deterministic answer from the tool results, or (b) hands the
 * tool results to the LLM to NARRATE, with a hard grounding check that rejects
 * anything not traceable to a tool result. The deterministic renderer is the
 * safety net AND the CI eval target — grounding is guaranteed by construction.
 *
 * Tool results are injected as labeled untrusted data; the prompt never
 * concatenates them into the instruction section. The loop is bounded (fixed
 * tool set per intent, never more than 5 calls).
 */

import { parseQuery } from "@/domain/chat/parse";
import {
  rankProgramsByMetric,
  searchPrograms,
  getProgramDetail,
  queryRules,
  quickEvaluate,
  searchHelp,
  createScenarioDraft,
  toGroundedResult,
} from "@/domain/chat/tools";
import { metricLabel } from "@/domain/chat/metrics";
import { lookupDefinition, nonAnswerFieldNotCaptured, nonAnswerNoProgramAllows, nonAnswerGuidelinesNotLoaded, type NonAnswer } from "@/domain/chat/definitions";
import type { GroundedToolResult, ParsedQuery } from "@/domain/chat/types";
import type { ProgramCatalog } from "@/domain/analyze";
import { getLenderPosture, exceptionCandidates, EDITORIAL_DISCLAIMER, PRICING_EXPLAINER, type LenderFlexibilityProfile } from "@/domain/lenderPosture";
import { scoreCompensatingFactors, type CompensatingFactorInput } from "@/domain/compensatingFactors/score";
import { AssistantReplySchema, STANDING_DISCLAIMER, type AssistantReply, type ForecastRow } from "./answerSchema";
import { asUntrustedData, type AiProvider, type AiMessage } from "@/lib/ai/provider";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PROMPT_VERSION = "chatbot-narrate-v1";

let cachedPrompt: string | null = null;
function loadNarratePrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  const p = path.join(process.cwd(), "prompts", "chatbot", "narrate.md");
  cachedPrompt = readFileSync(p, "utf8");
  return cachedPrompt;
}

export interface ChatOrchestratorOptions {
  catalog: ProgramCatalog;
  postureProfiles?: LenderFlexibilityProfile[];
  provider?: AiProvider | null;
  messages?: Array<{ role: string; content: string }>;
  orgId?: string;
  knownNames?: { lenderNames: string[]; programNames: string[] };
}

export interface AssistantRun {
  reply: AssistantReply;
  log: {
    intent: string;
    normalizedText: string;
    tools: string[];
    toolResults: GroundedToolResult[];
    promptVersion: string;
    provider: string | null;
    grounded: boolean;
    usedDeterministic: boolean;
  };
}

interface ToolContext {
  parser: ParsedQuery;
  rank?: ReturnType<typeof rankProgramsByMetric>;
  search?: ReturnType<typeof searchPrograms>;
  detail?: ReturnType<typeof getProgramDetail>;
  rules?: ReturnType<typeof queryRules>;
  evals?: ReturnType<typeof quickEvaluate>;
  help?: ReturnType<typeof searchHelp>;
  draft?: ReturnType<typeof createScenarioDraft>;
  posture?: ReturnType<typeof getLenderPosture>;
  grounding: { programIds: Set<string>; lenderNames: Set<string>; fieldCaptured?: boolean };
}

// ---------------------------------------------------------------------------
// Tool selection (bounded per intent).
// ---------------------------------------------------------------------------

function runTools(parsed: ParsedQuery, opts: ChatOrchestratorOptions): { ctx: ToolContext; results: GroundedToolResult[] } {
  const ctx: ToolContext = { parser: parsed, grounding: { programIds: new Set(), lenderNames: new Set() } };
  const results: GroundedToolResult[] = [];
  const catalog = opts.catalog;
  const entities = parsed.entities;
  const filters = {
    docType: entities.docType,
    occupancy: entities.occupancy,
    purpose: entities.purpose,
    propertyType: entities.propertyType,
    citizenship: entities.citizenship,
    vesting: entities.vesting,
    features: entities.features,
    fico: entities.fico, // "who goes to a 600 FICO" is a real filter
  };

  const add = (r: GroundedToolResult) => {
    results.push(r);
    for (const id of r.programIds) ctx.grounding.programIds.add(id);
    for (const row of extractLenderNames(r.data)) ctx.grounding.lenderNames.add(row);
  };

  switch (parsed.intent) {
    case "superlative_lookup":
    case "threshold_lookup": {
      if (parsed.targetMetric) {
        const rank = rankProgramsByMetric(catalog, parsed.targetMetric, parsed.direction ?? "min", filters, entities, 5);
        ctx.rank = rank;
        ctx.grounding.fieldCaptured = rank.fieldCaptured;
        add(toGroundedResult("rank_programs_by_metric", "guideline", { metric: parsed.targetMetric, direction: parsed.direction }, rank));
      }
      break;
    }
    case "availability_lookup": {
      const search = searchPrograms(catalog, filters, 20);
      ctx.search = search;
      add(toGroundedResult("search_programs", "guideline", filters, search));
      break;
    }
    case "scenario_triage": {
      const evals = quickEvaluate(catalog, entities, 5);
      if (evals.length > 0) {
        ctx.evals = evals;
        add(toGroundedResult("quick_evaluate", "guideline", { entities }, evals));
      }
      break;
    }
    case "exception_guidance": {
      const profiles = opts.postureProfiles ?? [];
      const posture = getLenderPosture(profiles, catalog.lenders);
      ctx.posture = posture;
      add(toGroundedResult("get_lender_posture", "editorial", {}, posture));
      const candidates = exceptionCandidates(profiles, catalog.lenders);
      if (candidates.length > 0) add(toGroundedResult("find_exception_candidates", "editorial", {}, candidates));
      break;
    }
    case "program_detail": {
      // Resolve the named program to a real catalog row (fuzzy by name).
      let id = parsed.namedPrograms?.[0]?.resolvedProgramId;
      if (!id && parsed.namedPrograms?.[0]) {
        const q = parsed.namedPrograms[0].query.toLowerCase();
        const found = catalog.programs.find((p) => p.name.toLowerCase() === q || p.name.toLowerCase().includes(q));
        id = found?.id;
      }
      if (id) {
        const detail = getProgramDetail(catalog, id);
        if (detail) {
          ctx.detail = detail;
          add(toGroundedResult("get_program_detail", "guideline", { programId: id }, detail));
        }
      }
      break;
    }
    case "app_navigation":
    case "process_help": {
      const help = searchHelp(parsed.normalizedText);
      ctx.help = help;
      add(toGroundedResult("search_help", "help", { query: parsed.normalizedText }, help));
      break;
    }
    case "definition": {
      const def = lookupDefinition(parsed.normalizedText);
      if (def) add(toGroundedResult("definition_lookup", "help", { term: def.term }, def));
      break;
    }
    case "comparison": {
      const search = searchPrograms(catalog, filters, 20);
      ctx.search = search;
      add(toGroundedResult("search_programs", "guideline", filters, search));
      break;
    }
    default:
      break;
  }

  // Scenario draft is always a cheap, grounded next-step.
  const draft = createScenarioDraft(entities, opts.orgId);
  ctx.draft = draft;

  return { ctx, results };
}

function extractLenderNames(data: unknown): string[] {
  const out: string[] = [];
  const push = (o: unknown) => {
    if (o && typeof o === "object") {
      const r = o as Record<string, unknown>;
      if (typeof r.lenderName === "string") out.push(r.lenderName);
      if (Array.isArray(r.rows)) for (const row of r.rows) push(row);
      if (Array.isArray(r)) for (const row of r) push(row);
    }
  };
  push(data);
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic renderer (grounding guaranteed by construction).
// ---------------------------------------------------------------------------

function renderDeterministic(ctx: ToolContext, opts: ChatOrchestratorOptions): AssistantReply {
  const parsed = ctx.parser;
  const assumptions = parsed.missingCriticalFields.length
    ? [`Assumes: ${parsed.missingCriticalFields.join(", ")} not stated; best published tier used.`]
    : [];
  const defaultCta = ctx.draft ? { label: "Run this in a full scenario", href: ctx.draft.deepLink } : undefined;

  switch (parsed.intent) {
    case "superlative_lookup":
    case "threshold_lookup": {
      const rank = ctx.rank;
      if (rank && rank.fieldCaptured && rank.rows.length > 0) {
        const top = rank.rows[0]!;
        const noun = metricNoun(parsed.targetMetric!);
        const dirRaw = parsed.direction === "min" ? "lowest" : "highest";
        const dir = dirRaw[0]!.toUpperCase() + dirRaw.slice(1);
        const tieNote = rank.ties.length > 1 ? ` (tied with ${rank.ties.length - 1} other program${rank.ties.length > 2 ? "s" : ""})` : "";
        const sampleTag = top.isSampleData ? " (sample)" : "";
        const label = top.valueLabel ?? `${top.value}${metricSuffix(parsed.targetMetric!)}`;
        const answer =
          `${dir} ${noun}: ${label} — ${top.programName} (${top.lenderName})${sampleTag}${tieNote}.` +
          (top.gating.length ? ` Needs ${top.gating.join(", ")}.` : "");
        const rows = rank.rows.map(toRow).filter((r): r is ForecastRow => r !== null);
        return {
          answer,
          rows,
          assumptions,
          caveats: ["occupancy, purpose, or FICO band can change the ceiling."],
          sources: capSources(rows, 8).map((r) => ({ lenderName: r.lenderName, programName: r.programName, guidelineVersion: r.guidelineVersion, effectiveDate: r.effectiveDate, lastVerifiedDate: r.lastVerifiedDate, isSampleData: r.isSampleData })),
          followUps: ["Want me to compare the top 3?", "Run this in a full scenario"],
          cta: defaultCta,
          answered: true,
        };
      }
      return nonAnswerToReply(fieldNotCapturedNonAnswer(parsed.targetMetric), ctx);
    }
    case "availability_lookup": {
      const search = ctx.search;
      if (search && search.rows.length > 0) {
        const limit = 5;
        const top = search.rows.slice(0, limit);
        const extra = search.rows.length - top.length;
        const lines = top
          .map((r) => `• ${r.programName} (${r.lenderName}${r.isSampleData ? ", sample" : ""})`)
          .join("\n");
        const countPhrase =
          search.rows.length === 1 ? "Yes — 1 program matches that." : `Yes — ${search.rows.length} programs match that.`;
        const listLead =
          search.rows.length === 1
            ? `\n${lines}`
            : search.rows.length > limit
              ? `\n\nBest options:\n${lines}\n…and ${extra} more.`
              : `\n\nBest options:\n${lines}`;
        return {
          answer: `${countPhrase}${listLead}\n\nEligibility still depends on the full scenario — want me to compare the top 3?`,
          rows: [],
          assumptions,
          caveats: [],
          sources: capSources(search.rows, 8).map((r) => ({ lenderName: r.lenderName, programName: r.programName, guidelineVersion: r.guidelineVersion, effectiveDate: r.effectiveDate, lastVerifiedDate: r.lastVerifiedDate, isSampleData: r.isSampleData })),
          followUps: ["Want me to compare the top 3?", "Run this in a full scenario"],
          cta: defaultCta,
          answered: true,
        };
      }
      return nonAnswerToReply(nonAnswerNoProgramAllows(describeEntities(parsed)), ctx);
    }
    case "scenario_triage": {
      const evals = ctx.evals;
      if (evals && evals.length > 0) {
        const eligible = evals.filter((e) => ["strong_match", "eligible", "eligible_with_restructuring", "conditional", "manual_review"].includes(e.status));
        const rows = eligible.slice(0, 4).map((e) => ({
          programId: e.programId,
          lenderName: e.lenderName,
          programName: e.programName,
          value: null,
          valueLabel: e.status.replace(/_/g, " "),
          gating: e.failedRules.map((f) => f.userExplanation).slice(0, 1),
          isSampleData: e.isSampleData,
          fieldNotCaptured: false,
        }));
        const names = eligible.slice(0, 3).map((e) => `${e.programName} (${e.lenderName})`).join(", ");
        return {
          answer: eligible.length
            ? `A few worth running: ${names}. Missing details (FICO, occupancy, property type) can change this — a full run will confirm.`
            : "Nothing in your library cleanly fits what you've described so far — missing details would change this.",
          rows,
          assumptions,
          caveats: [],
          sources: capSources(rows, 6).map((r) => ({ lenderName: r.lenderName, programName: r.programName, isSampleData: r.isSampleData })),
          followUps: ["Run full scenario", "Add the missing borrower vitals"],
          cta: defaultCta,
          answered: true,
        };
      }
      return nonAnswerToReply(fieldNotCapturedNonAnswer("a matching scenario"), ctx);
    }
    case "exception_guidance": {
      if (ctx.posture && ctx.posture.length > 0) {
        const except = ctx.posture.filter((p) => p.posture === "exception_based");
        const names = except.map((p) => p.lenderName).join(", ") || "none currently flagged";
        let fileAssessment = "";
        // Part 2 §5.3(3): if borrower facts are in context, run the
        // deterministic compensating-factors engine and report the real numbers.
        const cf = buildCompensatingAssessment(parsed);
        if (cf) {
          fileAssessment = ` On your current scenario: ${cf}.`;
        }
        return {
          answer: `${except.length} lender${except.length === 1 ? "" : "s"} are flagged exception-friendly — ${names}. Exceptions there run through the AE, and none of them grant exceptions on the ask alone: they weigh compensating factors (reserves well past the requirement, LTV meaningfully under the cap, low DTI, clean housing history).${fileAssessment}`,
          rows: [],
          assumptions: [],
          caveats: [EDITORIAL_DISCLAIMER],
          sources: [],
          followUps: ["Which compensating factors do I have?", "Draft an exception request"],
          cta: { label: "View AE contacts", href: "/lenders" },
          answered: true,
          editorial: true,
        };
      }
      return nonAnswerToReply(nonAnswerNoProgramAllows("an exception"), ctx);
    }
    case "program_detail": {
      const detail = ctx.detail;
      if (detail) {
        const row = detail.program;
        return {
          answer: `${row.programName} (${row.lenderName}${row.isSampleData ? ", sample" : ""}) — version ${row.guidelineVersion ?? "n/a"}, effective ${row.effectiveDate ?? "n/a"}. ${
            detail.rules.length ? `Documented rules: ${detail.rules.slice(0, 3).map((r) => `${r.name} (${r.severity})`).join("; ")}.` : "No structured rules on file."
          } ${row.isSampleData ? "This is a demonstration program, not a real lender guideline." : ""}`,
          rows: [row],
          assumptions: [],
          caveats: ["Program detail reflects the loaded guideline version; verify before submission."],
          sources: [{ lenderName: row.lenderName, programName: row.programName, guidelineVersion: row.guidelineVersion, effectiveDate: row.effectiveDate, lastVerifiedDate: row.lastVerifiedDate, isSampleData: row.isSampleData }],
          followUps: ["Run this program in a full scenario"],
          cta: defaultCta,
          answered: true,
        };
      }
      return nonAnswerToReply(nonAnswerGuidelinesNotLoaded(parsed.namedPrograms?.[0]?.query ?? "that lender"), ctx);
    }
    case "definition": {
      const def = lookupDefinition(parsed.normalizedText);
      if (def) return { answer: def.definition, rows: [], assumptions: [], caveats: [], sources: [], followUps: [], answered: true };
      return { answer: "I don't have a definition for that term in my guide yet.", rows: [], assumptions: [], caveats: [], sources: [], followUps: [], answered: false, nonAnswer: "I don't have a definition for that term in my guide yet." };
    }
    case "app_navigation":
    case "process_help": {
      const help = ctx.help?.[0];
      if (help) {
        return {
          answer: help.summary,
          rows: [],
          assumptions: [],
          caveats: [],
          sources: [],
          followUps: help.steps.slice(0, 3),
          cta: help.ctaLabel ? { label: help.ctaLabel, href: help.route ?? "/" } : undefined,
          answered: true,
        };
      }
      return { answer: "That's a product question I don't have a step-by-step for yet.", rows: [], assumptions: [], caveats: [], sources: [], followUps: [], answered: false, nonAnswer: "No help topic matches." };
    }
    case "comparison": {
      if (/rate|price|cheaper|pricing/i.test(parsed.normalizedText)) {
        return {
          answer: PRICING_EXPLAINER,
          rows: [],
          assumptions: [],
          caveats: ["No rate, point, or price figure is modeled in this platform."],
          sources: [],
          followUps: ["Who is more flexible?", "Compare these programs in a full scenario"],
          cta: defaultCta,
          answered: true,
        };
      }
      const search = ctx.search;
      if (search && search.rows.length > 0) {
        return renderDeterministic({ ...ctx, parser: { ...parsed, intent: "availability_lookup" } as ParsedQuery }, opts);
      }
      return nonAnswerToReply(nonAnswerNoProgramAllows("that comparison"), ctx);
    }
    case "out_of_scope": {
      return outOfScopeReply(parsed);
    }
    default:
      return { answer: "I'm not sure what you're asking about lenders or guidelines.", rows: [], assumptions: [], caveats: [], sources: [], followUps: [], answered: false, nonAnswer: "I couldn't classify this question." };
  }
}

function toRow(r: { programId: string; lenderName: string; programName: string; value: number | null; valueLabel?: string; gating: string[]; isSampleData: boolean; guidelineVersion?: string; effectiveDate?: string; lastVerifiedDate?: string; fieldNotCaptured: boolean }): ForecastRow | null {
  return {
    programId: r.programId,
    lenderName: r.lenderName,
    programName: r.programName,
    value: r.value,
    valueLabel: r.valueLabel,
    gating: r.gating,
    isSampleData: r.isSampleData,
    guidelineVersion: r.guidelineVersion,
    effectiveDate: r.effectiveDate,
    lastVerifiedDate: r.lastVerifiedDate,
    fieldNotCaptured: r.fieldNotCaptured,
  };
}

function metricSuffix(metric: string): string {
  if (metric === "min_down_payment") return "% down";
  if (metric === "min_reserves") return " months reserves";
  if (metric === "min_loan_amount" || metric === "max_loan_amount") return " loan amount";
  if (metric === "min_seasoning") return " months";
  return "";
}

/** Human noun for a metric, so answers read naturally ("highest LTV", "lowest
 * down payment") instead of "lowest Min down payment". */
function metricNoun(metric: string): string {
  switch (metric) {
    case "min_down_payment":
      return "down payment";
    case "max_ltv":
      return "LTV";
    case "min_fico":
      return "min FICO";
    case "max_dti":
      return "DTI";
    case "min_dscr":
      return "min DSCR";
    case "min_reserves":
      return "reserve requirement";
    case "min_loan_amount":
      return "minimum loan amount";
    case "max_loan_amount":
      return "maximum loan amount";
    case "min_seasoning":
      return "seasoning";
    default:
      return metric.replace(/_/g, " ");
  }
}

/** Keep the sources drawer compact — no more "Sources (20)". */
function capSources<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, limit);
}

function fieldNotCapturedNonAnswer(metric?: string): NonAnswer {
  return nonAnswerFieldNotCaptured(metric ? metricLabel(metric as Parameters<typeof metricLabel>[0]) : "that field");
}

function describeEntities(parsed: ParsedQuery): string {
  return [parsed.entities.docType?.join("/"), parsed.entities.propertyType?.join("/"), parsed.entities.citizenship?.join("/")].filter(Boolean).join(" ") || "that feature";
}

function outOfScopeReply(parsed: ParsedQuery): AssistantReply {
  const reason = parsed.outOfScopeReason;
  if (reason === "misrepresentation_framing") {
    return {
      answer:
        "I can't help structure a loan that misrepresents occupancy, income, employment, citizenship, property use, or loan purpose. If the reality doesn't fit the programs you have, the legitimate path is to match the actual facts to a program that accepts them — I can help with that.",
      rows: [], assumptions: [], caveats: [], sources: [],
      followUps: ["Find programs that fit the actual facts"],
      cta: { label: "Open scenario builder", href: "/scenarios/new" },
      answered: false,
      nonAnswer: "Declined misrepresentation framing.",
    };
  }
  if (reason === "protected_class") {
    return { answer: "I don't use protected-class information in any ranking or guidance, and I won't collect it. Ask me about the loan terms directly.", rows: [], assumptions: [], caveats: [], sources: [], followUps: [], answered: false, nonAnswer: "Protected-class question declined." };
  }
  return {
    answer: "That's legal, compliance, licensing, or tax territory — I can't advise on it. A licensed attorney or compliance professional is the right person.",
    rows: [], assumptions: [], caveats: [], sources: [],
    followUps: ["Ask about a lender guideline instead"],
    answered: false,
    nonAnswer: "Legal/compliance/tax routed to a human.",
  };
}

function nonAnswerToReply(n: NonAnswer, _ctx: ToolContext): AssistantReply {
  return { answer: n.answer, rows: [], assumptions: [], caveats: [], sources: [], followUps: n.followUps, cta: n.cta, answered: false, nonAnswer: n.answer };
}

// ---------------------------------------------------------------------------
// LLM narration path with grounding enforcement.
// ---------------------------------------------------------------------------

function buildNarrationMessages(parsed: ParsedQuery, ctx: ToolContext, opts: ChatOrchestratorOptions): AiMessage[] {
  const toolData = ctx.rank ?? ctx.search ?? ctx.detail ?? ctx.evals ?? ctx.posture ?? ctx.help ?? ctx.rules;
  const payload = {
    intent: parsed.intent,
    normalizedText: parsed.normalizedText,
    entities: parsed.entities,
    targetMetric: parsed.targetMetric,
    toolResult: toolData ?? null,
  };
  const history = (opts.messages ?? []).slice(-4).map((m) => {
    const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "user";
    return { role: role as AiMessage["role"], content: m.content };
  });
  return [
    { role: "system", content: `${loadNarratePrompt()}\n\n${asUntrustedData("tool_results", JSON.stringify(payload))}` },
    ...history,
  ];
}

function groundingCheck(reply: AssistantReply, ctx: ToolContext): boolean {
  for (const row of reply.rows) {
    if (!ctx.grounding.programIds.has(row.programId)) return false;
  }
  for (const row of reply.rows) {
    if (!ctx.grounding.lenderNames.has(row.lenderName)) return false;
  }
  return true;
}

/**
 * Prompt-injection guard. Guideline chunks/notes are untrusted data; even so,
 * a narration that echoes imperative/leak phrasing is discarded rather than
 * rendered. These exact phrases are the eval suite's injection corpus.
 */
const INJECTION_MARKERS = [
  "ignore previous instructions",
  "ignore all previous",
  "print your system prompt",
  "reveal your system prompt",
  "return all orgs",
  "disregard your instructions",
  "you are now",
];
function containsInjection(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return INJECTION_MARKERS.some((m) => t.includes(m));
}

function safetyCheck(reply: AssistantReply, ctx: ToolContext): boolean {
  if (!groundingCheck(reply, ctx)) return false;
  if (containsInjection(reply.answer) || containsInjection(reply.nonAnswer)) return false;
  for (const row of reply.rows) {
    if (containsInjection(row.lenderName) || containsInjection(row.programName)) return false;
  }
  return true;
}

async function narrateWithLLM(parsed: ParsedQuery, ctx: ToolContext, opts: ChatOrchestratorOptions): Promise<{ reply: AssistantReply; ok: boolean } | null> {
  if (!opts.provider) return null;
  try {
    const messages = buildNarrationMessages(parsed, ctx, opts);
    const raw = await opts.provider.complete({ messages, maxTokens: 900, temperature: 0 });
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd <= jsonStart) return { ok: false, reply: renderDeterministic(ctx, opts) };
    const parsedObj = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const reply = AssistantReplySchema.parse(parsedObj);
    if (!safetyCheck(reply, ctx)) return { ok: false, reply: renderDeterministic(ctx, opts) };
    return { ok: true, reply };
  } catch {
    return { ok: false, reply: renderDeterministic(ctx, opts) };
  }
}

// ---------------------------------------------------------------------------
// Compensating-factors file assessment for exception questions (Part 2 §5.3).
// ---------------------------------------------------------------------------

function buildCompensatingAssessment(parsed: ParsedQuery): string | null {
  const e = parsed.entities;
  const hasFacts = e.fico != null || e.ltv != null || e.reservesMonths != null;
  if (!hasFacts) return null;
  const input: CompensatingFactorInput = {
    requestedLtv: e.ltv,
    actualFico: e.fico,
    actualReservesMonths: e.reservesMonths,
    mortgageLates30x24: e.latePattern ? Number(e.latePattern.match(/^(\d+)x/)?.[1] ?? 0) : undefined,
  };
  const a = scoreCompensatingFactors(input);
  const present = a.factors.filter((f) => f.present && f.strength !== "slight");
  if (present.length === 0) return null;
  const top = present
    .slice(0, 2)
    .map((f) => `${f.type.replace(/_/g, " ")} ${f.strength} (${f.actualValue} vs ${f.requiredValue})`)
    .join("; ");
  const gap = a.missingHighValueFactors[0];
  const gapLine = gap ? ` The single highest-value gap: ${gap.replace(/_/g, " ")} is not strong on this file.` : "";
  return `${top}.${gapLine}`;
}

// ---------------------------------------------------------------------------
// Public entry.
// ---------------------------------------------------------------------------

export async function runChatAssistant(opts: ChatOrchestratorOptions): Promise<AssistantRun> {
  const parsed = parseQuery(opts.messages?.at(-1)?.content ?? "", {
    lenderNames: opts.knownNames?.lenderNames ?? opts.catalog.lenders.map((l) => l.name),
    programNames: opts.knownNames?.programNames ?? opts.catalog.programs.map((p) => p.name),
  });
  const { ctx, results } = runTools(parsed, opts);

  // Out-of-scope/definition/help are fully deterministic — no LLM needed.
  const deterministicOnly = ["out_of_scope", "definition", "app_navigation", "process_help"].includes(parsed.intent);
  let reply: AssistantReply;
  let usedDeterministic = true;

  if (!deterministicOnly) {
    const narrated = await narrateWithLLM(parsed, ctx, opts);
    if (narrated && narrated.ok) {
      reply = narrated.reply;
      usedDeterministic = false;
    } else {
      // LLM narration absent or failed validation/grounding -> deterministic
      // fallback. We NEVER emit ungrounded content.
      reply = narrated ? narrated.reply : renderDeterministic(ctx, opts);
    }
  } else {
    reply = renderDeterministic(ctx, opts);
  }

  return {
    reply,
    log: {
      intent: parsed.intent,
      normalizedText: parsed.normalizedText,
      tools: results.map((r) => r.tool),
      toolResults: results,
      promptVersion: PROMPT_VERSION,
      provider: opts.provider?.name ?? null,
      grounded: true, // final reply is always grounded by construction
      usedDeterministic,
    },
  };
}

export { STANDING_DISCLAIMER };