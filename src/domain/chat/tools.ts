import type { ProgramCatalog } from "../analyze";
import { analyzeScenario } from "../analyze";
import { deriveMaxLtv } from "../matching/baseChecks";
import { selectActiveRules } from "../rules/activeRules";
import type { Citizenship, IncomeDocType, LoanPurpose, Occupancy, PropertyType, Vesting } from "../types/enums";
import { MORTGAGE_LATES_SEVERITY, type MortgageLatesCategory } from "../types/enums";
import type { CreditEventType, Lender, Program, Rule } from "../types/program";
import type { Scenario } from "../types/scenario";
import { GLOSSARY, HELP_CORPUS, type GlossaryEntry, type HelpEntry } from "./helpCorpus";
import type { CreditEvent, LatePattern, ParsedEntities, TargetMetric } from "./types";

/**
 * Chatbot tool layer — small, tight, deterministic functions over the
 * caller's OWN tier-gated ProgramCatalog. No general SQL access, no model
 * involvement: superlatives/thresholds are computed here (extremum + tie
 * set), the LLM only narrates result sets it is handed.
 *
 * Tenant scoping: every function takes the catalog produced by
 * repo.getCatalog(org) for the requesting user — RLS/tier filtering happened
 * server-side before this layer ever runs, and nothing here can reach
 * outside the catalog value it was given.
 *
 * Sample data is INCLUDED and flagged (isSampleData) — the answer layer
 * labels it inline, per the sample-data disclosure policy.
 */

// ── Shared row/citation shapes ──────────────────────────────────────────────

/** Citation carried by every factual row the chatbot may surface. */
export interface ProgramCitation {
  programId: string;
  lenderName: string;
  programName: string;
  isSampleData: boolean;
  guidelineVersion: string;
  effectiveDate: string;
  lastVerifiedDate?: string;
  sourceCitation: string;
}

export interface ProgramFilters {
  docType?: IncomeDocType[];
  citizenship?: Citizenship[];
  occupancy?: Occupancy[];
  purpose?: LoanPurpose[];
  propertyType?: PropertyType[];
  vesting?: Vesting[];
  state?: string;
  /** Borrower FICO — programs requiring more are excluded. */
  fico?: number;
  loanAmount?: number;
  /** Feature tags from Stage A: io, non_warrantable, str, first_time_investor,
   * first_time_homebuyer, no_ratio, gift_funds, exceptions. */
  features?: string[];
  lenderNames?: string[];
  latePattern?: LatePattern;
  selfEmploymentMonths?: number;
  creditEvents?: CreditEvent[];
}

function citation(program: Program, lender: Lender): ProgramCitation {
  return {
    programId: program.id,
    lenderName: lender.name,
    programName: program.name,
    isSampleData: program.isSampleData || lender.isSampleData,
    guidelineVersion: program.guidelineVersionLabel,
    effectiveDate: program.effectiveDate,
    lastVerifiedDate: program.lastVerifiedDate,
    sourceCitation: program.sourceCitation,
  };
}

function activePairs(catalog: ProgramCatalog): Array<{ program: Program; lender: Lender }> {
  const lenderById = new Map(catalog.lenders.map((l) => [l.id, l]));
  return catalog.programs
    .filter((p) => p.active)
    .map((program) => ({ program, lender: lenderById.get(program.lenderId) }))
    .filter((pair): pair is { program: Program; lender: Lender } => pair.lender != null && pair.lender.active);
}

// ── Filter application ──────────────────────────────────────────────────────

/** Tri-state check result for a soft criterion: pass, hard fail, or the
 * catalog simply hasn't captured the field for this program. */
type SoftCheck = "pass" | "fail" | "unpopulated";

