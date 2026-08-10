/**
 * Deterministic tool layer for the chatbot (Stage B grounding).
 *
 * Every tool operates on the tier-gated, tenant-scoped ProgramCatalog it is
 * GIVEN — the caller (the /api/assistant route) is responsible for loading it
 * under the caller's org + plan. Tools never open their own connection, never
 * bypass RLS, and never return a row the caller's catalog doesn't already
 * contain. Superlatives/thresholds are computed here (min/max + ties),
 * never by an LLM.
 *
 * Guideline text and notes returned by these tools are UNTRUSTED DATA — the
 * prompt layer keeps them in <untrusted_data> delimiters and the orchestrator
 * strips any imperative content before it can act on it.
 */

import type { ProgramCatalog } from "@/domain/analyze";
import type { Program } from "@/domain/types/program";
import { analyzeScenario } from "@/domain/analyze";
import { buildScenarioFromEntities, readMetric, type ProgramFilters } from "./metrics";
import type {
  GroundedToolResult,
  HelpResult,
  MatrixCellResult,
  ParsedEntities,
  ProgramDetailResult,
  ProgramRow,
  QuickEvaluateResult,
  RankResult,
  RulesQueryResult,
  SearchProgramsResult,
  ScenarioDraftResult,
  TargetMetric,
  MetricDirection,
} from "./types";
import { metricLabel } from "./metrics";

function isActiveVerified(p: Program, excludeSample: boolean): boolean {
  if (!p.active) return false;
  if (excludeSample && p.isSampleData) return false;
  return true;
}

function lenderName(catalog: ProgramCatalog, programId: string): { lenderName: string; lenderId: string } {
  const p = catalog.programs.find((x) => x.id === programId);
  const lender = p ? catalog.lenders.find((l) => l.id === p.lenderId) : undefined;
  return { lenderName: lender?.name ?? "(unknown lender)", lenderId: p?.lenderId ?? "" };
}

function toRow(catalog: ProgramCatalog, p: Program, value: number | null, captured: boolean, gating: string[], valueLabel?: string): ProgramRow {
  const { lenderName: ln, lenderId } = lenderName(catalog, p.id);
  return {
    programId: p.id,
    lenderId,
    lenderName: ln,
    programName: p.name,
    isSampleData: p.isSampleData,
    guidelineVersion: p.guidelineVersionLabel,
    effectiveDate: p.effectiveDate,
    lastVerifiedDate: p.lastVerifiedDate,
    sourceCitation: p.sourceCitation,
    value,
    valueLabel,
    gating,
    fieldNotCaptured: !captured,
  };
}

