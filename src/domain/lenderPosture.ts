/**
 * Lender flexibility / posture profiles (chatbot upgrade Part 2 §1-2).
 *
 * THIS LAYER IS EXPERIENTIAL/EDITORIAL METADATA ABOUT REAL COMPANIES — NOT
 * PUBLISHED GUIDELINE DATA. It is stored separately (source: 'org_editorial',
 * isVerified: false by default), never rendered inside a guideline citation
 * block, never allowed to drive a pass/fail rule outcome, a match score, or an
 * eligibility determination. Every value is org-editable and org-overridable;
 * one org's read on a lender is not another's. Results are tagged sourceType
 * 'editorial' so the answer renderer always applies the editorial label.
 *
 * Real lender names here carry posture metadata ONLY — their actual
 * guidelines stay empty until an admin loads verified ones. A guideline
 * question about a real lender with no verified guidelines loaded is answered
 * "no verified guidelines in the library yet", never inferred from posture.
 */

import type { Lender } from "@/domain/types/program";

export type GuidelinePosture = "exception_based" | "moderate" | "rigid";
export type PricingTendency = "typically_more_aggressive" | "typically_mid" | "typically_better_priced" | "unknown";
export type PostureSource = "org_editorial" | "lender_published" | "ae_confirmed";

export interface LenderFlexibilityProfile {
  id: string;
  organizationId: string;
  lenderId: string;
  posture: GuidelinePosture;
  postureNotes?: string;
  pricingTendency: PricingTendency;
  exceptionsConsidered: boolean;
  exceptionChannel?: string;
  typicalCompensatingFactorsRequired: string[];
  source: PostureSource;
  isVerified: boolean;
  lastReviewedAt: string | null;
  confidence: "low" | "medium" | "high";
}

export const POSTURE_STALENESS_DAYS = 180;

export const EDITORIAL_DISCLAIMER =
  "Internal guidance based on market experience — not a lender guideline or commitment.";

export const PRICING_EXPLAINER =
  "As a general tendency, tighter guidelines correlate with better pricing, and broader guideline flexibility correlates with a rate premium. This is a directional pattern only — pricing varies by lender, changes frequently, and is not quoted or modeled in this platform.";

/** Staleness window is a configurable constant (default 180 days). */
export function isStale(profile: Pick<LenderFlexibilityProfile, "lastReviewedAt">, now: Date = new Date(), windowDays = POSTURE_STALENESS_DAYS): boolean {
  if (!profile.lastReviewedAt) return true;
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return new Date(profile.lastReviewedAt) < cutoff;
}

/** Trade-name aliases so "Greenbox"/"GBX"/"Home Xpress" resolve to one record. */
export const LENDER_ALIASES: Record<string, string[]> = {
  "greenbox loans": ["greenbox", "gbx", "greenbox mortgage"],
  "homexpress mortgage": ["homexpress", "home xpress", "home express"],
  "forward lending": ["forward", "forward financial"],
  "loanstream mortgage": ["loanstream", "loan stream", "lsm"],
  "cale mortgage": ["cale", "cale lending"],
  "acra lending": ["acra", "acra lending group"],
  "nqm funding": ["nqm", "nqm funding llc"],
};

export function canonicalLenderKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveAlias(raw: string): string {
  const key = canonicalLenderKey(raw);
  for (const [canonical, aliases] of Object.entries(LENDER_ALIASES)) {
    if (key === canonical || aliases.includes(key)) return canonical;
  }
  return key;
}

// ---------------------------------------------------------------------------
// Seed values — org-editable defaults, source 'org_editorial', isVerified false.
// ---------------------------------------------------------------------------

export const SEED_EXCEPTION_BASED: Array<{ name: string; channel: string }> = [
  { name: "Greenbox Loans", channel: "AE submission" },
  { name: "Forward Lending", channel: "AE submission" },
  { name: "Acra Lending", channel: "AE submission" },
  { name: "LoanStream Mortgage", channel: "AE submission" },
  { name: "Orion Lending", channel: "AE submission" },
  { name: "Cale Mortgage", channel: "AE submission" },
  { name: "Champions Funding", channel: "AE submission" },
  { name: "ClearEdge Lending", channel: "AE submission" },
  { name: "FundLoans", channel: "AE submission" },
  { name: "HomeXpress Mortgage", channel: "AE submission" },
  { name: "NQM Funding", channel: "AE submission" },
];

export const SEED_RIGID: string[] = [
  "Logan Finance",
  "Angel Oak Mortgage Solutions",
  "UWM",
  "Newfi",
  "NewRez",
  "Verus Mortgage Capital",
  "JMAC Lending",
  "PennyMac",
  "Deephaven Mortgage",
  "First National Bank of America",
];