function checkLateTolerance(program: Program, late: LatePattern): SoftCheck {
  const tol = program.mortgageLateTolerance;
  if (tol) {
    const cap = late.days === 30 ? tol.maxLates30 : late.days === 60 ? tol.maxLates60 : tol.maxLates90;
    if (cap == null) return "unpopulated";
    // A tolerance documented over a shorter lookback than asked still answers
    // the common 12-month question; wider lookbacks only help the borrower.
    return late.count <= cap ? "pass" : "fail";
  }
  if (late.days === 30 && program.maxMortgageLates30x12 != null) {
    return late.count <= program.maxMortgageLates30x12 ? "pass" : "fail";
  }
  if (program.maxMortgageLatesCategory != null && program.maxMortgageLatesCategory !== "unknown") {
    const scenarioCat: Exclude<MortgageLatesCategory, "unknown"> =
      late.count === 0 ? "none" : late.count > 1 ? "multiple" : late.days === 30 ? "late_30" : late.days === 60 ? "late_60" : "late_90";
    return MORTGAGE_LATES_SEVERITY[scenarioCat] <= MORTGAGE_LATES_SEVERITY[program.maxMortgageLatesCategory]
      ? "pass"
      : "fail";
  }
  return "unpopulated";
}

const CREDIT_EVENT_TO_SEASONING_KEY: Record<CreditEvent, CreditEventType | null> = {
  bk7: "bk7_discharge",
  bk13: "bk13_discharge",
  foreclosure: "foreclosure",
  short_sale: "short_sale",
  deed_in_lieu: "deed_in_lieu",
  mortgage_lates: null, // handled by late-tolerance, not seasoning
};

interface FilterOutcome {
  hardPass: boolean;
  /** Soft-criterion caveats — populated fields that pass with conditions,
   * or checks the catalog can't answer for this program. */
  caveats: string[];
  /** True when a soft criterion is unpopulated (program can't be confirmed
   * either way) — surfaced separately, never silently dropped. */
  unpopulated: boolean;
}

