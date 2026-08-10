import type { ProgramCatalog } from "../analyze";
import { scoreCompensatingFactors, type CompensatingFactorAssessment, type CompensatingScenarioFacts, type ProgramRequirementSnapshot } from "../compensatingFactors";
import {
  EDITORIAL_DISCLAIMER,
  isProfileStale,
  profilesByPosture,
  type GuidelinePosture,
  type LenderFlexibilityProfile,
} from "../lenderPosture";
import { quickEvaluate } from "./tools";
import type { ParsedEntities } from "./types";

/**
 * Chatbot tools for the lender-posture / exception-guidance layer
 * (Part 2, §5.2). Every result that carries posture data is tagged
 * `sourceType: 'editorial'` so the answer renderer applies the editorial
 * label automatically — editorial rows can never be cited as a guideline
 * source, and nothing here feeds eligibility or match scoring.
 */

export interface PostureRow {
  canonicalName: string;
  posture: GuidelinePosture;
  postureNotes: string;
  pricingTendency: LenderFlexibilityProfile["pricingTendency"];
  exceptionsConsidered: boolean;
  exceptionChannel?: string;
  lastReviewedAt: string | null;
  isStale: boolean;
  confidence: LenderFlexibilityProfile["confidence"];
}

export interface LenderPostureResult {
  tool: "get_lender_posture";
  sourceType: "editorial";
  disclaimer: string;
  rows: PostureRow[];
}

export function getLenderPosture(
  profiles: LenderFlexibilityProfile[],
  filters?: { posture?: GuidelinePosture; names?: string[] },
  asOf: Date = new Date()
): LenderPostureResult {
  let selected = profiles;
  if (filters?.posture) selected = profilesByPosture(selected, filters.posture);
  if (filters?.names?.length) {
    const wanted = filters.names.map((n) => n.toLowerCase());
    selected = selected.filter((p) =>
      [p.canonicalName, ...p.aliases].some((n) => wanted.some((w) => n.toLowerCase().includes(w) || w.includes(n.toLowerCase())))
    );
  }
  return {
    tool: "get_lender_posture",
    sourceType: "editorial",
    disclaimer: EDITORIAL_DISCLAIMER,
    rows: selected.map((p) => ({
      canonicalName: p.canonicalName,
      posture: p.posture,
      postureNotes: p.postureNotes,
      pricingTendency: p.pricingTendency,
      exceptionsConsidered: p.exceptionsConsidered,
      exceptionChannel: p.exceptionChannel,
      lastReviewedAt: p.lastReviewedAt,
      isStale: isProfileStale(p, asOf),
      confidence: p.confidence,
    })),
  };
}

/** Map chat entities onto the compensating-factors engine's scenario facts.
 * Only volunteered facts are mapped — absent stays absent (never favorable). */
export function entitiesToCompensatingFacts(entities: ParsedEntities): CompensatingScenarioFacts {
  const facts: CompensatingScenarioFacts = {};
  if (entities.ltv != null) facts.requestedLtv = entities.ltv;
  if (entities.reservesMonths != null) facts.actualReservesMonths = entities.reservesMonths;
  if (entities.fico != null) facts.fico = entities.fico;
  if (entities.latePattern != null) {
    if (entities.latePattern.lookbackMonths >= 24) facts.mortgageLates24mo = entities.latePattern.count;
    else facts.mortgageLates12mo = entities.latePattern.count;
  }
  if (entities.selfEmploymentMonths != null) facts.tenureMonths = entities.selfEmploymentMonths;
  return facts;
}

export interface CompensatingFactorsToolResult {
  tool: "score_compensating_factors";
  /** Program whose limits the file was measured against (guideline-side). */
  measuredAgainst?: { lenderName: string; programName: string; isSampleData: boolean };
  assessment: CompensatingFactorAssessment;
  hasAnyDocumentedFact: boolean;
}

/**
 * Runs the deterministic engine against the chat scenario. Program limits
 * come from the best current match in the caller's own catalog (via the
 * real matcher); with no match, generic unknowns are reported rather than
 * assumed.
 */
export function scoreCompensatingFactorsTool(
  catalog: ProgramCatalog,
  entities: ParsedEntities
): CompensatingFactorsToolResult {
  const facts = entitiesToCompensatingFacts(entities);
  const hasAnyDocumentedFact = Object.keys(facts).length > 0;

  let snapshot: ProgramRequirementSnapshot = {};
  let measuredAgainst: CompensatingFactorsToolResult["measuredAgainst"];
  if (hasAnyDocumentedFact) {
    const evaluation = quickEvaluate(catalog, entities, 1).rows[0];
    if (evaluation) {
      snapshot = {
        maxAllowableLtv: evaluation.maxLtv,
        requiredReservesMonths: undefined,
        minFico: undefined,
      };
      const program = catalog.programs.find((p) => p.id === evaluation.citation.programId);
      if (program) {
        snapshot.requiredReservesMonths = program.minReservesMonths;
        snapshot.maxAllowableDti = program.maxDti;
        snapshot.minFico = program.minFico;
        snapshot.minTenureMonths = program.minSelfEmploymentMonths;
      }
      measuredAgainst = {
        lenderName: evaluation.citation.lenderName,
        programName: evaluation.citation.programName,
        isSampleData: evaluation.citation.isSampleData,
      };
    }
  }

  return {
    tool: "score_compensating_factors",
    measuredAgainst,
    assessment: scoreCompensatingFactors(facts, snapshot),
    hasAnyDocumentedFact,
  };
}

export interface ExceptionCandidatesResult {
  tool: "find_exception_candidates";
  sourceType: "editorial";
  disclaimer: string;
  candidates: PostureRow[];
  assessment: CompensatingFactorsToolResult;
}

/** Exception-based lenders (editorial) + what the file has vs needs. */
export function findExceptionCandidates(
  catalog: ProgramCatalog,
  profiles: LenderFlexibilityProfile[],
  entities: ParsedEntities,
  asOf: Date = new Date()
): ExceptionCandidatesResult {
  const posture = getLenderPosture(profiles, { posture: "exception_based" }, asOf);
  return {
    tool: "find_exception_candidates",
    sourceType: "editorial",
    disclaimer: EDITORIAL_DISCLAIMER,
    candidates: posture.rows,
    assessment: scoreCompensatingFactorsTool(catalog, entities),
  };
}
