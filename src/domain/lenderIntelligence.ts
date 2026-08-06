import type { Lender, Program } from "@/domain/types/program";

/**
 * LENDER INTELLIGENCE LAYER (AI Assistant AE upgrade, 2026-08-06).
 *
 * A second, QUALITATIVE layer on top of the hard guideline fields. The hard
 * fields (Program.minFico / baseMaxLtv / ...) remain the ONLY source of truth
 * for whether a scenario is eligible — this layer answers the different
 * question an experienced Non-QM wholesale Account Executive answers first:
 * WHERE TO LOOK. It captures reputation/specialty knowledge ("who is good
 * with exceptions", "who maximizes business deposits", "who takes first-time
 * investors") as DETERMINISTIC, TESTED data + functions, so the
 * conversational assistant can route like an AE instead of pattern-matching
 * guideline keywords.
 *
 * Two data sources, deliberately kept apart:
 *  - SEEDED profile knowledge (below): the six lender profiles the user
 *    explicitly provided, normalized to lowercase name keys. This is
 *    DIRECTIONAL reputation only — see PREFLIGHT. It is serialized to the
 *    model with a hard "guidelines always override" caveat.
 *  - REAL catalog fields: the admin-curated editorial flags already on
 *    Program (bankStatementFlexible, itinSpecialist, ...) plus any scenario
 *    vitals the user has stated. These ALWAYS win on conflict.
 *
 * Nothing in this file is ever treated as eligibility. Every function that
 * returns a lender name returns it as a routing suggestion with a confidence
 * tier the model must surface honestly (see CONFIDENCE_* constants).
 */

// ---------------------------------------------------------------------------
// Borrower vitals the assistant can accumulate across a multi-turn chat
// (mirrors what the deterministic engine's Scenario captures, but every field
// is optional — the assistant extracts these conversationally, never as a
// form). Used by evaluateDscrUniverse + pickDepositPriority.
// ---------------------------------------------------------------------------
export interface AssistantVitals {
  fico?: number;
  ltv?: number; // percent 0-100
  dscr?: number;
  reservesMonths?: number;
  firstTimeHomebuyer?: boolean; // hasn't owned residential property in the guideline period
  firstTimeInvestor?: boolean; // little/no history owning/managing investment property
  propertyType?: string; // free-form at the conversational layer; matching maps to PropertyType
  loanAmount?: number;
  citizenship?: string; // "us_citizen" | "permanent_resident" | "non_permanent_resident" | "itin" | "foreign_national" | "no_us_credit"
}

// ---------------------------------------------------------------------------
// Confidence tiers — every lender recommendation the assistant makes must be
// internally bucketed so it never presents an exception as published
// eligibility (spec §14).
// ---------------------------------------------------------------------------
export const CONFIDENCE = {
  /** The uploaded guideline directly confirms the scenario. */
  HIGH: "high",
  /** Appears to fit, but one or more details still need clarification. */
  MEDIUM: "medium",
  /** Possible through lender discretion/interpretation — not a published rule. */
  AE_REVIEW: "ae_review",
  /** Does NOT meet the published guideline, but the lender is seeded as
   *  potentially receptive to an exception. Never present as eligible. */
  EXCEPTION_REQUEST: "exception_request",
} as const;
export type Confidence = (typeof CONFIDENCE)[keyof typeof CONFIDENCE];

// ---------------------------------------------------------------------------
// Seeded lender profiles — normalized lowercase name → qualitative tags.
// These are the six names the user explicitly supplied plus the qualitative
// attributes from the spec. Everything here is searchable knowledge for the
// assistant, never an eligibility fact. Names are lowercase for matching;
// the serializer resolves them against the live catalog so a seeded profile
// with no catalog row is silently dropped rather than cited as present.
// ---------------------------------------------------------------------------
export interface SeededLenderProfile {
  /** Searchable "best at" specialty tags (spec §10). */
  strengths: string[];
  /** true = named by the user as receptive to exception requests. */
  exceptionFriendly: boolean;
  /** true = user-stated as able to consider up to 100% of eligible business
   *  deposits in qualifying situations (spec §3 — always caveated, never a
   *  guarantee every deposit counts). */
  highDepositUtilization: boolean;
}