function applyFilters(program: Program, lender: Lender, f: ProgramFilters): FilterOutcome {
  const caveats: string[] = [];
  let unpopulated = false;
  const fail: FilterOutcome = { hardPass: false, caveats: [], unpopulated: false };

  if (f.lenderNames?.length && !f.lenderNames.some((n) => lender.name.toLowerCase().includes(n.toLowerCase()))) return fail;
  if (f.docType?.length && !f.docType.some((d) => program.incomeDocTypes.includes(d))) return fail;
  if (f.citizenship?.length && !f.citizenship.some((c) => program.citizenshipEligible.includes(c))) return fail;
  if (f.occupancy?.length && !f.occupancy.some((o) => program.occupancies.includes(o))) return fail;
  if (f.purpose?.length && !f.purpose.some((p) => program.loanPurposes.includes(p))) return fail;
  if (f.propertyType?.length && !f.propertyType.some((p) => program.propertyTypes.includes(p))) return fail;
  if (f.vesting?.length && !f.vesting.some((v) => program.vestingEligible.includes(v))) return fail;
  if (f.state && program.eligibleStates !== "ALL" && !program.eligibleStates.includes(f.state)) return fail;
  if (f.fico != null && program.minFico > f.fico) return fail;
  if (f.loanAmount != null && (f.loanAmount < program.minLoanAmount || f.loanAmount > program.maxLoanAmount)) return fail;

  // Cross-classification is conjunctive: ITIN + DSCR needs the dedicated
  // combination flag, never inferred from separate membership.
  if (f.citizenship?.includes("itin") && f.docType?.includes("dscr")) {
    if (program.itinDscrEligible === false && program.itinNoRatioEligible !== true) return fail;
    if (program.itinDscrEligible == null && program.itinNoRatioEligible == null) {
      caveats.push("ITIN + DSCR combination eligibility not yet verified for this program");
      unpopulated = true;
    }
  }
  if (f.citizenship?.includes("foreign_national") && f.docType?.includes("dscr")) {
    if (program.foreignNationalDscrEligible === false) return fail;
    if (program.foreignNationalDscrEligible == null && !(program.citizenshipEligible.length === 1 && program.citizenshipEligible[0] === "foreign_national")) {
      caveats.push("Foreign National + DSCR combination eligibility not yet verified for this program");
      unpopulated = true;
    }
  }
  if (f.citizenship?.length && f.docType?.length && program.citizenshipDocTypeRestrictions) {
    for (const c of f.citizenship) {
      const allowed = program.citizenshipDocTypeRestrictions[c];
      if (allowed && !f.docType.some((d) => allowed.includes(d))) return fail;
    }
  }

  for (const feature of f.features ?? []) {
    switch (feature) {
      case "io":
        if (!program.interestOnlyAvailable) return fail;
        break;
      case "non_warrantable":
        if (!program.propertyTypes.includes("non_warrantable_condo")) return fail;
        break;
      case "str":
        if (program.strIncomeEligible === false) return fail;
        if (program.strIncomeEligible == null) {
          caveats.push("Short-term-rental income eligibility not yet confirmed");
          unpopulated = true;
        }
        break;
      case "first_time_investor":
        if (program.experiencedInvestorRequired === true || program.firstTimeInvestorAllowed === false) return fail;
        if (program.firstTimeInvestorAllowed == null && program.experiencedInvestorRequired == null && program.incomeDocTypes.includes("dscr")) {
          caveats.push("First-time-investor treatment not yet confirmed");
          unpopulated = true;
        }
        break;
      case "first_time_homebuyer":
        if (program.firstTimeHomebuyerAllowed === false) return fail;
        break;
      case "no_ratio":
        if (!program.incomeDocTypes.includes("dscr")) return fail;
        if (program.minDscr != null && program.minDscr > 0 && program.itinNoRatioEligible !== true) {
          return fail; // has a real ratio floor and no documented no-ratio option
        }
        break;
      case "gift_funds":
        if (program.giftFundsAllowed === false) return fail;
        if (program.giftFundsAllowed == null) {
          caveats.push("Gift-funds policy not yet confirmed");
          unpopulated = true;
        }
        break;
      case "exceptions":
        if (program.exceptionPolicy?.type === "none") return fail;
        if (program.exceptionPolicy == null) {
          caveats.push("Exception policy not captured for this program");
          unpopulated = true;
        }
        break;
      default:
        break; // unknown tags never silently exclude
    }
  }

  if (f.latePattern) {
    const check = checkLateTolerance(program, f.latePattern);
    if (check === "fail") return fail;
    if (check === "unpopulated") {
      caveats.push("Mortgage-late tolerance not documented for this program");
      unpopulated = true;
    } else if (program.mortgageLateTolerance?.ltvReduction) {
      caveats.push(`Lates tolerated with a ${program.mortgageLateTolerance.ltvReduction}% LTV reduction`);
    } else if (program.mortgageLateTolerance?.ficoFloorIncrease) {
      caveats.push(`Lates tolerated with a ${program.mortgageLateTolerance.ficoFloorIncrease}-point FICO floor increase`);
    }
  }

  if (f.selfEmploymentMonths != null && (f.docType?.includes("bank_statement") || f.docType?.includes("pnl_only") || program.incomeDocTypes.some((d) => d === "bank_statement" || d === "pnl_only"))) {
    if (program.minSelfEmploymentMonths != null) {
      if (f.selfEmploymentMonths < program.minSelfEmploymentMonths) return fail;
    } else {
      caveats.push("Minimum self-employment history not on file for this program");
      unpopulated = true;
    }
  }

  if (f.creditEvents?.length) {
    for (const event of f.creditEvents) {
      const key = CREDIT_EVENT_TO_SEASONING_KEY[event];
      if (key == null) continue;
      const entry = program.creditEventSeasoning?.[key];
      if (entry == null) {
        caveats.push(`Seasoning for ${event.replace(/_/g, " ")} not documented for this program`);
        unpopulated = true;
      }
    }
  }

  return { hardPass: true, caveats, unpopulated };
}

// ── search_programs ─────────────────────────────────────────────────────────

export interface SearchProgramRow extends ProgramCitation {
  matchedAttributes: Record<string, unknown>;
  caveats: string[];
}

export interface SearchProgramsResult {
  tool: "search_programs";
  rows: SearchProgramRow[];
  /** Programs that pass every hard filter but whose catalog data can't
   * confirm one or more soft criteria — reported, never silently dropped. */
  unconfirmedRows: SearchProgramRow[];
  totalActivePrograms: number;
}

