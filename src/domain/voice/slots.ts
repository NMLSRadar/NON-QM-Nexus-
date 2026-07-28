import type { Citizenship, IncomeDocType, InvestorExperience, LoanPurpose, Occupancy, PropertyType, Vesting } from "@/domain/types/enums";

/**
 * Voice-intake vital slots.
 *
 * A spoken scenario must resolve all NINE CORE vitals before analysis runs
 * (the user speaks the details; LTV counts as resolved when it is either
 * stated or derivable from property value + loan amount, and any one of
 * {value, loan amount, LTV} may be derived from the other two). Citizenship
 * classification is a core vital too — it gates real program eligibility
 * downstream (baseChecks.ts), so it's asked for like any other required
 * field rather than silently defaulted; when nothing about it was ever
 * said, it stays unresolved and the assistant keeps asking, exactly like
 * FICO or property type.
 *
 * Three EXTRA vitals (first-time homebuyer, investor experience, title
 * vesting) are captured, highlighted, and fed into lender matching whenever
 * they're mentioned, but do not block `readyToAnalyze` — forcing three more
 * mandatory questions on every scenario (including ones where they're
 * immaterial, e.g. a primary-residence full-doc purchase) would be a much
 * larger behavior change than requested. See EXTRA_VITAL_KEYS below.
 */

export const VITAL_KEYS = [
  "loanPurpose",
  "occupancy",
  "propertyType",
  "propertyValue",
  "loanAmount",
  "ltv",
  "fico",
  "incomeDocType",
  "citizenship",
] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];

export const VITAL_LABELS: Record<VitalKey, string> = {
  loanPurpose: "Purchase or refinance",
  occupancy: "Occupancy",
  propertyType: "Property type",
  propertyValue: "Property value",
  loanAmount: "Loan amount",
  ltv: "LTV",
  fico: "Credit score",
  incomeDocType: "Income documentation",
  citizenship: "Citizenship classification",
};

export const VITAL_QUESTIONS: Record<VitalKey, string> = {
  loanPurpose: "Is this a purchase or a refinance?",
  occupancy: "How is it occupied — primary residence, second home, or investment?",
  propertyType: "What's the property type (single-family, condo, townhome, 2–4 unit, rural…)?",
  propertyValue: "What's the property value or purchase price?",
  loanAmount: "What loan amount are you targeting?",
  ltv: "What LTV are you targeting (or give me the loan amount and value)?",
  fico: "What's the credit score?",
  incomeDocType: "How is income documented — bank statements, DSCR, full doc, P&L, 1099, or asset depletion?",
  citizenship: "What's the borrower's citizenship — U.S. citizen, permanent resident, non-permanent resident, ITIN borrower, or foreign national?",
};

/** Additional, non-blocking vitals — surfaced in the UI and used in
 * matching when captured, but never gate `readyToAnalyze`. */
export const EXTRA_VITAL_KEYS = ["firstTimeHomebuyer", "investorExperience", "vesting", "state"] as const;
export type ExtraVitalKey = (typeof EXTRA_VITAL_KEYS)[number];

export const EXTRA_VITAL_LABELS: Record<ExtraVitalKey, string> = {
  firstTimeHomebuyer: "First-time homebuyer",
  investorExperience: "Investor experience",
  vesting: "Title vesting",
  state: "Property state",
};

export const EXTRA_VITAL_QUESTIONS: Record<ExtraVitalKey, string> = {
  firstTimeHomebuyer: "Has the borrower owned a primary residence before?",
  investorExperience: "Has the borrower previously owned an investment property?",
  vesting: "Will title be held individually, in an LLC, corporation, or trust?",
  state: "What state is the property located in?",
};

/** Refinance-only conditional vital — captured and used for current-lien
 * LTV / equity / cash-out calculations whenever mentioned, but (like the
 * EXTRA vitals above) never counted toward the 8-vital gate: on a purchase
 * it's simply irrelevant and hidden; on a refinance it's genuinely useful
 * but the new requested loan amount + property value alone are already
 * enough to run matching, so it must not block the first results. */
export const REFI_VITAL_KEY = "existingLienBalance" as const;
export const REFI_VITAL_LABEL = "Current loan balance";
export const REFI_VITAL_QUESTION = "About how much do they currently still owe on the property?";

/** A value heard in (or derived from) the transcript, with provenance. */
export interface Captured<T> {
  value: T;
  /** The transcript fragment (or derivation) this came from — shown in the UI. */
  source: string;
  /** True when derived or guessed rather than explicitly stated; confirm before relying on it. */
  inferred?: boolean;
}

/** Everything the deterministic extractor can pull from a transcript. */
export interface VoiceExtraction {
  loanPurpose?: Captured<LoanPurpose>;
  /** "refinance" was said without rate-term vs cash-out — subtype must be clarified. */
  refinancePendingSubtype?: boolean;
  occupancy?: Captured<Occupancy>;
  propertyType?: Captured<PropertyType>;
  units?: number;
  propertyValue?: Captured<number>;
  loanAmount?: Captured<number>;
  statedLtv?: Captured<number>;
  fico?: Captured<number>;
  incomeDocType?: Captured<IncomeDocType>;
  bankStatementMonths?: 12 | 24;
  bankStatementKind?: "personal" | "business";
  requestedCashOut?: Captured<number>;
  /** Refinance-only: what the borrower currently owes on the subject
   * property (distinct from loanAmount, the NEW requested loan). */
  existingLienBalance?: Captured<number>;
  /** confidence: "high" for an unambiguous ITIN/citizenship phrasing;
   * "medium" only for the ambiguous "I-10"/"I ten"/"eye ten" ITIN surface
   * form, resolved solely because nearby mortgage-borrower context
   * anchored it (see classifyCitizenship in extract.ts). */
  citizenship?: Captured<Citizenship> & { confidence?: "high" | "medium" };
  /** Legacy simple flag — still populated for backward compatibility; prefer investorExperience. */
  firstTimeInvestor?: boolean;
  firstTimeHomebuyer?: Captured<boolean>;
  investorExperience?: Captured<InvestorExperience>;
  vesting?: Captured<Vesting>;
  shortTermRental?: boolean;
  /** Property state — a 2-letter USPS code (e.g. "GA"), recognized from a
   * full state name or, only in an unambiguous anchored phrase ("in the
   * state of TX", "located in TX"), a spoken abbreviation. Used for the
   * real state-licensing eligibility check in baseChecks.ts. */
  state?: Captured<string>;
  /** Assumptions and notes accumulated during extraction, surfaced to the user. */
  notesFragments: string[];
}

export function emptyExtraction(): VoiceExtraction {
  return { notesFragments: [] };
}

/** Later utterances win for fields they define; notes accumulate. */
export function mergeExtractions(base: VoiceExtraction, next: VoiceExtraction): VoiceExtraction {
  const merged: VoiceExtraction = { ...base, ...stripUndefined(next) };
  merged.notesFragments = [...base.notesFragments, ...next.notesFragments];
  // A resolved purpose clears a previously pending refinance subtype.
  if (next.loanPurpose && !next.refinancePendingSubtype) merged.refinancePendingSubtype = false;
  return merged;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
