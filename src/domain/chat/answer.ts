import type { ProgramCatalog } from "../analyze";
import { SAMPLE_DATA_LABEL } from "../types/enums";
import {
  EDITORIAL_DISCLAIMER,
  POSTURE_LABELS,
  PRICING_TENDENCY_EXPLAINER,
  findMentionedProfiles,
  resolvePostureProfile,
  type GuidelinePosture,
  type LenderFlexibilityProfile,
} from "../lenderPosture";
import { COLLOQUIAL_NOTES } from "./normalizationDictionary";
import { findExceptionCandidates } from "./postureTools";
import {
  createScenarioDraftLink,
  defineTerm,
  quickEvaluate,
  rankProgramsByMetric,
  searchHelp,
  searchPrograms,
  type ProgramCitation,
  type ProgramFilters,
  type RankedProgramRow,
} from "./tools";
import type { ParsedQuery, TargetMetric } from "./types";

/**
 * Answer contract (spec §4) — every chatbot reply is this structured object,
 * rendered by the UI as real components, never trusted free-form prose.
 *
 * This composer is DETERMINISTIC: it routes the ParsedQuery to the tool
 * layer and builds the answer entirely from tool output, so every factual
 * claim is grounded by construction. An optional LLM pass may rephrase the
 * `answer` prose only (see src/lib/ai/chatPipeline.ts), and its output is
 * discarded unless it survives a grounding check against these rows.
 */

export interface AnswerRow {
  lenderName: string;
  programName: string;
  programId: string;
  /** The value asked about, formatted ("15% down (85% LTV)", "$100,000"). */
  value?: string;
  gatingConditions: string[];
  guidelineVersion: string;
  effectiveDate: string;
  isSampleData: boolean;
  caveats: string[];
  /** Editorial posture sidenote — display only, NEVER an eligibility input,
   * never rendered inside a guideline citation. Absent = no profile on
   * record → no badge, no inference. */
  posture?: GuidelinePosture;
  postureLabel?: string;
  /** "editorial" rows come from the posture layer, carry no guideline
   * citation, and are excluded from the sources drawer. */
  sourceType?: "editorial" | "guideline";
}

export interface AnswerSource {
  lenderName: string;
  programName: string;
  guidelineVersion: string;
  effectiveDate: string;
  lastVerifiedDate?: string;
  sourceCitation: string;
}

export interface ToolActivity {
  tool: string;
  rowCount: number;
}

export interface ChatAnswer {
  /** Direct answer, first line, one or two sentences. */
  answer: string;
  /** false = an explicit, useful non-answer (also a success case). */
  answered: boolean;
  rows: AnswerRow[];
  assumptions: string[];
  /** Includes "what would change the answer" lines. */
  caveats: string[];
  sources: AnswerSource[];
  followUps: string[];
  cta?: { label: string; url: string };
  /** At most one — only when the answer genuinely flips on it. */
  clarifyingQuestion?: string;
  toolActivity: ToolActivity[];
}

// ── Formatting helpers ──────────────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMetricValue(metric: TargetMetric, value: number): string {
  switch (metric) {
    case "min_down_payment":
      return `${value}% down (${Math.round((100 - value) * 100) / 100}% LTV)`;
    case "max_ltv":
      return `${value}% LTV`;
    case "min_fico":
      return value === 0 ? "No U.S. FICO required" : `${value} FICO`;
    case "max_dti":
      return `${value}% DTI`;
    case "min_dscr":
      return `DSCR ${value.toFixed(2)}`;
    case "min_reserves":
      return `${value} months reserves`;
    case "min_loan_amount":
    case "max_loan_amount":
      return USD.format(value);
    case "min_seasoning":
      return `${value} months`;
  }
}

const METRIC_LABELS: Record<TargetMetric, string> = {
  min_down_payment: "down payment",
  max_ltv: "LTV",
  min_fico: "FICO floor",
  max_dti: "DTI ceiling",
  min_dscr: "DSCR floor",
  min_reserves: "reserve requirement",
  min_loan_amount: "minimum loan amount",
  max_loan_amount: "maximum loan amount",
  min_seasoning: "seasoning",
};

function toAnswerRow(r: RankedProgramRow, metric: TargetMetric): AnswerRow {
  return {
    lenderName: r.lenderName,
    programName: r.programName,
    programId: r.programId,
    value: formatMetricValue(metric, r.value),
    gatingConditions: r.gatingConditions,
    guidelineVersion: r.guidelineVersion,
    effectiveDate: r.effectiveDate,
    isSampleData: r.isSampleData,
    caveats: r.caveats,
  };
}

function toSource(c: ProgramCitation): AnswerSource {
  return {
    lenderName: c.lenderName,
    programName: c.programName,
    guidelineVersion: c.guidelineVersion,
    effectiveDate: c.effectiveDate,
    lastVerifiedDate: c.lastVerifiedDate,
    sourceCitation: c.sourceCitation,
  };
}

function label(c: { lenderName: string; programName: string; isSampleData: boolean }): string {
  return `${c.lenderName} — ${c.programName}${c.isSampleData ? " (sample)" : ""}`;
}