export function searchPrograms(catalog: ProgramCatalog, filters: ProgramFilters, limit = 10): SearchProgramsResult {
  const pairs = activePairs(catalog);
  const rows: SearchProgramRow[] = [];
  const unconfirmedRows: SearchProgramRow[] = [];

  for (const { program, lender } of pairs) {
    const outcome = applyFilters(program, lender, filters);
    if (!outcome.hardPass) continue;
    const row: SearchProgramRow = {
      ...citation(program, lender),
      caveats: outcome.caveats,
      matchedAttributes: {
        incomeDocTypes: program.incomeDocTypes,
        citizenshipEligible: program.citizenshipEligible,
        vestingEligible: program.vestingEligible,
        occupancies: program.occupancies,
        loanPurposes: program.loanPurposes,
        propertyTypes: program.propertyTypes,
        minFico: program.minFico,
        baseMaxLtv: program.baseMaxLtv,
        minDscr: program.minDscr ?? null,
        maxDti: program.maxDti ?? null,
        minLoanAmount: program.minLoanAmount,
        maxLoanAmount: program.maxLoanAmount,
        minReservesMonths: program.minReservesMonths,
        exceptionPolicy: program.exceptionPolicy ?? null,
        mortgageLateTolerance: program.mortgageLateTolerance ?? null,
        creditEventSeasoning: program.creditEventSeasoning ?? null,
        estimatedTurnTimes: program.estimatedTurnTimes ?? null,
      },
    };
    (outcome.unpopulated ? unconfirmedRows : rows).push(row);
  }

  return {
    tool: "search_programs",
    rows: rows.slice(0, limit),
    unconfirmedRows: unconfirmedRows.slice(0, limit),
    totalActivePrograms: pairs.length,
  };
}

// ── rank_programs_by_metric ─────────────────────────────────────────────────

export interface RankedProgramRow extends ProgramCitation {
  value: number;
  /** Human-readable unit for the value (percent, months, usd, fico, ratio). */
  unit: string;
  gatingConditions: string[];
  caveats: string[];
}

export interface RankProgramsResult {
  tool: "rank_programs_by_metric";
  metric: TargetMetric;
  direction: "min" | "max";
  rows: RankedProgramRow[];
  /** Every program sharing the extremum value — ties are reported as ties. */
  tieSet: RankedProgramRow[];
  /** Programs matching the filters whose catalog data does not populate this
   * metric — must be surfaced as unpopulated, never silently skipped. */
  unpopulated: Array<ProgramCitation & { reason: string }>;
  totalConsidered: number;
}

/** Best-case synthetic scenario for a matrix projection: reuses the SAME
 * deriveMaxLtv the matching engine uses (no forked math). When the caller
 * gave no FICO we take the program's best documented tier and report that
 * FICO as a gating condition instead of assuming the borrower has it. */
function syntheticScenario(program: Program, f: ProgramFilters): { scenario: Scenario; gating: string[] } {
  const gating: string[] = [];
  let fico = f.fico;
  if (fico == null) {
    const tierFicos = [
      ...(program.ltvMatrix ?? []).map((t) => t.minFico),
      ...(program.eligibilityLtvMatrix ?? []).map((t) => t.minFico ?? 0),
    ].filter((n) => n > 0);
    fico = tierFicos.length ? Math.max(...tierFicos) : Math.max(program.minFico, 300);
    if (fico > program.minFico) gating.push(`${fico}+ FICO for this tier`);
    else if (program.minFico > 0) gating.push(`${program.minFico}+ FICO`);
  }
  const purpose = f.purpose?.[0] ?? (program.loanPurposes.includes("purchase") ? "purchase" : program.loanPurposes[0]);
  const docType = f.docType?.find((d) => program.incomeDocTypes.includes(d)) ?? program.incomeDocTypes[0];
  const occupancy =
    f.occupancy?.find((o) => program.occupancies.includes(o)) ??
    (docType === "dscr" && program.occupancies.includes("investment") ? "investment" : program.occupancies[0]);
  const propertyType = f.propertyType?.find((p) => program.propertyTypes.includes(p)) ?? (program.propertyTypes.includes("single_family") ? "single_family" : program.propertyTypes[0]);
  const citizenship = f.citizenship?.find((c) => program.citizenshipEligible.includes(c)) ?? "us_citizen";

  if (purpose && !f.purpose?.length && program.loanPurposes.length < 3) gating.push(`${purpose.replace(/_/g, " ")} only`.replace("purchase only", "purchase"));
  if (program.minDscr != null && program.minDscr > 0) gating.push(`DSCR ≥ ${program.minDscr.toFixed(2)}`);

  const scenario: Scenario = {
    id: "chat_projection",
    organizationId: program.organizationId,
    name: "chat projection",
    createdByUserId: "chat",
    loanPurpose: purpose,
    occupancy,
    propertyType,
    citizenship,
    fico,
    incomeDocType: docType,
    requestedLoanAmount: f.loanAmount ?? Math.min(Math.max(program.minLoanAmount, 500_000), program.maxLoanAmount),
  } as Scenario;
  return { scenario, gating };
}