export const SEEDED_LENDER_PROFILES: Record<string, SeededLenderProfile> = {
  "orion lending": {
    strengths: [
      "bank statements",
      "high deposit utilization",
      "dscr",
      "first-time homebuyer dscr",
      "first-time investor",
      "non-permanent resident",
      "high-ltv non-qm",
      "exceptions",
      "p&l only",
      "asset depletion",
    ],
    exceptionFriendly: true,
    highDepositUtilization: true,
  },
  "greenbox loans": {
    strengths: [
      "bank statements",
      "high deposit utilization",
      "itin",
      "foreign national",
      "no-fico scenarios when permitted",
      "exceptions",
      "complex non-qm",
    ],
    exceptionFriendly: true,
    highDepositUtilization: true,
  },
  "deep haven": {
    strengths: ["dscr", "bank statements", "broad non-qm", "exceptions", "complex borrower profiles"],
    exceptionFriendly: true,
    highDepositUtilization: false,
  },
  "acra lending": {
    strengths: ["non-qm", "dscr", "bank statements", "flexible scenarios", "exceptions"],
    exceptionFriendly: true,
    highDepositUtilization: false,
  },
  "forward lending": {
    strengths: ["non-qm", "flexible underwriting", "exceptions", "scenario-based lending"],
    exceptionFriendly: true,
    highDepositUtilization: false,
  },
  "cake mortgage": {
    strengths: ["exceptions", "flexible underwriting", "non-qm scenarios requiring manual review"],
    exceptionFriendly: true,
    highDepositUtilization: false,
  },
};

/** Normalize a lender name for seeded-profile lookup (case/space tolerant). */
export function normalizeLenderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The catalog rows that actually exist AND carry a seeded profile. */
export interface ResolvedProfile {
  lender: Lender;
  profile: SeededLenderProfile;
}

export function resolveSeededProfiles(lenders: Lender[]): ResolvedProfile[] {
  const out: ResolvedProfile[] = [];
  for (const lender of lenders) {
    if (!lender.active || lender.isSampleData) continue;
    const profile = SEEDED_LENDER_PROFILES[normalizeLenderName(lender.name)];
    if (profile) out.push({ lender, profile });
  }
  return out;
}

// ---------------------------------------------------------------------------
// EXCEPTION routing (spec §2) — "who is good with exceptions / flexible /
// weird file / outside the box / common-sense exception / one-off scenario".
// Priority: admin-curated flexible flags on the real catalog FIRST (they are
// verification-adjacent), then the user-supplied exception-friendly names.
// ---------------------------------------------------------------------------
export interface ExceptionRouteResult {
  /** Lender names to surface, in disclosure order, de-duplicated. */
  recommended: string[];
  /** Which names came from the user-supplied seed list (vs catalog flags). */
  seededNames: string[];
  /** Which names came only from real catalog flags (bankStatementFlexible). */
  catalogFlaggedNames: string[];
}

export function routeExceptions(catalog: { lenders: Lender[]; programs: Program[] }): ExceptionRouteResult {
  const lenderById = new Map(catalog.lenders.map((l) => [l.id, l]));
  const catalogFlagged = new Set<string>();
  for (const p of catalog.programs) {
    if (!p.active || p.isSampleData || !p.bankStatementFlexible) continue;
    const lender = lenderById.get(p.lenderId);
    if (lender && lender.active && !lender.isSampleData) catalogFlagged.add(lender.name);
  }
  const seeded = resolveSeededProfiles(catalog.lenders)
    .filter((r) => r.profile.exceptionFriendly)
    .map((r) => r.lender.name);

  // De-duplicate while keeping flag-grounded names ahead of seed-only names.
  const recommended: string[] = [];
  const seen = new Set<string>();
  for (const name of [...catalogFlagged, ...seeded]) {
    const key = normalizeLenderName(name);
    if (!seen.has(key)) {
      seen.add(key);
      recommended.push(name);
    }
  }
  return {
    recommended,
    seededNames: seeded,
    catalogFlaggedNames: [...catalogFlagged],
  };
}

// ---------------------------------------------------------------------------
// BUSINESS DEPOSIT UTILIZATION routing (spec §3) — "who lets me use the most
// deposits / 100% of deposits / best bank statement program / best expense
// factor / highest qualifying income". Priority = seeded high-utilization
// names (Greenbox, Orion) resolved against the live catalog, in user order.
// ---------------------------------------------------------------------------
export interface DepositUtilizationResult {
  priorityLenders: string[];
}

export function pickDepositPriority(catalog: { lenders: Lender[]; programs: Program[] }): DepositUtilizationResult {
  const lenderById = new Map(catalog.lenders.map((l) => [l.id, l]));
  const out: string[] = [];
  const seen = new Set<string>();

  // 1) User-seeded high-utilization lenders, only if present in the catalog.
  for (const r of resolveSeededProfiles(catalog.lenders)) {
    if (!r.profile.highDepositUtilization) continue;
    const key = normalizeLenderName(r.lender.name);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r.lender.name);
    }
  }

  // 2) Fallback: any admin-curated bank-statement specialist not already named,
  //    so new uploads can enter the answer without code changes.
  for (const p of catalog.programs) {
    if (!p.active || p.isSampleData) continue;
    if (!p.bankStatementFlexible && !p.bankStatementCleanExecution) continue;
    const lender = lenderById.get(p.lenderId);
    if (!lender || !lender.active || lender.isSampleData) continue;
    const key = normalizeLenderName(lender.name);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(lender.name);
    }
  }
  return { priorityLenders: out };
}

