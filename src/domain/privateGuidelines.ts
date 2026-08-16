import type { Lender } from "@/domain/types/program";

/**
 * LENDERS THAT DO NOT PUBLICLY PUBLISH GUIDELINES (2026-08-16).
 *
 * A small, intentional class of catalog lenders — UWM ("United Wholesale
 * Mortgage") and Change ("Change Wholesale") — that keep their Non-QM
 * underwriting guidelines, rate sheets, and program matrices OUT of the
 * public domain (broker-portal login / direct AE distribution only).
 *
 * These lenders remain fully listed in the directory (name, contact,
 * posture, membership posture) and can still surface in scenario
 * recommendations, but ANY guideline figure attributed to them is derived
 * from public reporting, not from the lender's own published matrix — so
 * every surface that shows them must carry the disclosure below. No
 * guideline content is ever shown as confirmed for these lenders.
 *
 * Matching is by normalized lender name (same convention as
 * lenderIntelligence.SEEDED_LENDER_PROFILES) so the disclosure follows the
 * lender across every surface — directory cards, lender detail pages, and
 * scenario match cards — without a schema change. If a lender later starts
 * publishing its matrix, remove the entry (or extend this module with a
 * catalog-backed flag) and the disclaimers disappear everywhere at once.
 */
export interface PrivateGuidelinesLender {
  /** Canonical catalog name (as stored in the lenders table). */
  name: string;
  /** The exact record-level disclosure (user-specified wording). */
  summary: string;
  /** Longer editorial copy shown in the prominent banner. */
  detail: string;
}

export const PRIVATE_GUIDELINE_LENDERS: PrivateGuidelinesLender[] = [
  {
    name: "United Wholesale Mortgage",
    summary: "Guidelines are not publicly published. Contact your AE for current terms.",
    detail:
      "United Wholesale Mortgage keeps its Non-QM underwriting guidelines, rate sheets, and program matrix inside its broker portal. Any figures shown on this page come from public reporting and can change without notice — confirm current terms with your UWM Account Executive before submitting.",
  },
  {
    name: "Change Wholesale",
    summary: "Guidelines are not publicly published. Contact your AE for current terms.",
    detail:
      "Change Wholesale distributes its Non-QM guidelines directly to approved brokers rather than publishing them publicly. Any figures shown on this page come from public reporting and can change without notice — confirm current terms with your Change Account Executive before submitting.",
  },
];

/** Normalize a lender name for lookup (case/space tolerant, same as
 * lenderIntelligence). */
export function normalizeLenderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when the lender keeps its guidelines out of public distribution. */
export function isPrivateGuidelinesLender(name: string): boolean {
  return getPrivateGuidelinesInfo(name) !== null;
}

/** Lookup a private-guidelines lender by its display name. */
export function getPrivateGuidelinesInfo(name: string): PrivateGuidelinesLender | null {
  if (!name) return null;
  const key = normalizeLenderName(name);
  return PRIVATE_GUIDELINE_LENDERS.find((l) => normalizeLenderName(l.name) === key) ?? null;
}

/** Names of the private-guidelines lenders that actually exist in a catalog. */
export function privateGuidelinesLendersInCatalog(lenders: Lender[]): Lender[] {
  const names = new Set(PRIVATE_GUIDELINE_LENDERS.map((l) => normalizeLenderName(l.name)));
  return lenders.filter((l) => l.active && !l.isSampleData && names.has(normalizeLenderName(l.name)));
}