function metricValue(
  program: Program,
  f: ProgramFilters
): (metric: TargetMetric) => { value: number | null; unit: string; gating: string[]; reason?: string } {
  return (metric) => {
    switch (metric) {
      case "max_ltv":
      case "min_down_payment": {
        const { scenario, gating } = syntheticScenario(program, f);
        const ltv = deriveMaxLtv(scenario, program, program.minDscr ?? undefined);
        if (ltv <= 0) return { value: null, unit: "percent", gating, reason: "No LTV documented for this combination" };
        return metric === "max_ltv"
          ? { value: ltv, unit: "percent", gating }
          : { value: Math.round((100 - ltv) * 100) / 100, unit: "percent", gating };
      }
      case "min_fico": {
        if (program.minFico === 0) {
          return { value: 0, unit: "fico", gating: ["No U.S. FICO required (alternative/foreign credit per program terms)"] };
        }
        return { value: program.minFico, unit: "fico", gating: [] };
      }
      case "max_dti": {
        if (program.maxDti == null) {
          const isDscr = program.incomeDocTypes.length === 1 && program.incomeDocTypes[0] === "dscr";
          return { value: null, unit: "percent", gating: [], reason: isDscr ? "DSCR program — DTI is not used" : "Max DTI not captured" };
        }
        return { value: program.maxDti, unit: "percent", gating: [] };
      }
      case "min_dscr": {
        if (!program.incomeDocTypes.includes("dscr")) return { value: null, unit: "ratio", gating: [], reason: "Not a DSCR program" };
        if (program.minDscr == null) return { value: null, unit: "ratio", gating: [], reason: "Minimum DSCR not captured" };
        return { value: program.minDscr, unit: "ratio", gating: [] };
      }
      case "min_reserves":
        return { value: program.minReservesMonths, unit: "months", gating: (program.reserveRules?.length ?? 0) > 0 ? ["Higher reserve overlays can apply by loan amount/LTV/FICO"] : [] };
      case "min_loan_amount":
        return { value: program.minLoanAmount, unit: "usd", gating: [] };
      case "max_loan_amount":
        return { value: program.maxLoanAmount, unit: "usd", gating: [] };
      case "min_seasoning": {
        const events = (f.creditEvents ?? ["bk7"]).map((e) => CREDIT_EVENT_TO_SEASONING_KEY[e]).filter((k): k is CreditEventType => k != null);
        const entries = events
          .map((k) => ({ k, entry: program.creditEventSeasoning?.[k] }))
          .filter((x): x is { k: CreditEventType; entry: { months: number; ltvReduction?: number; minFico?: number; notes?: string } } => x.entry != null);
        if (entries.length === 0) return { value: null, unit: "months", gating: [], reason: "Credit-event seasoning not captured for this program" };
        const best = entries.sort((a, b) => a.entry.months - b.entry.months)[0]!;
        const gating: string[] = [`${best.k.replace(/_/g, " ")}`];
        if (best.entry.ltvReduction) gating.push(`with a ${best.entry.ltvReduction}% LTV reduction`);
        if (best.entry.minFico) gating.push(`${best.entry.minFico}+ FICO`);
        return { value: best.entry.months, unit: "months", gating };
      }
    }
  };
}

export function rankProgramsByMetric(
  catalog: ProgramCatalog,
  metric: TargetMetric,
  direction: "min" | "max",
  filters: ProgramFilters,
  limit = 5
): RankProgramsResult {
  const pairs = activePairs(catalog);
  const ranked: RankedProgramRow[] = [];
  const unpopulated: Array<ProgramCitation & { reason: string }> = [];
  let considered = 0;

  for (const { program, lender } of pairs) {
    const outcome = applyFilters(program, lender, filters);
    if (!outcome.hardPass) continue;
    considered++;
    const { value, unit, gating, reason } = metricValue(program, filters)(metric);
    if (value == null) {
      unpopulated.push({ ...citation(program, lender), reason: reason ?? "Field not captured" });
      continue;
    }
    ranked.push({ ...citation(program, lender), value, unit, gatingConditions: gating, caveats: outcome.caveats });
  }

  ranked.sort((a, b) => (direction === "min" ? a.value - b.value : b.value - a.value));
  const best = ranked[0]?.value;
  const tieSet = best == null ? [] : ranked.filter((r) => r.value === best);

  return {
    tool: "rank_programs_by_metric",
    metric,
    direction,
    rows: ranked.slice(0, limit),
    tieSet,
    unpopulated,
    totalConsidered: considered,
  };
}

