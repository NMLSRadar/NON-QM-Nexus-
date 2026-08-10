import type {
  Citizenship,
  IncomeDocType,
  LoanPurpose,
  Occupancy,
  PropertyType,
  Vesting,
} from "../types/enums";

/**
 * Chatbot Stage A output — a structured, deterministic parse of an ad-hoc
 * chat question. Produced by src/domain/chat/parse.ts with NO model call, so
 * intent classification is testable, versionable, and free. Stage B (the
 * tool loop + narration in src/lib/ai/chatPipeline.ts) consumes this object;
 * it never re-derives entities from raw text.
 */

export type ChatIntent =
  | "superlative_lookup" // min/max of a numeric attribute ("who has the lowest down payment for DSCR?")
  | "availability_lookup" // who supports a feature/borrower type ("who has ITIN loans?")
  | "threshold_lookup" // floor/ceiling across the whole library ("lowest FICO allowed in non-QM?")
  | "scenario_triage" // partial borrower facts -> candidate programs
  | "program_detail" // facts about one named lender/program
  | "comparison" // A vs B
  | "process_help" // exceptions, turn times, how-to
  | "definition" // industry terminology
  | "app_navigation" // where is X in the product
  | "out_of_scope";

export type TargetMetric =
  | "min_down_payment"
  | "max_ltv"
  | "min_fico"
  | "max_dti"
  | "min_dscr"
  | "min_reserves"
  | "min_loan_amount"
  | "max_loan_amount"
  | "min_seasoning";

export type CreditEvent =
  | "bk7"
  | "bk13"
  | "foreclosure"
  | "short_sale"
  | "deed_in_lieu"
  | "mortgage_lates";

/** Structured `NxDDxM` housing-late shorthand — e.g. "2x30x12" = two 30-day
 * lates in the trailing 12 months. */
export interface LatePattern {
  count: number;
  days: 30 | 60 | 90 | 120;
  lookbackMonths: number;
  raw: string;
}

export interface ParsedEntities {
  docType?: IncomeDocType[];
  citizenship?: Citizenship[];
  occupancy?: Occupancy[];
  purpose?: LoanPurpose[];
  propertyType?: PropertyType[];
  state?: string;
  fico?: number;
  ltv?: number;
  loanAmount?: number;
  dscr?: number;
  creditEvents?: CreditEvent[];
  latePattern?: LatePattern;
  vesting?: Vesting[];
  /** Free-form feature tags: io, ppp_options, non_warrantable, str,
   * first_time_investor, first_time_homebuyer, no_ratio, gift_funds, ... */
  features?: string[];
  /** Months of self-employment stated ("self-employed 18 months"). */
  selfEmploymentMonths?: number;
  /** Fuzzy-matched lender names found in the question (resolved against the
   * caller's catalog when parse is given the known-name list). */
  lenderNames?: string[];
  /** Near-miss lender names for a "did you mean" path. */
  lenderNameSuggestions?: string[];
  /** A lender-shaped name in the question that matches NOTHING in the
   * caller's catalog — the answer must be "not in your library", never a
   * general-market answer or an invented fact. */
  unknownLenderName?: string;
}

export interface ParsedQuery {
  intent: ChatIntent;
  normalizedText: string;
  entities: ParsedEntities;
  targetMetric?: TargetMetric;
  direction?: "min" | "max";
  /** Fields whose absence genuinely flips the answer (at most one clarifying
   * question is ever asked; otherwise Stage B proceeds with a stated
   * assumption). */
  missingCriticalFields: string[];
  /** 0..1 — deterministic heuristic; low confidence routes to a clarifying
   * question or an honest "here's what I understood" preamble. */
  confidence: number;
  /** Set when the question edges toward misrepresentation / advice we must
   * decline (occupancy fraud, protected class, legal/tax advice). */
  guardrailFlag?: "misrepresentation" | "protected_class" | "legal_tax_advice" | "pricing";
}
