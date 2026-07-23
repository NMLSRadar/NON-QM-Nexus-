import type { Citizenship, IncomeDocType, LoanPurpose, Occupancy, PropertyType } from "@/domain/types/enums";

/**
 * Voice-intake vital slots.
 *
 * A spoken scenario must resolve all eight vitals before analysis runs
 * (the user speaks 6–8 details; LTV counts as resolved when it is either
 * stated or derivable from property value + loan amount, and any one of
 * {value, loan amount, LTV} may be derived from the other two).
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
};

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
  citizenship?: Captured<Citizenship>;
  firstTimeInvestor?: boolean;
  shortTermRental?: boolean;
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