// ── get_program_detail / lookup_matrix_cell ────────────────────────────────

export interface ProgramDetailResult {
  tool: "get_program_detail";
  found: boolean;
  detail?: { program: Program; citation: ProgramCitation };
}

export function getProgramDetail(catalog: ProgramCatalog, programId: string): ProgramDetailResult {
  const pair = activePairs(catalog).find((p) => p.program.id === programId);
  if (!pair) return { tool: "get_program_detail", found: false };
  return { tool: "get_program_detail", found: true, detail: { program: pair.program, citation: citation(pair.program, pair.lender) } };
}

export interface MatrixDimensions {
  fico?: number;
  loanAmount?: number;
  occupancy?: Occupancy;
  purpose?: LoanPurpose;
  propertyType?: PropertyType;
  citizenship?: Citizenship;
  docType?: IncomeDocType;
  dscr?: number;
}

export interface MatrixCellResult {
  tool: "lookup_matrix_cell";
  found: boolean;
  maxLtv?: number;
  minDownPaymentPct?: number;
  citation?: ProgramCitation;
  note?: string;
}

/** Matrix cell lookup — reuses deriveMaxLtv (the matcher's own derivation). */
export function lookupMatrixCell(catalog: ProgramCatalog, programId: string, dims: MatrixDimensions): MatrixCellResult {
  const pair = activePairs(catalog).find((p) => p.program.id === programId);
  if (!pair) return { tool: "lookup_matrix_cell", found: false, note: "Program not found in your library" };
  const { program, lender } = pair;
  const scenario: Scenario = {
    id: "chat_matrix_lookup",
    organizationId: program.organizationId,
    name: "chat matrix lookup",
    createdByUserId: "chat",
    loanPurpose: dims.purpose ?? "purchase",
    occupancy: dims.occupancy,
    propertyType: dims.propertyType,
    citizenship: dims.citizenship,
    fico: dims.fico,
    incomeDocType: dims.docType,
    requestedLoanAmount: dims.loanAmount,
  } as Scenario;
  const maxLtv = deriveMaxLtv(scenario, program, dims.dscr ?? program.minDscr ?? undefined);
  if (maxLtv <= 0) {
    return { tool: "lookup_matrix_cell", found: false, citation: citation(program, lender), note: "No documented LTV for this combination" };
  }
  return {
    tool: "lookup_matrix_cell",
    found: true,
    maxLtv,
    minDownPaymentPct: Math.round((100 - maxLtv) * 100) / 100,
    citation: citation(program, lender),
  };
}

// ── query_rules ─────────────────────────────────────────────────────────────

export interface QueryRulesResult {
  tool: "query_rules";
  rows: Array<{
    ruleName: string;
    category: string;
    userExplanation: string;
    citation: ProgramCitation;
    sourceSection?: string;
    sourcePage?: number;
  }>;
}

/** Structured rule query — active (human-verified, effective) rules only,
 * never draft or superseded. */
export function queryRules(catalog: ProgramCatalog, category: string, filters?: ProgramFilters, asOf: Date = new Date()): QueryRulesResult {
  const pairs = activePairs(catalog);
  const byProgram = new Map(pairs.map((p) => [p.program.id, p]));
  const active = selectActiveRules(catalog.rules, asOf);
  const rows: QueryRulesResult["rows"] = [];
  for (const rule of active) {
    if (rule.category !== category) continue;
    const pair = byProgram.get(rule.programId);
    if (!pair) continue;
    if (filters && !applyFilters(pair.program, pair.lender, filters).hardPass) continue;
    rows.push({
      ruleName: rule.name,
      category: rule.category,
      userExplanation: rule.userExplanation,
      citation: citation(pair.program, pair.lender),
      sourceSection: rule.sourceSection,
      sourcePage: rule.sourcePage,
    });
  }
  return { tool: "query_rules", rows };
}