function filtersFromEntities(q: ParsedQuery): ProgramFilters {
  const e = q.entities;
  return {
    docType: e.docType,
    citizenship: e.citizenship,
    occupancy: e.occupancy,
    purpose: e.purpose,
    propertyType: e.propertyType,
    vesting: e.vesting,
    state: e.state,
    fico: e.fico,
    loanAmount: e.loanAmount,
    features: e.features?.filter((f) => f !== "stated"),
    lenderNames: e.lenderNames,
    latePattern: e.latePattern,
    selfEmploymentMonths: e.selfEmploymentMonths,
    creditEvents: e.creditEvents,
  };
}

function emptyAnswer(answer: string, activity: ToolActivity[]): ChatAnswer {
  return { answer, answered: false, rows: [], assumptions: [], caveats: [], sources: [], followUps: [], toolActivity: activity };
}

export interface ComposeOptions {
  /** The org's effective posture directory (seed + org overrides). Editorial
   * display context only — never an eligibility input. */
  postureProfiles?: LenderFlexibilityProfile[];
  asOf?: Date;
}

/** Standing entry point: deterministic Stage B composition. */
export function composeAnswer(q: ParsedQuery, catalog: ProgramCatalog, opts: ComposeOptions = {}): ChatAnswer {
  const answer = composeCore(q, catalog, opts);
  return decorateWithPosture(answer, opts.postureProfiles ?? []);
}

function composeCore(q: ParsedQuery, catalog: ProgramCatalog, opts: ComposeOptions): ChatAnswer {
  switch (q.intent) {
    case "superlative_lookup":
    case "threshold_lookup":
      return composeRanked(q, catalog);
    case "availability_lookup":
      return composeAvailability(q, catalog);
    case "scenario_triage":
      return composeTriage(q, catalog);
    case "program_detail":
    case "comparison":
      return composeLenderFacts(q, catalog, opts);
    case "process_help":
      return composeProcessHelp(q, catalog);
    case "exception_guidance":
      return composeExceptionGuidance(q, catalog, opts);
    case "definition":
      return composeDefinition(q);
    case "app_navigation":
      return composeNavigation(q);
    case "out_of_scope":
      return composeOutOfScope(q, opts);
  }
}

/** Attach posture sidenote badges to guideline rows where a profile exists.
 * No profile on record → no badge, no inference (silence, not a guess).
 * Adds the editorial disclaimer once when any badge was applied. */
function decorateWithPosture(answer: ChatAnswer, profiles: LenderFlexibilityProfile[]): ChatAnswer {
  if (profiles.length === 0 || answer.rows.length === 0) return answer;
  let any = false;
  const rows = answer.rows.map((row) => {
    if (row.sourceType === "editorial" || row.posture) return row; // already posture-carrying
    const profile = resolvePostureProfile(row.lenderName, profiles);
    if (!profile) return row;
    any = true;
    return { ...row, posture: profile.posture, postureLabel: POSTURE_LABELS[profile.posture] };
  });
  if (!any) return answer;
  const caveats = answer.caveats.includes(EDITORIAL_DISCLAIMER) ? answer.caveats : [...answer.caveats, `Posture badges: ${EDITORIAL_DISCLAIMER}`];
  return { ...answer, rows, caveats };
}

// ── Ranked (superlative / threshold) ────────────────────────────────────────

