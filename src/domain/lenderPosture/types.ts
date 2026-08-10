import type { CompensatingFactorType } from "../compensatingFactors/types";

/**
 * Lender flexibility / posture layer (2026-08-10, chatbot upgrade Part 2).
 *
 * CRITICAL FRAMING: this is EXPERIENTIAL/EDITORIAL metadata about real
 * companies — market experience, not published guideline data. It is
 * architecturally separate from the guideline library:
 *  - it never drives a pass/fail rule outcome, a match score, or an
 *    eligibility determination (see tests/domain/postureIsolation.test.ts);
 *  - it never renders inside a guideline citation block;
 *  - every surface labels it with EDITORIAL_DISCLAIMER;
 *  - every value is org-editable and org-overridable — one org's read on a
 *    lender is not another's, and lender posture changes.
 */

export type GuidelinePosture = "exception_based" | "moderate" | "rigid";

export type PricingTendency =
  | "typically_more_aggressive" // broader guideline flexibility — typically carries a rate premium
  | "typically_mid"
  | "typically_better_priced" // tighter guidelines — typically correlate with better pricing
  | "unknown";

export type PostureSource = "org_editorial" | "lender_published" | "ae_confirmed";

export interface LenderFlexibilityProfile {
  id: string;
  /** null = platform seed default (applies until an org overrides it). */
  organizationId: string | null;
  /** Linked catalog lender record, when one exists. Posture can exist for a
   * real lender whose guidelines are NOT yet loaded — the reverse is what's
   * forbidden (posture must never stand in for guidelines). */
  lenderId?: string;
  /** Canonical legal/trade name the profile is keyed by. */
  canonicalName: string;
  /** Trade names / abbreviations resolved to this record by fuzzy matching
   * ("Greenbox", "GBX", "Home Xpress"). */
  aliases: string[];
  posture: GuidelinePosture;
  postureNotes: string;
  pricingTendency: PricingTendency;
  exceptionsConsidered: boolean;
  exceptionChannel?: string; // e.g. "AE submission", "credit committee"
  typicalCompensatingFactorsRequired: CompensatingFactorType[];
  source: PostureSource;
  isVerified: boolean; // default false
  lastReviewedAt: string | null; // ISO date
  confidence: "low" | "medium" | "high";
  deletedAt?: string | null;
  createdBy?: string;
  updatedBy?: string;
}

/** Attached to every surface that renders posture data. Editorial rows can
 * never be cited as a guideline source. */
export const EDITORIAL_DISCLAIMER =
  "Internal guidance based on market experience — not a lender guideline or commitment.";

/** The only permitted statement about the pricing/flexibility relationship.
 * HARD RULE: no rate, point, or price figures anywhere from this layer —
 * directional language only. */
export const PRICING_TENDENCY_EXPLAINER =
  "As a general tendency, tighter guidelines correlate with better pricing, and broader guideline flexibility correlates with a rate premium. This is a directional pattern only — pricing varies by lender, changes frequently, and is not quoted or modeled in this platform.";

/** Profiles older than this (days since lastReviewedAt) are flagged as
 * possibly stale in the assistant and the admin dashboard. Org-configurable
 * at the call sites that pass a different window. */
export const DEFAULT_POSTURE_STALENESS_DAYS = 180;

export const POSTURE_LABELS: Record<GuidelinePosture, string> = {
  exception_based: "Exception-friendly",
  moderate: "Moderate flexibility",
  rigid: "Rigid guidelines",
};

export const POSTURE_TOOLTIPS: Record<GuidelinePosture, string> = {
  exception_based:
    "Known for guideline flexibility and a working exception process. Exceptions require compensating factors and are never guaranteed.",
  moderate: "Middle-of-the-road guideline flexibility; exceptions are situational.",
  rigid: "Tighter guidelines with limited exception appetite; tighter guidelines generally correlate with better pricing.",
};