// ── quick_evaluate ──────────────────────────────────────────────────────────

export interface QuickEvaluateResult {
  tool: "quick_evaluate";
  rows: Array<{
    citation: ProgramCitation;
    status: string;
    maxLtv: number | undefined;
    failedRules: string[];
    manualReviewItems: string[];
  }>;
  assumptionNote: string;
}

/**
 * Lightweight partial-scenario evaluation — reuses analyzeScenario (the SAME
 * calculation + rules services as the full matcher; no forked math). Missing
 * fields stay undefined: the engine treats them as unknown, never assumed
 * favorable (unresolvable checks surface as manual-review items).
 */
export function quickEvaluate(catalog: ProgramCatalog, entities: ParsedEntities, limit = 5): QuickEvaluateResult {
  const scenario: Scenario = {
    id: "chat_quick_eval",
    organizationId: catalog.programs[0]?.organizationId ?? "unknown",
    name: "chat quick evaluation",
    createdByUserId: "chat",
    loanPurpose: entities.purpose?.[0],
    occupancy: entities.occupancy?.[0],
    propertyType: entities.propertyType?.[0],
    citizenship: entities.citizenship?.[0],
    state: entities.state,
    fico: entities.fico,
    incomeDocType: entities.docType?.[0],
    requestedLoanAmount: entities.loanAmount,
    // "75% LTV" without dollar figures: model as loan/value on a synthetic
    // basis so calc.ltv reproduces the stated leverage.
    ...(entities.ltv != null && entities.loanAmount == null
      ? { requestedLoanAmount: entities.ltv * 10_000, estimatedValue: 1_000_000 }
      : {}),
    ...(entities.latePattern != null
      ? {
          creditEvents: {
            mortgageLates30x12: entities.latePattern.days === 30 ? entities.latePattern.count : undefined,
            mortgageLates60x12: entities.latePattern.days === 60 ? entities.latePattern.count : undefined,
            mortgageLates90x12: entities.latePattern.days === 90 ? entities.latePattern.count : undefined,
          },
        }
      : {}),
  } as Scenario;

  const analysis = analyzeScenario(scenario, catalog);
  const lenderById = new Map(catalog.lenders.map((l) => [l.id, l]));
  const programById = new Map(catalog.programs.map((p) => [p.id, p]));

  const rows = analysis.evaluations
    .filter((e) => e.status !== "ineligible")
    .slice(0, limit)
    .map((e) => {
      const program = programById.get(e.programId);
      const lender = lenderById.get(e.lenderId);
      return {
        citation:
          program && lender
            ? citation(program, lender)
            : {
                programId: e.programId,
                lenderName: e.lenderName,
                programName: e.programName,
                isSampleData: e.isSampleData,
                guidelineVersion: e.guidelineVersion,
                effectiveDate: e.effectiveDate,
                lastVerifiedDate: e.lastVerifiedDate,
                sourceCitation: e.sourceCitation,
              },
        status: e.status,
        maxLtv: e.maxLtv,
        failedRules: e.failedRules.map((r) => r.userExplanation),
        manualReviewItems: e.manualReviewItems.map((r) => r.userExplanation),
      };
    });

  return {
    tool: "quick_evaluate",
    rows,
    assumptionNote: "Partial facts only — unstated fields were treated as unknown, never assumed favorable.",
  };
}

// ── search_guidelines ───────────────────────────────────────────────────────

export interface GuidelineSearchResult {
  tool: "search_guidelines";
  rows: Array<{ snippet: string; field: string; citation: ProgramCitation }>;
}

/** Keyword search over the catalog's guideline text fields (notes, expense-
 * factor notes, STR notes, matrix notes) and active rules' explanations. */