function composeRanked(q: ParsedQuery, catalog: ProgramCatalog): ChatAnswer {
  const metric = q.targetMetric ?? "max_ltv";
  const direction = q.direction ?? (metric.startsWith("max") ? "max" : "min");
  const filters = filtersFromEntities(q);
  const res = rankProgramsByMetric(catalog, metric, direction, filters);
  const activity: ToolActivity[] = [{ tool: res.tool, rowCount: res.rows.length }];

  if (res.rows.length === 0) {
    const why =
      res.totalConsidered === 0
        ? "No program in your library matches those criteria."
        : `Your library doesn't capture ${METRIC_LABELS[metric]} for the ${res.totalConsidered} matching program${res.totalConsidered === 1 ? "" : "s"}, so I can't rank it.`;
    const nonAnswer = emptyAnswer(why, activity);
    if (res.unpopulated.length > 0) {
      nonAnswer.caveats.push(
        `Matching programs with this field unpopulated: ${res.unpopulated.map((u) => label(u)).join("; ")}.`
      );
      nonAnswer.sources.push(...res.unpopulated.map(toSource));
    }
    nonAnswer.followUps.push("Run a full scenario instead");
    nonAnswer.cta = { label: "Run a full scenario", url: createScenarioDraftLink(q.entities).url };
    return nonAnswer;
  }

  const best = res.rows[0]!;
  const tieNames = res.tieSet.map((r) => label(r));
  const scopeBits = [
    q.entities.docType?.length ? q.entities.docType.join("/").replace(/_/g, " ") : null,
    q.entities.purpose?.length ? q.entities.purpose.join("/").replace(/_/g, " ") : null,
  ].filter(Boolean);
  const scope = scopeBits.length ? ` for ${scopeBits.join(", ")}` : "";

  const superlativeWord = direction === "min" ? "Lowest" : "Highest";
  let answer: string;
  if (res.tieSet.length > 1) {
    answer = `${superlativeWord} ${METRIC_LABELS[metric]}${scope} in your library is ${formatMetricValue(metric, best.value)} — a tie between ${tieNames.join(" and ")}.`;
  } else {
    answer = `${superlativeWord} ${METRIC_LABELS[metric]}${scope} in your library is ${formatMetricValue(metric, best.value)} — ${label(best)}.`;
    if (best.gatingConditions.length) answer += ` Requires ${best.gatingConditions.join(", ")}.`;
  }

  const out: ChatAnswer = {
    answer,
    answered: true,
    rows: res.rows.map((r) => toAnswerRow(r, metric)),
    assumptions: [],
    caveats: [],
    sources: res.rows.map(toSource),
    followUps: [],
    toolActivity: activity,
    cta: { label: "Run a full scenario", url: createScenarioDraftLink(q.entities).url },
  };

  // Assumptions actually made by the projection
  if ((metric === "max_ltv" || metric === "min_down_payment") && !q.entities.purpose?.length) {
    out.assumptions.push("Assumes purchase unless stated otherwise.");
  }
  if ((metric === "max_ltv" || metric === "min_down_payment") && !q.entities.fico) {
    out.assumptions.push("Assumes the borrower qualifies for each program's best documented FICO tier — the tier FICO is listed per row.");
  }

  // What would change the answer: recompute best case under cash-out when no
  // purpose was stated for a leverage question.
  if ((metric === "max_ltv" || metric === "min_down_payment") && !q.entities.purpose?.length) {
    const cashOut = rankProgramsByMetric(catalog, metric, direction, { ...filters, purpose: ["cash_out_refinance"] });
    activity.push({ tool: "rank_programs_by_metric", rowCount: cashOut.rows.length });
    const coBest = cashOut.rows[0];
    if (coBest && coBest.value !== best.value) {
      out.caveats.push(`A cash-out request changes the best case to ${formatMetricValue(metric, coBest.value)} (${label(coBest)}).`);
    }
  }

  if (res.unpopulated.length > 0) {
    out.caveats.push(
      `Not rankable (field unpopulated): ${res.unpopulated.map((u) => `${label(u)} — ${u.reason}`).join("; ")}.`
    );
  }
  if (res.rows.some((r) => r.isSampleData)) {
    out.caveats.push(SAMPLE_DATA_LABEL);
  }

  out.followUps.push(
    ...(q.entities.purpose?.length ? [] : ["What about a cash-out?"]),
    ...(q.entities.fico ? [] : ["Filter to a specific FICO"]),
    `View ${best.programName}`
  );
  return out;
}

// ── Availability ────────────────────────────────────────────────────────────