/** The org-editable default profiles (EDGE: seed data only — admin can edit/override). */
export function seedProfiles(organizationId: string): LenderFlexibilityProfile[] {
  const profiles: LenderFlexibilityProfile[] = [];
  const now = new Date().toISOString();
  for (const { name, channel } of SEED_EXCEPTION_BASED) {
    profiles.push({
      id: `seed_${canonicalLenderKey(name).replace(/\s+/g, "_")}`,
      organizationId,
      lenderId: name, // lenderId is resolved to a real catalog row by the caller; seed uses the name
      posture: "exception_based",
      postureNotes: "Known for more flexible guidelines and a working exception process.",
      pricingTendency: "typically_more_aggressive",
      exceptionsConsidered: true,
      exceptionChannel: channel,
      typicalCompensatingFactorsRequired: ["reserves_surplus", "ltv_cushion", "dti_cushion", "housing_history", "fico_cushion"],
      source: "org_editorial",
      isVerified: false,
      lastReviewedAt: now,
      confidence: "medium",
    });
  }
  for (const name of SEED_RIGID) {
    profiles.push({
      id: `seed_${canonicalLenderKey(name).replace(/\s+/g, "_")}`,
      organizationId,
      lenderId: name,
      posture: "rigid",
      postureNotes: "Tighter guidelines, not typically exception-driven.",
      pricingTendency: "typically_better_priced",
      exceptionsConsidered: false,
      typicalCompensatingFactorsRequired: [],
      source: "org_editorial",
      isVerified: false,
      lastReviewedAt: now,
      confidence: "medium",
    });
  }
  return profiles;
}

export interface LenderPostureView {
  lenderId: string;
  lenderName: string;
  posture: GuidelinePosture;
  postureNotes?: string;
  pricingTendency: PricingTendency;
  exceptionsConsidered: boolean;
  exceptionChannel?: string;
  typicalCompensatingFactorsRequired: string[];
  isVerified: boolean;
  lastReviewedAt?: string;
  stale: boolean;
  sourceType: "editorial";
  /** True when this posture record is NOT tied to a lender present in the
   * caller's guideline catalog (the profile exists, guidelines may not). */
  lenderInCatalog: boolean;
}

/**
 * Resolve posture profiles for the caller's own catalog (tenant-scoped).
 * Profiles are matched to catalog lenders by name/alias; a profile whose
 * lender is NOT in the caller's catalog is still surfaced (posture is
 * org-editable metadata that can exist independently of loaded guidelines)
 * but flagged lenderInCatalog:false so a guideline answer is never inferred.
 */
export function getLenderPosture(
  profiles: LenderFlexibilityProfile[],
  catalogLenders: Lender[],
  filters: { posture?: GuidelinePosture; lenderIds?: string[] } = {},
  now: Date = new Date(),
): LenderPostureView[] {
  const catalogByName = new Map<string, Lender>();
  for (const l of catalogLenders) {
    catalogByName.set(canonicalLenderKey(l.name), l);
  }
  const out: LenderPostureView[] = [];
  for (const p of profiles) {
    if (filters.posture && p.posture !== filters.posture) continue;
    if (filters.lenderIds?.length && !filters.lenderIds.includes(p.lenderId)) continue;
    const key = resolveAlias(p.lenderId);
    const catalogLender = catalogByName.get(key);
    out.push({
      lenderId: p.lenderId,
      lenderName: catalogLender?.name ?? titleCase(p.lenderId),
      posture: p.posture,
      postureNotes: p.postureNotes,
      pricingTendency: p.pricingTendency,
      exceptionsConsidered: p.exceptionsConsidered,
      exceptionChannel: p.exceptionChannel,
      typicalCompensatingFactorsRequired: p.typicalCompensatingFactorsRequired,
      isVerified: p.isVerified,
      lastReviewedAt: p.lastReviewedAt ?? undefined,
      stale: isStale(p, now),
      sourceType: "editorial",
      lenderInCatalog: Boolean(catalogLender),
    });
  }
  // Deterministic order: exception-based first, then by name.
  const order: Record<GuidelinePosture, number> = { exception_based: 0, moderate: 1, rigid: 2 };
  return out.sort((a, b) => order[a.posture] - order[b.posture] || a.lenderName.localeCompare(b.lenderName));
}

/** Exception-based candidate lenders for "who considers exceptions" answers. */
export function exceptionCandidates(
  profiles: LenderFlexibilityProfile[],
  catalogLenders: Lender[],
  now: Date = new Date(),
): LenderPostureView[] {
  return getLenderPosture(profiles, catalogLenders, { posture: "exception_based" }, now);
}

/** Resolve a single lender's posture by name/alias; null when no profile on
 * record (the caller must render nothing, never an inferred badge). */
export function postureForLenderName(profiles: LenderFlexibilityProfile[], lenderName: string): GuidelinePosture | null {
  const key = resolveAlias(lenderName);
  for (const p of profiles) {
    if (resolveAlias(p.lenderId) === key) return p.posture;
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}