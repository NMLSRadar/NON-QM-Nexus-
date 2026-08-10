/**
 * Deterministic metric reading for the chatbot tool layer.
 *
 * Every value here is computed from the program's own published fields via the
 * SAME domain services the matching engine uses (deriveMaxLtv etc.) — never
 * from memory and never re-derived by an LLM. `fieldNotCaptured` is the honest
 * signal when a program doesn't document the field for the given dimensions.
 */

import { type Occupancy, type PropertyType, type Citizenship, IncomeDocType, LoanPurpose } from "@/domain/types/enums";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { ParsedEntities, TargetMetric } from "./types";

export interface ProgramFilters {
  docType?: IncomeDocType[];
  occupancy?: Occupancy[];
  purpose?: LoanPurpose[];
  propertyType?: PropertyType[];
  citizenship?: Citizenship[];
  vesting?: string;
  features?: string[];
  /** Fuzzy/normalized lender or program name substring. */
  query?: string;
  /** Only include sample-data programs — for demo-only drill-downs. */
  sampleOnly?: boolean;
  /** Exclude sample-data programs (default). */
  excludeSample?: boolean;
}

export interface MetricRead {
  value: number | null;
  captured: boolean;
  gating: string[];
}

/**
 * Build a minimal evaluable Scenario from parsed entities so we can reuse the
 * exact deriveMaxLtv / evaluateProgram domain math. Missing dimensions are
 * left undefined — the derivation selects the most specific published row it
 * can, which is the honest "best published tier" semantics for superlatives.
 */