export function searchGuidelines(catalog: ProgramCatalog, query: string, filters?: ProgramFilters, limit = 5): GuidelineSearchResult {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (terms.length === 0) return { tool: "search_guidelines", rows: [] };

  const rows: Array<{ snippet: string; field: string; citation: ProgramCitation; score: number }> = [];
  for (const { program, lender } of activePairs(catalog)) {
    if (filters && !applyFilters(program, lender, filters).hardPass) continue;
    const textFields: Array<[string, string | undefined]> = [
      ["notes", program.notes],
      ["expenseFactorNotes", program.expenseFactorNotes],
      ["strIncomeNotes", program.strIncomeNotes],
      ["giftFundsNotes", program.giftFundsNotes],
      ["matrixConfirmationNotes", program.matrixConfirmationNotes],
      ["exceptionPolicy", program.exceptionPolicy?.notes],
      ["mortgageLateTolerance", program.mortgageLateTolerance?.notes],
    ];
    for (const [field, text] of textFields) {
      if (!text) continue;
      const lower = text.toLowerCase();
      const score = terms.filter((t) => lower.includes(t)).length;
      if (score > 0) rows.push({ snippet: text.slice(0, 400), field, citation: citation(program, lender), score });
    }
  }
  const byProgram = new Map(activePairs(catalog).map((p) => [p.program.id, p]));
  for (const rule of selectActiveRules(catalog.rules, new Date())) {
    const pair = byProgram.get(rule.programId);
    if (!pair) continue;
    if (filters && !applyFilters(pair.program, pair.lender, filters).hardPass) continue;
    const lower = `${rule.name} ${rule.userExplanation}`.toLowerCase();
    const score = terms.filter((t) => lower.includes(t)).length;
    if (score > 0) {
      rows.push({
        snippet: rule.userExplanation.slice(0, 400),
        field: `rule:${rule.category}${rule.sourceSection ? ` (${rule.sourceSection})` : ""}`,
        citation: citation(pair.program, pair.lender),
        score,
      });
    }
  }
  rows.sort((a, b) => b.score - a.score);
  return { tool: "search_guidelines", rows: rows.slice(0, limit).map(({ score: _score, ...row }) => row) };
}

// ── search_help / glossary ──────────────────────────────────────────────────

export interface HelpSearchResult {
  tool: "search_help";
  entries: HelpEntry[];
}

export function searchHelp(query: string, limit = 2): HelpSearchResult {
  const q = query.toLowerCase();
  const scored = HELP_CORPUS.map((entry) => ({
    entry,
    score: entry.keywords.filter((k) => q.includes(k)).length,
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return { tool: "search_help", entries: scored.slice(0, limit).map((s) => s.entry) };
}

export interface GlossaryResult {
  tool: "define_term";
  entries: GlossaryEntry[];
}

export function defineTerm(query: string, limit = 2): GlossaryResult {
  const q = query.toLowerCase();
  // Score by matched-keyword LENGTH, not count — a specific term ("no_ratio")
  // must beat an incidental generic hit ("dscr") on the same question.
  const scored = GLOSSARY.map((entry) => ({
    entry,
    score: entry.keywords.filter((k) => q.includes(k)).reduce((sum, k) => sum + k.length, 0),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return { tool: "define_term", entries: scored.slice(0, limit).map((s) => s.entry) };
}

// ── create_scenario_draft ───────────────────────────────────────────────────

export interface ScenarioDraftLink {
  tool: "create_scenario_draft";
  url: string;
}

/** Deep link into the scenario builder with the parsed entities prefilled. */
export function createScenarioDraftLink(entities: ParsedEntities): ScenarioDraftLink {
  const params = new URLSearchParams();
  if (entities.docType?.[0]) params.set("incomeDocType", entities.docType[0]);
  if (entities.purpose?.[0]) params.set("loanPurpose", entities.purpose[0]);
  if (entities.occupancy?.[0]) params.set("occupancy", entities.occupancy[0]);
  if (entities.propertyType?.[0]) params.set("propertyType", entities.propertyType[0]);
  if (entities.citizenship?.[0]) params.set("citizenship", entities.citizenship[0]);
  if (entities.fico != null) params.set("fico", String(entities.fico));
  if (entities.ltv != null) params.set("ltv", String(entities.ltv));
  if (entities.loanAmount != null) params.set("loanAmount", String(entities.loanAmount));
  if (entities.state) params.set("state", entities.state);
  const qs = params.toString();
  return { tool: "create_scenario_draft", url: qs ? `/scenarios/new?${qs}` : "/scenarios/new" };
}

// ── Rule categories helper (kept in sync with Rule.category conventions) ────
export type { Rule };