// ---------------------------------------------------------------------------
// DSCR universe sizing (spec §§4-7). Never answer "best DSCR lender" with one
// name: first classify the borrower, then decide whether the answer is "most
// DSCR lenders" (experienced, strong profile) or a genuinely narrowed set
// (first-time buyer/investor, or a specific constraint). FTHB and FTI are
// DELIBERATELY separate axes (spec §7) — this map keeps them that way.
// ---------------------------------------------------------------------------
export type DscrBorrowerClass =
  | "experienced_investor" // has investor track record
  | "homeowner_first_time_investor" // owns/owned a home, never an investment
  | "first_time_homebuyer_and_investor" // never owned residential property at all
  | "unknown";

export function classifyDscrBorrower(v: AssistantVitals): DscrBorrowerClass {
  if (v.firstTimeHomebuyer === true) return "first_time_homebuyer_and_investor";
  if (v.firstTimeInvestor === true) return "homeowner_first_time_investor";
  if (v.firstTimeInvestor === false && v.firstTimeHomebuyer === false) return "experienced_investor";
  return "unknown";
}

export interface DscrUniverseAssessment {
  borrowerClass: DscrBorrowerClass;
  /** True when the profile is strong enough that MOST DSCR lenders plausibly
   *  fit and the differentiator becomes pricing/leverage/PPP/reserves — the
   *  spec §5 case. */
  broadUniverse: boolean;
  /** Catalog programs that CLEAR the hard first-time gates, ranked by leverage
   *  (baseMaxLtv desc). For experienced/broad cases this is intentionally not
   *  narrowed to a fixed list — the model ranks from the full eligible set. */
  fthFriendly: Array<{ lenderName: string; programName: string; baseMaxLtv: number; minFico: number }>;
}

export function evaluateDscrUniverse(
  catalog: { lenders: Lender[]; programs: Program[] },
  v: AssistantVitals
): DscrUniverseAssessment {
  const borrowerClass = classifyDscrBorrower(v);
  const lenderById = new Map(catalog.lenders.map((l) => [l.id, l]));

  const dscrPrograms = catalog.programs.filter(
    (p) => p.active && !p.isSampleData && p.incomeDocTypes.includes("dscr")
  );

  const strongProfile =
    borrowerClass === "experienced_investor" &&
    (v.fico ?? 0) >= 705 &&
    (v.dscr === undefined || v.dscr >= 1.0);
  // §5: experienced investor ~705+ with acceptable DSCR/reserves on a standard
  // property → the lender universe is broad; rank by what remains.
  const broadUniverse = strongProfile && v.firstTimeInvestor !== true;

  const fthFriendly = dscrPrograms
    .filter((p) => {
      // First-time gates are the discriminator for the narrow case.
      if (p.experiencedInvestorRequired === true) return false;
      if (borrowerClass === "first_time_homebuyer_and_investor" && p.firstTimeHomebuyerAllowed === false) return false;
      if (borrowerClass !== "experienced_investor" && p.firstTimeInvestorAllowed === false) return false;
      return true;
    })
    .map((p) => {
      const lender = lenderById.get(p.lenderId);
      return {
        lenderName: lender?.name ?? "(unknown lender)",
        programName: p.name,
        baseMaxLtv: p.baseMaxLtv,
        minFico: p.minFico,
      };
    })
    .filter((r) => r.lenderName !== "(unknown lender)")
    .sort((a, b) => b.baseMaxLtv - a.baseMaxLtv || a.minFico - b.minFico);

  return { borrowerClass, broadUniverse, fthFriendly };
}

// ---------------------------------------------------------------------------
// Disclosure boilerplate — the exact caveats the model must attach so a
// routing suggestion is never mistaken for an approval (spec §§2-3, 13-14).
// ---------------------------------------------------------------------------
export const EXCEPTION_DISCLOSURE =
  "These lenders tend to be more receptive to exception requests, particularly when the file has strong compensating factors. Exceptions are case-by-case and should be discussed with the lender's AE.";

export const DEPOSIT_UTILIZATION_DISCLOSURE =
  "May allow up to 100% of eligible business deposits in qualifying situations. The percentage actually used depends on the business type, the applicable expense factor, ownership percentage, transfers, non-business deposits, loans, refunds, chargebacks and one-time deposits — confirm the calculation with the lender's AE.";

/** Compensating factors the assistant should proactively request/analyze when
 *  a scenario narrowly misses a guideline (spec §§2, 15). */
export const COMPENSATING_FACTOR_KEYS = [
  "fico",
  "ltv",
  "reserves",
  "mortgage history",
  "investor experience",
  "dscr",
  "loan amount",
  "property type",
  "overall credit profile",
  "strength of income documentation",
  "assets",
  "payment shock",
  "reason the exception is being requested",
] as const;