function composeAvailability(q: ParsedQuery, catalog: ProgramCatalog): ChatAnswer {
  const filters = filtersFromEntities(q);
  const res = searchPrograms(catalog, filters);
  const activity: ToolActivity[] = [{ tool: res.tool, rowCount: res.rows.length }];

  // Exception-appetite questions get the honest structured-field treatment.
  const isExceptionQuestion = q.entities.features?.includes("exceptions") ?? false;

  const assumptions: string[] = [];
  if (q.entities.features?.includes("stated")) {
    const note = COLLOQUIAL_NOTES["stated"];
    if (note) assumptions.push(note);
  }
  if (q.entities.creditEvents?.includes("bk7") && !/bk7|chapter 7/.test(q.normalizedText)) {
    assumptions.push("Interpreted the unqualified bankruptcy mention as Chapter 7 discharge; say BK13 if it's a Chapter 13.");
  }

  if (res.rows.length === 0 && res.unconfirmedRows.length === 0) {
    const nonAnswer = emptyAnswer("No program in your library supports that combination.", activity);
    nonAnswer.assumptions = assumptions;
    nonAnswer.followUps.push("Run a full scenario", "Ask about a related program type");
    nonAnswer.cta = { label: "Run a full scenario", url: createScenarioDraftLink(q.entities).url };
    return nonAnswer;
  }

  if (res.rows.length === 0 && res.unconfirmedRows.length > 0) {
    const names = res.unconfirmedRows.map((r) => label(r)).join("; ");
    const reason = res.unconfirmedRows[0]!.caveats[0] ?? "a required field isn't captured";
    const out = emptyAnswer(
      `I can't confirm this from your library: ${reason.toLowerCase()}. Candidates that match everything else: ${names}.`,
      activity
    );
    out.assumptions = assumptions;
    out.rows = res.unconfirmedRows.map((r) => ({
      lenderName: r.lenderName,
      programName: r.programName,
      programId: r.programId,
      gatingConditions: [],
      guidelineVersion: r.guidelineVersion,
      effectiveDate: r.effectiveDate,
      isSampleData: r.isSampleData,
      caveats: r.caveats,
    }));
    out.sources = res.unconfirmedRows.map(toSource);
    out.caveats.push("Confirm with the lender's AE or ask an admin to capture this field.");
    if (res.unconfirmedRows.some((r) => r.isSampleData)) out.caveats.push(SAMPLE_DATA_LABEL);
    return out;
  }

  const names = res.rows.map((r) => label(r));
  let answer: string;
  if (isExceptionQuestion) {
    const documented = res.rows.filter((r) => {
      const policy = r.matchedAttributes["exceptionPolicy"] as { type?: string } | null;
      return policy?.type === "documented_program";
    });
    const caseByCase = res.rows.filter((r) => {
      const policy = r.matchedAttributes["exceptionPolicy"] as { type?: string } | null;
      return policy?.type === "case_by_case";
    });
    if (documented.length === 0 && caseByCase.length === 0) {
      const out = emptyAnswer(
        "Exception appetite isn't captured as a structured field for any matching program yet, so I can't rank it. Exceptions always run through the lender's AE, not the matrix.",
        activity
      );
      out.assumptions = assumptions;
      if (res.unconfirmedRows.length > 0) {
        out.caveats.push(`Programs without a captured exception policy: ${res.unconfirmedRows.map((r) => label(r)).join("; ")}.`);
      }
      out.followUps.push("View AE contacts", "Ask an admin to enable exception tracking");
      out.cta = { label: "View AE contacts", url: "/ae" };
      return out;
    }
    const parts: string[] = [];
    if (documented.length) parts.push(`documented manual-review paths: ${documented.map((r) => label(r)).join("; ")}`);
    if (caseByCase.length) parts.push(`case-by-case exception review: ${caseByCase.map((r) => label(r)).join("; ")}`);
    answer = `${documented.length + caseByCase.length} program${documented.length + caseByCase.length === 1 ? " has" : "s have"} a captured exception policy — ${parts.join("; ")}. Exceptions run through the AE, not the matrix.`;
  } else {
    answer =
      res.rows.length === 1
        ? `One program in your library supports this: ${names[0]}.`
        : `${res.rows.length} programs in your library support this: ${names.slice(0, 5).join("; ")}${res.rows.length > 5 ? `; and ${res.rows.length - 5} more` : ""}.`;
  }

  const out: ChatAnswer = {
    answer,
    answered: true,
    rows: res.rows.map((r) => ({
      lenderName: r.lenderName,
      programName: r.programName,
      programId: r.programId,
      value: undefined,
      gatingConditions: [
        ...(typeof r.matchedAttributes["minFico"] === "number" && (r.matchedAttributes["minFico"] as number) > 0
          ? [`${r.matchedAttributes["minFico"]}+ FICO`]
          : []),
        ...(typeof r.matchedAttributes["baseMaxLtv"] === "number" ? [`up to ${r.matchedAttributes["baseMaxLtv"]}% LTV`] : []),
      ],
      guidelineVersion: r.guidelineVersion,
      effectiveDate: r.effectiveDate,
      isSampleData: r.isSampleData,
      caveats: r.caveats,
    })),
    assumptions,
    caveats: [],
    sources: res.rows.map(toSource),
    followUps: [],
    toolActivity: activity,
    cta: { label: "Run a full scenario", url: createScenarioDraftLink(q.entities).url },
  };

  if (res.unconfirmedRows.length > 0) {
    out.caveats.push(
      `Can't confirm either way (field unpopulated): ${res.unconfirmedRows.map((r) => `${label(r)} — ${r.caveats[0] ?? "not captured"}`).join("; ")}.`
    );
  }
  if (res.rows.some((r) => r.isSampleData)) out.caveats.push(SAMPLE_DATA_LABEL);
  out.followUps.push("Compare max LTV across these", "Run a full scenario");
  return out;
}

// ── Scenario triage ─────────────────────────────────────────────────────────

function composeTriage(q: ParsedQuery, catalog: ProgramCatalog): ChatAnswer {
  const res = quickEvaluate(catalog, q.entities);
  const activity: ToolActivity[] = [{ tool: res.tool, rowCount: res.rows.length }];

  const clarifying =
    q.missingCriticalFields.includes("latePattern")
      ? "Was it a 1x30, 2x30, or a 60-day late — and how many months ago? Severity and timing change which lenders work."
      : undefined;

  if (res.rows.length === 0) {
    const out = emptyAnswer(
      "Nothing in your library clears those facts as stated. That doesn't always kill the file — a restructure (lower LTV, different doc type) can change it.",
      activity
    );
    out.assumptions.push(res.assumptionNote);
    out.clarifyingQuestion = clarifying;
    out.followUps.push("Run the full scenario with complete facts");
    out.cta = { label: "Run full scenario", url: createScenarioDraftLink(q.entities).url };
    return out;
  }

  const names = res.rows.map((r) => label(r.citation));
  const out: ChatAnswer = {
    answer: `${res.rows.length} program${res.rows.length === 1 ? "" : "s"} in your library ${res.rows.length === 1 ? "clears" : "clear"} the stated facts: ${names.slice(0, 3).join("; ")}${res.rows.length > 3 ? "; …" : ""}. This is a preliminary read, not the full analysis.`,
    answered: true,
    rows: res.rows.map((r) => ({
      lenderName: r.citation.lenderName,
      programName: r.citation.programName,
      programId: r.citation.programId,
      value: r.maxLtv != null ? `up to ${r.maxLtv}% LTV` : undefined,
      gatingConditions: r.manualReviewItems.slice(0, 2),
      guidelineVersion: r.citation.guidelineVersion,
      effectiveDate: r.citation.effectiveDate,
      isSampleData: r.citation.isSampleData,
      caveats: r.status === "manual_review" ? ["Needs manual review"] : r.status === "conditional" ? ["Conditional"] : [],
    })),
    assumptions: [res.assumptionNote],
    caveats: [],
    sources: res.rows.map((r) => toSource(r.citation)),
    followUps: ["Run the full scenario", "Adjust LTV or doc type"],
    toolActivity: activity,
    clarifyingQuestion: clarifying,
    cta: { label: "Run full scenario (prefilled)", url: createScenarioDraftLink(q.entities).url },
  };
  if (res.rows.some((r) => r.citation.isSampleData)) out.caveats.push(SAMPLE_DATA_LABEL);
  return out;
}

