import type { CompensatingFactorType } from "../compensatingFactors/types";
import type { LenderFlexibilityProfile } from "./types";

/**
 * Seeded posture defaults — org-editable, `source: 'org_editorial'`,
 * `isVerified: false`. These are EDITORIAL reads on real companies' market
 * posture, NOT guideline data: the real lender records carry posture
 * metadata only, and their actual guidelines stay empty until an admin
 * loads verified ones. They are deliberately NOT mixed into the fictional
 * demo program data (sampleLenders.ts) — the sample-data disclaimer and
 * the editorial disclaimer are different labels and never conflate.
 *
 * Naming: canonical legal/trade names normalized per the admin-first-load
 * rule; aliases cover common abbreviations and speech-to-text variants
 * (the spec's "Cale Mortgage" resolves to Cake Mortgage — the entity this
 * repo's guideline-import records document — via alias).
 */

const TYPICAL_FACTORS: CompensatingFactorType[] = [
  "reserves_surplus",
  "ltv_cushion",
  "dti_cushion",
  "clean_housing_history",
  "credit_depth",
];

const SEED_REVIEWED_AT = "2026-08-10";

interface SeedRow {
  canonicalName: string;
  aliases: string[];
  posture: LenderFlexibilityProfile["posture"];
  pricingTendency: LenderFlexibilityProfile["pricingTendency"];
  postureNotes: string;
}

const EXCEPTION_BASED_NOTE =
  "Known for broader guideline flexibility and a working exception process. Exceptions run through the AE with compensating factors — never guaranteed. Broader flexibility typically carries a rate premium (directional only).";
const RIGID_NOTE =
  "Tighter guidelines, not typically exception-driven. Tighter guidelines generally correlate with better pricing (directional only — no figures quoted or modeled).";

const SEED_ROWS: SeedRow[] = [
  // Posture: exception_based — flexible guidelines and a real exception process
  { canonicalName: "Greenbox Loans", aliases: ["Greenbox", "GBX", "Green Box", "Greenbox Lending"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "Forward Lending", aliases: ["Forward"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "Acra Lending", aliases: ["Acra", "Citadel Servicing"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "LoanStream Mortgage", aliases: ["LoanStream", "Loan Stream", "LDWholesale"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "Orion Lending", aliases: ["Orion"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "Cake Mortgage", aliases: ["Cake", "Cale Mortgage", "Cale"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "Champions Funding", aliases: ["Champions", "Champion Funding"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "ClearEdge Lending", aliases: ["ClearEdge", "Clear Edge"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "FundLoans", aliases: ["Fund Loans", "FundLoans Capital"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "HomeXpress Mortgage", aliases: ["HomeXpress", "Home Xpress", "HomeX"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },
  { canonicalName: "NQM Funding", aliases: ["NQMF", "NQM"], posture: "exception_based", pricingTendency: "typically_more_aggressive", postureNotes: EXCEPTION_BASED_NOTE },

  // Posture: rigid — tighter guidelines, typically better priced
  { canonicalName: "Logan Finance", aliases: ["Logan"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "Angel Oak Mortgage Solutions", aliases: ["Angel Oak", "AOMS"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "UWM", aliases: ["United Wholesale Mortgage"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "Newfi", aliases: ["Newfi Lending", "New Fi"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "NewRez", aliases: ["New Rez", "NewRez Wholesale"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "Verus Mortgage Capital", aliases: ["Verus"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "JMAC Lending", aliases: ["JMAC"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "PennyMac", aliases: ["Penny Mac", "PennyMac TPO"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "Deephaven Mortgage", aliases: ["Deephaven", "Deep Haven"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
  { canonicalName: "First National Bank of America", aliases: ["FNBA"], posture: "rigid", pricingTendency: "typically_better_priced", postureNotes: RIGID_NOTE },
];

/** Platform seed defaults (organizationId null). Orgs override per lender —
 * see mergePostureProfiles in directory.ts. */
export const defaultPostureSeed: LenderFlexibilityProfile[] = SEED_ROWS.map((row) => ({
  id: `posture_seed_${row.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
  organizationId: null,
  canonicalName: row.canonicalName,
  aliases: row.aliases,
  posture: row.posture,
  postureNotes: row.postureNotes,
  pricingTendency: row.pricingTendency,
  exceptionsConsidered: row.posture === "exception_based",
  exceptionChannel: row.posture === "exception_based" ? "AE submission" : undefined,
  typicalCompensatingFactorsRequired: row.posture === "exception_based" ? TYPICAL_FACTORS : [],
  source: "org_editorial",
  isVerified: false,
  lastReviewedAt: SEED_REVIEWED_AT,
  confidence: "medium",
}));