export function applyProgramFilters(catalog: ProgramCatalog, filters: ProgramFilters): Program[] {
  const excludeSample = filters.excludeSample ?? true;
  return catalog.programs.filter((p) => {
    if (!isActiveVerified(p, excludeSample)) return false;
    if (filters.docType?.length && !filters.docType.some((d) => p.incomeDocTypes.includes(d))) return false;
    if (filters.occupancy?.length && !filters.occupancy.some((o) => p.occupancies.includes(o))) return false;
    if (filters.purpose?.length && !filters.purpose.some((pr) => p.loanPurposes.includes(pr))) return false;
    if (filters.propertyType?.length && !filters.propertyType.some((pt) => p.propertyTypes.includes(pt))) return false;
    if (filters.citizenship?.length && !filters.citizenship.some((c) => p.citizenshipEligible.includes(c))) return false;
    if (filters.vesting && !p.vestingEligible.includes(filters.vesting as never)) return false;
    if (filters.features?.length) {
      for (const f of filters.features) {
        const ok =
          (f === "io" && p.interestOnlyAvailable) ||
          (f === "ppp_options" && p.prepaymentPenaltyOptions.length > 0) ||
          (f === "non_warrantable" && p.propertyTypes.includes("non_warrantable_condo")) ||
          (f === "str" && p.strIncomeEligible === true) ||
          (f === "first_time_investor" && p.firstTimeInvestorAllowed !== false) ||
          (f === "first_time_homebuyer" && p.firstTimeHomebuyerAllowed !== false) ||
          (f === "no_ratio" && p.incomeDocTypes.includes("dscr") && p.minDscr == null);
        if (!ok) return false;
      }
    }
    if (filters.sampleOnly && !p.isSampleData) return false;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const lender = catalog.lenders.find((l) => l.id === p.lenderId);
      const hay = `${p.name} ${lender?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Ranked superlative/threshold query — the deterministic extremum.
// ---------------------------------------------------------------------------

export function rankProgramsByMetric(
  catalog: ProgramCatalog,
  metric: TargetMetric,
  direction: MetricDirection,
  filters: ProgramFilters,
  entities: ParsedEntities,
  limit = 5,
): RankResult {
  const matches = applyProgramFilters(catalog, filters);
  const rows: ProgramRow[] = [];
  const fieldNotCapturedAcross: string[] = [];
  let anyCaptured = false;

  for (const p of matches) {
    const r = readMetric(p, metric, entities);
    rows.push(toRow(catalog, p, r.value, r.captured, r.gating));
    if (r.captured && r.value != null) anyCaptured = true;
    else fieldNotCapturedAcross.push(p.id);
  }

  if (!anyCaptured) {
    const sorted = rows.slice(0, limit);
    return {
      metric,
      direction,
      rows: sorted,
      ties: [],
      fieldCaptured: false,
      fieldNotCapturedAcross,
      citation: ranksCitation(catalog, metric),
    };
  }

  const captured = rows.filter((r) => r.value != null);
  captured.sort((a, b) =>
    direction === "min" ? a.value! - b.value! : b.value! - a.value!,
  );
  const top = captured.slice(0, limit);
  const extremum = captured[0]?.value;
  const ties = captured.filter((r) => r.value === extremum).map((r) => r.programId);

  return {
    metric,
    direction,
    rows: top,
    ties,
    fieldCaptured: true,
    fieldNotCapturedAcross,
    citation: ranksCitation(catalog, metric),
  };
}

function ranksCitation(catalog: ProgramCatalog, _metric: TargetMetric): RankResult["citation"] {
  const first = catalog.programs[0];
  return {
    programId: first?.id ?? "",
    lenderId: first ? (catalog.lenders.find((l) => l.id === first.lenderId)?.id ?? "") : "",
    lenderName: first ? (catalog.lenders.find((l) => l.id === first.lenderId)?.name ?? "") : "",
    programName: first?.name ?? "",
    isSampleData: first?.isSampleData ?? false,
    guidelineVersion: first?.guidelineVersionLabel,
    effectiveDate: first?.effectiveDate,
    lastVerifiedDate: first?.lastVerifiedDate,
    sourceCitation: first?.sourceCitation,
  };
}

// ---------------------------------------------------------------------------
// Filtered program search.
// ---------------------------------------------------------------------------

export function searchPrograms(catalog: ProgramCatalog, filters: ProgramFilters, limit = 20): SearchProgramsResult {
  const matches = applyProgramFilters(catalog, filters);
  const rows = matches.slice(0, limit).map((p) => toRow(catalog, p, null, false, [], undefined) as ProgramRow & { matchedOn: string[] });
  return { rows, total: matches.length };
}

// ---------------------------------------------------------------------------
// Program detail (including its structured matrices + rules).
// ---------------------------------------------------------------------------

export function getProgramDetail(catalog: ProgramCatalog, programId: string): ProgramDetailResult | null {
  const p = catalog.programs.find((x) => x.id === programId);
  if (!p) return null;
  const rules = catalog.rules
    .filter((r) => r.programId === programId)
    .map((r) => ({ name: r.name, category: r.category, severity: r.severity, userExplanation: r.userExplanation }));
  const matrix: Record<string, unknown> = {};
  if (p.eligibilityLtvMatrix) matrix.eligibilityLtvMatrix = p.eligibilityLtvMatrix;
  if (p.purposeLtvMatrix) matrix.purposeLtvMatrix = p.purposeLtvMatrix;
  if (p.propertyTypeLtvCaps) matrix.propertyTypeLtvCaps = p.propertyTypeLtvCaps;
  if (p.citizenshipLtvCaps) matrix.citizenshipLtvCaps = p.citizenshipLtvCaps;
  if (p.cashOutLimits) matrix.cashOutLimits = p.cashOutLimits;
  if (p.reserveRules) matrix.reserveRules = p.reserveRules;
  return {
    program: toRow(catalog, p, null, false, [], p.name),
    matrix,
    rules,
  };
}

// ---------------------------------------------------------------------------
// Matrix-cell lookup (LTV/FICO/purpose/property intersection).
// ---------------------------------------------------------------------------

export function lookupMatrixCell(
  catalog: ProgramCatalog,
  programId: string,
  dimensions: { fico?: number; purpose?: string; occupancy?: string; propertyType?: string },
): MatrixCellResult | null {
  const p = catalog.programs.find((x) => x.id === programId);
  if (!p) return null;
  const { lenderName: ln } = lenderName(catalog, programId);
  const scenario = buildScenarioFromEntities(
    {
      fico: dimensions.fico,
      purpose: dimensions.purpose ? ([dimensions.purpose] as ParsedEntities["purpose"]) : undefined,
      occupancy: dimensions.occupancy ? ([dimensions.occupancy] as ParsedEntities["occupancy"]) : undefined,
      propertyType: dimensions.propertyType ? ([dimensions.propertyType] as ParsedEntities["propertyType"]) : undefined,
    },
    catalog.programs[0]?.organizationId,
  );
  // Reuse the exact derivation used by eligibility.
  const maxLtv = deriveMaxLtvOnce(p, scenario);
  return {
    programId,
    programName: p.name,
    lenderName: ln,
    dimensions: dimensions as Record<string, unknown>,
    maxLtv: maxLtv > 0 ? maxLtv : null,
    captured: maxLtv > 0,
  };
}

// local re-import to avoid a circular import concern; deriveMaxLtv is pure
import { deriveMaxLtv } from "@/domain/matching/baseChecks";
function deriveMaxLtvOnce(p: Program, scenario: Parameters<typeof deriveMaxLtv>[0]): number {
  return deriveMaxLtv(scenario, p);
}

// ---------------------------------------------------------------------------
// Structured rule query.
// ---------------------------------------------------------------------------

export function queryRules(
  catalog: ProgramCatalog,
  category: string,
  filters: ProgramFilters = {},
): RulesQueryResult {
  const programIds = new Set(applyProgramFilters(catalog, filters).map((p) => p.id));
  const rows = catalog.rules
    .filter((r) => (r.category.toLowerCase() === category.toLowerCase() || r.category.toLowerCase().includes(category.toLowerCase())))
    .filter((r) => programIds.has(r.programId))
    .map((r) => {
      const { lenderName: ln } = lenderName(catalog, r.programId);
      const p = catalog.programs.find((x) => x.id === r.programId);
      return {
        ruleId: r.id,
        programId: r.programId,
        programName: p?.name ?? "",
        lenderName: ln,
        category: r.category,
        name: r.name,
        severity: r.severity,
        userExplanation: r.userExplanation,
        sourceSection: r.sourceSection,
        verificationStatus: r.verificationStatus,
        isSampleData: p?.isSampleData ?? false,
      };
    });
  return { category, rows };
}

// ---------------------------------------------------------------------------
// Lightweight partial-scenario evaluation — reuses the SAME domain matcher.
// ---------------------------------------------------------------------------

export function quickEvaluate(catalog: ProgramCatalog, entities: ParsedEntities, limit = 5): QuickEvaluateResult[] {
  const scenario = buildScenarioFromEntities(entities, catalog.programs[0]?.organizationId ?? "org_demo");
  const analysis = analyzeScenario(scenario, catalog);
  return analysis.evaluations.slice(0, limit).map((e) => ({
    programId: e.programId,
    programName: e.programName,
    lenderName: e.lenderName,
    status: e.status,
    matchScore: e.matchScore,
    failedRules: e.failedRules.map((f) => ({ userExplanation: f.userExplanation, severity: f.severity })),
    warnings: e.warnings.map((w) => ({ userExplanation: w.userExplanation, severity: w.severity })),
    manualReview: e.manualReviewItems.map((m) => ({ userExplanation: m.userExplanation, severity: m.severity })),
    isSampleData: e.isSampleData,
  }));
}

// ---------------------------------------------------------------------------
// Curated help corpus (product how-to).
// ---------------------------------------------------------------------------

const HELP_CORPUS: HelpResult[] = [
  {
    topic: "P&L upload",
    summary: "Upload a borrower's P&L statement where you attach scenario documents.",
    steps: [
      "Open the scenario (or create one).",
      "Go to the Documents section.",
      "Choose 'P&L statement' as the document type and upload the file.",
      "The P&L itself is the income document — tax returns are not required for P&L-only qualification.",
    ],
    route: "scenario document upload",
    ctaLabel: "Open document upload",
  },
  {
    topic: "Duplicate a scenario",
    summary: "Copy an existing scenario to start a variation without touching the original.",
    steps: [
      "Open the Scenarios list.",
      "Find the scenario you want to copy.",
      "Use the Duplicate action on that row.",
      "Rename the copy and edit what you need to change.",
    ],
    route: "scenarios list",
    ctaLabel: "Open scenarios",
  },
  {
    topic: "Exception submission",
    summary: "Exceptions are handled by the lender's Account Executive, not the platform matrix.",
    steps: [
      "Identify the program and the specific guideline variance you need.",
      "Open the scenario and confirm which rules failed and by how much.",
      "Compile compensating factors (reserves, LTV cushion, DTI, clean housing history).",
      "Reach the lender's AE through the AE contacts directory and submit the exception there.",
    ],
    route: "AE contacts",
    ctaLabel: "View AE contacts",
  },
  {
    topic: "AE contacts",
    summary: "Find the verified Account Executive contact for a lender.",
    steps: ["Open the AE directory from the lender's page.", "Filter by lender or state.", "Contact the listed AE directly."],
    route: "lender directory",
    ctaLabel: "Open lender directory",
  },
  {
    topic: "Fastest to close",
    summary: "Turn times are estimates only when a lender's program records them; otherwise we can't rank it.",
    steps: [
      "If a program has an estimated clearance/CTC range on file, it shows on the program detail.",
      "Otherwise the field is not populated and we won't guess.",
    ],
    route: "program detail",
    ctaLabel: "View program detail",
  },
];

export function searchHelp(query: string): HelpResult[] {
  const q = query.toLowerCase();
  const scored = HELP_CORPUS.map((h) => {
    const hay = `${h.topic} ${h.summary} ${h.steps.join(" ")}`.toLowerCase();
    let score = 0;
    for (const kw of q.split(/\s+/)) {
      if (kw.length < 3) continue;
      if (hay.includes(kw)) score += 1;
    }
    return { h, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((x) => x.h);
}

// ---------------------------------------------------------------------------
// Scenario draft deep link.
// ---------------------------------------------------------------------------

export function createScenarioDraft(entities: ParsedEntities, organizationId = "org_demo"): ScenarioDraftResult {
  const scenario = buildScenarioFromEntities(entities, organizationId);
  const params = new URLSearchParams();
  if (scenario.loanPurpose) params.set("purpose", scenario.loanPurpose);
  if (scenario.occupancy) params.set("occupancy", scenario.occupancy);
  if (scenario.propertyType) params.set("propertyType", scenario.propertyType);
  if (scenario.incomeDocType) params.set("incomeDocType", scenario.incomeDocType);
  if (scenario.fico != null) params.set("fico", String(scenario.fico));
  if (scenario.requestedLoanAmount != null) params.set("loanAmount", String(scenario.requestedLoanAmount));
  if (entities.ltv != null) params.set("ltv", String(entities.ltv));
  const deepLink = `/scenarios/new?from=assistant&${params.toString()}`;
  return { scenario, deepLink };
}

/** Wrap a tool's output for injection into the prompt as labeled untrusted data. */
export function toGroundedResult(tool: string, sourceType: GroundedToolResult["sourceType"], args: Record<string, unknown>, data: unknown): GroundedToolResult {
  const programIds = new Set<string>();
  const collect = (rows: unknown): void => {
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r && typeof r === "object" && "programId" in (r as Record<string, unknown>)) {
          programIds.add(String((r as Record<string, unknown>).programId));
        }
      }
    } else if (rows && typeof rows === "object") {
      const o = rows as Record<string, unknown>;
      if (typeof o.programId === "string") programIds.add(o.programId);
      if (typeof o.id === "string") programIds.add(o.id);
    }
  };
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.rows)) collect(d.rows);
    else if (Array.isArray(d)) collect(d);
    else if (d.program) collect(d.program); // get_program_detail: program ref
    else collect(d); // single object with programId
  }
  return { tool, sourceType, args, data, rowCount: Array.isArray(data) ? data.length : 0, programIds: [...programIds] };
}

export { metricLabel };