// ── Program detail / comparison ─────────────────────────────────────────────

function composeLenderFacts(q: ParsedQuery, catalog: ProgramCatalog, opts: ComposeOptions = {}): ChatAnswer {
  const lenderNames = q.entities.lenderNames ?? [];
  if (q.entities.unknownLenderName) {
    const out = emptyAnswer(
      `${q.entities.unknownLenderName} isn't in your library — its guidelines aren't loaded yet, so I can't quote them.${
        lenderNames.length > 0 ? ` I can tell you about ${lenderNames.join(" and ")}.` : ""
      }`,
      []
    );
    // A REAL lender with no verified guidelines can still carry a posture
    // note — clearly editorial, never a stand-in for guideline facts.
    const profile = resolvePostureProfile(q.entities.unknownLenderName, opts.postureProfiles ?? []);
    if (profile) {
      out.caveats.push(
        `Posture note (editorial): ${profile.canonicalName} is flagged "${POSTURE_LABELS[profile.posture]}" — ${profile.postureNotes} ${EDITORIAL_DISCLAIMER} Last reviewed: ${profile.lastReviewedAt ?? "never"}.`
      );
    }
    out.followUps.push(...(lenderNames.length > 0 ? [`Just ${lenderNames[0]}`] : ["Ask about a lender in your library"]), "Run a full scenario");
    return out;
  }
  if (lenderNames.length === 0) {
    if (q.entities.lenderNameSuggestions?.length) {
      const out = emptyAnswer(
        `I don't see that lender in your library — did you mean ${q.entities.lenderNameSuggestions.join(" or ")}?`,
        []
      );
      out.clarifyingQuestion = `Did you mean ${q.entities.lenderNameSuggestions.join(" or ")}?`;
      return out;
    }
    return emptyAnswer("I don't see that lender in your library — it may be outside your current plan tier, or not tracked yet.", []);
  }

  const res = searchPrograms(catalog, { lenderNames }, 20);
  const activity: ToolActivity[] = [{ tool: res.tool, rowCount: res.rows.length }];
  if (res.rows.length === 0) {
    return emptyAnswer(`No active programs found for ${lenderNames.join(" / ")} in your library.`, activity);
  }

  const out: ChatAnswer = {
    answer:
      lenderNames.length > 1
        ? `Side-by-side of ${lenderNames.join(" vs ")} from your library (${res.rows.length} programs).`
        : `${lenderNames[0]} has ${res.rows.length} active program${res.rows.length === 1 ? "" : "s"} in your library.`,
    answered: true,
    rows: res.rows.map((r) => ({
      lenderName: r.lenderName,
      programName: r.programName,
      programId: r.programId,
      value: [
        typeof r.matchedAttributes["baseMaxLtv"] === "number" ? `to ${r.matchedAttributes["baseMaxLtv"]}% LTV` : null,
        typeof r.matchedAttributes["minFico"] === "number" && (r.matchedAttributes["minFico"] as number) > 0 ? `${r.matchedAttributes["minFico"]}+ FICO` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      gatingConditions: (r.matchedAttributes["incomeDocTypes"] as string[]).map((d) => d.replace(/_/g, " ")),
      guidelineVersion: r.guidelineVersion,
      effectiveDate: r.effectiveDate,
      isSampleData: r.isSampleData,
      caveats: r.caveats,
    })),
    assumptions: [],
    caveats: res.rows.some((r) => r.isSampleData) ? [SAMPLE_DATA_LABEL] : [],
    sources: res.rows.map(toSource),
    followUps: ["Compare max LTV", "Run a full scenario"],
    toolActivity: activity,
  };
  return out;
}

// ── Process help ────────────────────────────────────────────────────────────

function composeProcessHelp(q: ParsedQuery, catalog: ProgramCatalog): ChatAnswer {
  // "Who's fastest to close" is a data question about turn-time estimates.
  if (/fastest|turn ?time|how long.*close/.test(q.normalizedText)) {
    const res = searchPrograms(catalog, filtersFromEntities(q), 50);
    const activity: ToolActivity[] = [{ tool: res.tool, rowCount: res.rows.length }];
    const withTimes = res.rows
      .map((r) => ({ row: r, times: r.matchedAttributes["estimatedTurnTimes"] as { clearToCloseDaysMin?: number; clearToCloseDaysMax?: number; lastUpdated: string } | null }))
      .filter((x): x is { row: (typeof res.rows)[number]; times: { clearToCloseDaysMin?: number; clearToCloseDaysMax?: number; lastUpdated: string } } => x.times != null)
      .sort((a, b) => (a.times.clearToCloseDaysMax ?? 99) - (b.times.clearToCloseDaysMax ?? 99));

    if (withTimes.length === 0) {
      const out = emptyAnswer(
        "Turn times aren't captured for any matching program yet, so I can't rank speed. Actual speed depends on file completeness and current lender volume — the AE can quote current turn times.",
        activity
      );
      out.followUps.push("View AE contacts");
      out.cta = { label: "View AE contacts", url: "/ae" };
      return out;
    }
    const best = withTimes[0]!;
    const fmt = (t: { clearToCloseDaysMin?: number; clearToCloseDaysMax?: number }) =>
      t.clearToCloseDaysMin != null && t.clearToCloseDaysMax != null ? `${t.clearToCloseDaysMin}–${t.clearToCloseDaysMax} days to CTC` : "range not fully captured";
    const out: ChatAnswer = {
      answer: `Fastest captured estimate: ${label(best.row)} at ${fmt(best.times)} (estimate, last updated ${best.times.lastUpdated}). Only ${withTimes.length} of ${res.rows.length} matching programs have turn-time estimates on file.`,
      answered: true,
      rows: withTimes.map(({ row, times }) => ({
        lenderName: row.lenderName,
        programName: row.programName,
        programId: row.programId,
        value: fmt(times),
        gatingConditions: [`estimate · updated ${times.lastUpdated}`],
        guidelineVersion: row.guidelineVersion,
        effectiveDate: row.effectiveDate,
        isSampleData: row.isSampleData,
        caveats: [],
      })),
      assumptions: [],
      caveats: [
        "Turn times are estimates, not commitments — actual speed depends on file completeness and lender volume.",
        ...(withTimes.length < res.rows.length
          ? [`${res.rows.length - withTimes.length} matching programs have no turn-time estimate captured.`]
          : []),
        ...(withTimes.some((w) => w.row.isSampleData) ? [SAMPLE_DATA_LABEL] : []),
      ],
      sources: withTimes.map(({ row }) => toSource(row)),
      followUps: ["View AE contacts", "Run a full scenario"],
      toolActivity: activity,
    };
    return out;
  }

  const help = searchHelp(q.normalizedText);
  const activity: ToolActivity[] = [{ tool: help.tool, rowCount: help.entries.length }];
  if (help.entries.length === 0) {
    return emptyAnswer("I don't have a documented process for that — check the user guide, or ask your admin.", activity);
  }
  const entry = help.entries[0]!;
  return {
    answer: `${entry.title}: ${entry.steps.join(" ")}`,
    answered: true,
    rows: [],
    assumptions: [],
    caveats: [],
    sources: [],
    followUps: help.entries.slice(1).map((e) => e.title),
    toolActivity: activity,
    cta: entry.route ? { label: entry.title, url: entry.route } : undefined,
  };
}

// ── Definitions ─────────────────────────────────────────────────────────────

function composeDefinition(q: ParsedQuery): ChatAnswer {
  // A concrete late pattern gets an exact, computed explanation.
  if (q.entities.latePattern) {
    const lp = q.entities.latePattern;
    const plural = lp.count === 1 ? "late" : "lates";
    const answer =
      lp.count === 0
        ? `"${lp.raw}" means a clean housing history — zero ${lp.days}-day mortgage lates in the trailing ${lp.lookbackMonths} months.`
        : `"${lp.raw}" means ${lp.count} ${lp.days}-day mortgage ${plural} in the trailing ${lp.lookbackMonths} months.`;
    return {
      answer,
      answered: true,
      rows: [],
      assumptions: [],
      caveats: [],
      sources: [],
      followUps: ["Which lenders tolerate that history?"],
      toolActivity: [{ tool: "define_term", rowCount: 1 }],
    };
  }

  const res = defineTerm(q.normalizedText);
  if (res.entries.length === 0) {
    return emptyAnswer("That term isn't in my glossary yet — try rephrasing, or ask about a specific program.", [
      { tool: res.tool, rowCount: 0 },
    ]);
  }
  const entry = res.entries[0]!;
  return {
    answer: entry.definition,
    answered: true,
    rows: [],
    assumptions: [],
    caveats: [],
    sources: [],
    followUps: res.entries.slice(1).map((e) => `What is ${e.term}?`),
    toolActivity: [{ tool: res.tool, rowCount: res.entries.length }],
  };
}

// ── App navigation ──────────────────────────────────────────────────────────

function composeNavigation(q: ParsedQuery): ChatAnswer {
  const res = searchHelp(q.normalizedText);
  const activity: ToolActivity[] = [{ tool: res.tool, rowCount: res.entries.length }];
  if (res.entries.length === 0) {
    return emptyAnswer("I don't have that location documented — the user guide covers the full navigation.", activity);
  }
  const entry = res.entries[0]!;
  return {
    answer: `${entry.title}: ${entry.steps.join(" ")}`,
    answered: true,
    rows: [],
    assumptions: [],
    caveats: [],
    sources: [],
    followUps: res.entries.slice(1).map((e) => e.title),
    toolActivity: activity,
    cta: entry.route ? { label: "Take me there", url: entry.route } : undefined,
  };
}

// ── Out of scope / guardrails ───────────────────────────────────────────────

function composeOutOfScope(q: ParsedQuery, opts: ComposeOptions = {}): ChatAnswer {
  switch (q.guardrailFlag) {
    case "misrepresentation":
      return emptyAnswer(
        "I can't help frame a file as something it isn't — occupancy, income, and property use have to be stated as they are. If it's genuinely an investment property, the legitimate route is an investment/DSCR structure; I'm glad to find those options.",
        []
      );
    case "protected_class":
      return emptyAnswer(
        "I can't factor personal characteristics like that into any lending question — eligibility here is only about the loan file (credit, income documentation, property, leverage).",
        []
      );
    case "legal_tax_advice":
      return emptyAnswer(
        "That's a legal/compliance/tax question — I can't advise on it. Your compliance contact or a licensed professional is the right route; I can help with guideline lookups.",
        []
      );
    case "pricing":
      return composePricing(q, opts);
    case "approval":
      return composeApprovalDecline(q, opts);
    default:
      return emptyAnswer(
        "That's outside what I cover — I answer questions about the lenders, programs, and guidelines in your library. Try me on a scenario or a guideline lookup.",
        []
      );
  }
}

/** Pricing questions get the directional guideline-tightness explanation and
 * posture where on record — never a rate, point, or price figure, and never
 * a price ranking (Part 2, §5.4). */
function composePricing(q: ParsedQuery, opts: ComposeOptions): ChatAnswer {
  const profiles = opts.postureProfiles ?? [];
  const mentioned = findMentionedProfiles(q.normalizedText, profiles);
  const out = emptyAnswer(
    `I don't quote or estimate pricing — no rates or figures from me. What I can say directionally: ${PRICING_TENDENCY_EXPLAINER}`,
    []
  );
  for (const profile of mentioned) {
    const tendency =
      profile.pricingTendency === "typically_better_priced"
        ? "typically better priced"
        : profile.pricingTendency === "typically_more_aggressive"
          ? "typically carries a flexibility premium"
          : profile.pricingTendency === "typically_mid"
            ? "typically mid-market"
            : "pricing tendency not on record";
    out.caveats.push(
      `Posture note (editorial): ${profile.canonicalName} is flagged "${POSTURE_LABELS[profile.posture]}" — ${tendency}. ${EDITORIAL_DISCLAIMER} Last reviewed: ${profile.lastReviewedAt ?? "never"}.`
    );
  }
  out.followUps.push("Which lenders fit my scenario?", "Run a full scenario");
  return out;
}

/** Approval predictions are never made — for any lender, real or demo.
 * Named lenders with a posture profile get the editorial note plus the
 * compensating-factors condition; "considers exceptions," never "will
 * approve." */
function composeApprovalDecline(q: ParsedQuery, opts: ComposeOptions): ChatAnswer {
  const out = emptyAnswer(
    "I can't predict whether a lender approves a file — no one can promise that, and I won't. What I can do: run the facts against published guidelines (the full scenario tools), and tell you how strong the file's compensating factors are.",
    []
  );
  const mentioned = findMentionedProfiles(q.normalizedText, opts.postureProfiles ?? []);
  for (const profile of mentioned) {
    out.caveats.push(
      `Posture note (editorial): ${profile.canonicalName} is flagged "${POSTURE_LABELS[profile.posture]}" — it ${profile.exceptionsConsidered ? "considers exceptions through its AE when the file carries compensating factors (reserves beyond the requirement, LTV under the cap, DTI cushion, clean credit/housing history)" : "is not typically exception-driven"}. That is never a commitment. ${EDITORIAL_DISCLAIMER} Last reviewed: ${profile.lastReviewedAt ?? "never"}.`
    );
  }
  out.followUps.push("Run full scenario", "What compensating factors do I have?");
  out.cta = { label: "Run full scenario", url: createScenarioDraftLink(q.entities).url };
  return out;
}

// ── Exception guidance (Part 2, §5.3) ───────────────────────────────────────

const COMPENSATING_CONDITION =
  "None of them grant exceptions on the ask alone — they weigh compensating factors, and the heaviest are reserves well past the requirement (12+ months against a 3- or 6-month minimum is very strong), LTV meaningfully under the cap, a DTI cushion, and clean credit and housing history.";

const EXCEPTION_STANDING_CAVEAT =
  "An exception is discretionary, requires AE or credit-committee review, and pricing may differ from the published matrix.";

/** Three parts, in order, every time: the editorial list, the compensating-
 * factors condition stated as a condition, and — when a scenario is in
 * context — what this file actually has. */
function composeExceptionGuidance(q: ParsedQuery, catalog: ProgramCatalog, opts: ComposeOptions): ChatAnswer {
  const profiles = opts.postureProfiles ?? [];
  const result = findExceptionCandidates(catalog, profiles, q.entities, opts.asOf);
  const activity: ToolActivity[] = [
    { tool: "find_exception_candidates", rowCount: result.candidates.length },
    { tool: "score_compensating_factors", rowCount: result.assessment.assessment.factors.length },
  ];

  if (result.candidates.length === 0) {
    const out = emptyAnswer(
      "No lenders in your library carry an exception-friendly posture profile yet, so I can't rank exception appetite. Exceptions always run through the lender's AE with compensating factors — never guaranteed.",
      activity
    );
    out.followUps.push("View AE contacts", "Ask an admin to maintain lender posture profiles");
    out.cta = { label: "View AE contacts", url: "/ae" };
    return out;
  }

  const names = result.candidates.map((c) => c.canonicalName);
  const namesShort = names.length > 6 ? `${names.slice(0, 6).join(", ")}, and ${names.length - 6} more` : names.join(", ");
  const channels = [...new Set(result.candidates.map((c) => c.exceptionChannel).filter(Boolean))];

  // Part 1 — the list.
  let answer = `${names.length} lender${names.length === 1 ? " is" : "s are"} flagged exception-friendly in your posture profiles — ${namesShort}. Exceptions there run through ${channels.length ? channels.join(" / ") : "the AE"}. `;
  // Part 2 — the condition, stated as a condition, not a footnote.
  answer += COMPENSATING_CONDITION;

  const assumptions: string[] = [];
  const caveats: string[] = [];

  // Part 3 — what this file actually has, when a scenario is in context.
  if (result.assessment.hasAnyDocumentedFact) {
    const a = result.assessment.assessment;
    const present = a.factors.filter((f) => f.present).slice(0, 3);
    const topGap = a.missingHighValueFactors[0];
    const bits: string[] = [];
    for (const f of present) {
      bits.push(`${f.explanation.replace(/\.$/, "")} (${f.strength.replace(/_/g, " ")})`);
    }
    if (bits.length > 0) {
      answer += ` On your current scenario: ${bits.join("; ")}.`;
    } else {
      answer += " On your current scenario, none of the stated facts yet register as a compensating factor.";
    }
    if (topGap) {
      const gapFactor = a.factors.find((f) => f.type === topGap);
      answer += ` The single biggest lift: ${topGap.replace(/_/g, " ")}${gapFactor && gapFactor.actualValue !== "not documented" ? ` (currently ${gapFactor.actualValue})` : " — not documented yet"}.`;
    }
    if (result.assessment.measuredAgainst) {
      assumptions.push(
        `File strength measured against ${result.assessment.measuredAgainst.lenderName} — ${result.assessment.measuredAgainst.programName}${result.assessment.measuredAgainst.isSampleData ? " (sample)" : ""}, the current best match for the stated facts.`
      );
    }
    assumptions.push("The assessment describes file strength only — it is not a likelihood of approval.");
  }

  const stale = result.candidates.filter((c) => c.isStale);
  if (stale.length > 0) {
    caveats.push(
      `Possibly stale profiles (last review older than the review window): ${stale.map((s) => s.canonicalName).join(", ")} — flagged for admin review.`
    );
  }
  const reviewedDates = [...new Set(result.candidates.map((c) => c.lastReviewedAt).filter(Boolean))] as string[];
  caveats.push(`${EDITORIAL_DISCLAIMER} Last reviewed: ${reviewedDates.length ? reviewedDates.join(", ") : "never"}.`);
  caveats.push(EXCEPTION_STANDING_CAVEAT);

  const out: ChatAnswer = {
    answer,
    answered: true,
    rows: result.candidates.map((c) => ({
      lenderName: c.canonicalName,
      programName: "Posture profile",
      programId: `posture:${c.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      value: c.exceptionChannel ? `via ${c.exceptionChannel}` : undefined,
      gatingConditions: ["requires compensating factors"],
      guidelineVersion: "editorial",
      effectiveDate: c.lastReviewedAt ?? "unreviewed",
      isSampleData: false,
      caveats: c.isStale ? ["possibly stale"] : [],
      posture: c.posture,
      postureLabel: POSTURE_LABELS[c.posture],
      sourceType: "editorial" as const,
    })),
    assumptions,
    caveats,
    // Editorial rows are never guideline sources — sources stays empty
    // unless a guideline-side row contributed.
    sources: [],
    followUps: ["Run full scenario", "Draft exception request", "How do I get an exception submitted?"],
    toolActivity: activity,
    clarifyingQuestion: q.missingCriticalFields.includes("latePattern")
      ? "Was it a 1x30, 2x30, or a 60-day late — and how many months ago? Severity and timing change which lenders work."
      : undefined,
    cta: { label: "Run full scenario", url: createScenarioDraftLink(q.entities).url },
  };
  return out;
}