export function buildScenarioFromEntities(entities: ParsedEntities, organizationId = "org_demo"): Scenario {
  const now = new Date().toISOString();
  return {
    id: "chat-draft",
    organizationId,
    name: "Chat draft",
    createdByUserId: "chat",
    loanPurpose: entities.purpose?.[0],
    occupancy: entities.occupancy?.[0],
    propertyType: entities.propertyType?.[0],
    state: entities.state,
    fico: entities.fico,
    citizenship: entities.citizenship?.[0],
    vesting: entities.vesting,
    firstTimeInvestor: entities.features?.includes("first_time_investor"),
    firstTimeHomebuyer: entities.features?.includes("first_time_homebuyer"),
    incomeDocType: entities.docType?.[0],
    requestedLoanAmount: entities.loanAmount,
    creditEvents: entities.creditEvents?.some((e) => e.type === "mortgage_lates")
      ? { mortgageLates30x12: mortgageLates30Count(entities.latePattern) }
      : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function mortgageLates30Count(latePattern?: string): number | undefined {
  if (!latePattern) return undefined;
  const m = latePattern.match(/^(\d+)x/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Best PUBLISHED max LTV for a program under the stated dimensions.
 *
 * A superlative/threshold question ("lowest down payment", "highest LTV") asks
 * about the program's best published tier, not a specific scenario — so when
 * the exact FICO (or other matrix-gating dimension) isn't stated, we take the
 * most favorable documented tier and report its FICO requirement in `gating`
 * rather than returning 0 (what the strict scenario path does on an uncovered
 * combination). The same tightening overlays (property/citizenship/doc-type
 * caps, first-time investor adjustment) still apply for dimensions the user
 * DID provide — never loosening beyond the published matrix.
 */
export function effectiveMaxLtv(program: Program, entities: ParsedEntities, _organizationId = "org_demo"): number {
  let tier: number | null = null;
  if (program.eligibilityLtvMatrix?.length) {
    tier = Math.max(...program.eligibilityLtvMatrix.map((e) => e.maxLtv));
  } else if (program.purposeLtvMatrix?.length) {
    const purpose = entities.purpose?.[0];
    const caps = program.purposeLtvMatrix.map((e) => {
      const c =
        purpose === "cash_out_refinance"
          ? e.maxLtvCashOut
          : purpose === "rate_term_refinance"
            ? e.maxLtvRateTerm
            : e.maxLtvPurchase;
      return c ?? 0;
    });
    tier = Math.max(...caps);
  }
  if (tier == null || tier <= 0) tier = program.baseMaxLtv;

  let cap = tier;
  const ptype = entities.propertyType?.[0];
  if (ptype && program.propertyTypeLtvCaps?.[ptype] != null) cap = Math.min(cap, program.propertyTypeLtvCaps[ptype]!);
  const cit = entities.citizenship?.[0];
  if (cit && program.citizenshipLtvCaps?.[cit] != null) cap = Math.min(cap, program.citizenshipLtvCaps[cit]!);
  if (program.noFicoMaxLtv != null) cap = Math.min(cap, program.noFicoMaxLtv);
  const doc = entities.docType?.[0];
  const purp = entities.purpose?.[0];
  if (doc && purp && program.incomeDocTypeLtvCaps?.[doc]?.[purp] != null) cap = Math.min(cap, program.incomeDocTypeLtvCaps[doc]![purp]!);
  if (entities.features?.includes("first_time_investor") && program.firstTimeInvestorLtvAdjustment != null) {
    cap -= program.firstTimeInvestorLtvAdjustment;
  }
  return Math.max(0, cap);
}

/** Read a target metric value + gating + captured flag off a single program. */
export function readMetric(program: Program, metric: TargetMetric, entities: ParsedEntities): MetricRead {
  const gating: string[] = [];
  const push = (fmt: string, val?: unknown) => {
    if (val !== undefined && val !== null && val !== false) gating.push(fmt.replace("{v}", String(val)));
  };

  switch (metric) {
    case "max_ltv": {
      const ltv = effectiveMaxLtv(program, entities);
      if (ltv <= 0) return { value: null, captured: false, gating: [] };
      push("FICO {v}+", program.minFico);
      if (entities.purpose?.[0] === "cash_out_refinance") gating.push("cash-out");
      if (entities.propertyType?.[0]) gating.push(`property: ${entities.propertyType[0].replace(/_/g, " ")}`);
      return { value: ltv, captured: true, gating };
    }
    case "min_down_payment": {
      const ltv = effectiveMaxLtv(program, entities);
      if (ltv <= 0) return { value: null, captured: false, gating: [] };
      push("FICO {v}+", program.minFico);
      const down = 100 - ltv;
      if (entities.purpose?.[0] === "cash_out_refinance") gating.push("cash-out");
      return { value: down, captured: true, gating };
    }
    case "min_fico":
      if (program.minFico <= 0) return { value: null, captured: false, gating: [] };
      return { value: program.minFico, captured: true, gating };
    case "max_dti":
      if (program.maxDti == null || program.maxDti <= 0) return { value: null, captured: false, gating: [] };
      return { value: program.maxDti, captured: true, gating };
    case "min_dscr":
      if (program.minDscr == null) return { value: null, captured: false, gating: [] };
      return { value: program.minDscr, captured: true, gating };
    case "min_reserves":
      if (program.minReservesMonths == null || program.minReservesMonths <= 0) return { value: null, captured: false, gating };
      return { value: program.minReservesMonths, captured: true, gating };
    case "min_loan_amount":
      if (program.minLoanAmount == null || program.minLoanAmount <= 0) return { value: null, captured: false, gating };
      return { value: program.minLoanAmount, captured: true, gating };
    case "max_loan_amount":
      if (program.maxLoanAmount == null || program.maxLoanAmount <= 0) return { value: null, captured: false, gating };
      return { value: program.maxLoanAmount, captured: true, gating };
    case "min_seasoning": {
      // Credit-event seasoning is a PART 2 structured field — see
      // Program.creditEventSeasoning. Absent across the library, the tool
      // reports fieldNotCaptured (honest non-answer) rather than guessing.
      const seasons = program.creditEventSeasoning;
      if (!seasons) return { value: null, captured: false, gating };
      const values = Object.values(seasons).filter((v): v is number => typeof v === "number");
      if (values.length === 0) return { value: null, captured: false, gating };
      return { value: Math.min(...values), captured: true, gating: ["varies by event type"] };
    }
    default:
      return { value: null, captured: false, gating };
  }
}

/** Human label for a metric, e.g. "min down payment" -> "Min down payment". */
export function metricLabel(metric: TargetMetric): string {
  const map: Record<TargetMetric, string> = {
    min_down_payment: "Min down payment",
    max_ltv: "Max LTV",
    min_fico: "Min FICO",
    max_dti: "Max DTI",
    min_dscr: "Min DSCR",
    min_reserves: "Min reserves (months)",
    min_loan_amount: "Min loan amount",
    max_loan_amount: "Max loan amount",
    min_seasoning: "Shortest credit-event seasoning",
  };
  return map[metric];
}