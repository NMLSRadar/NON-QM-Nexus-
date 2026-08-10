import { levenshtein } from "../chat/normalize";
import { defaultPostureSeed } from "./seed";
import { DEFAULT_POSTURE_STALENESS_DAYS, type GuidelinePosture, type LenderFlexibilityProfile } from "./types";

/**
 * Posture directory — resolution and org-override merging.
 *
 * ISOLATION GUARANTEE: nothing in this module is imported by the matching
 * engine (src/domain/matching/*, src/domain/rules/*, src/domain/analyze.ts).
 * Posture is display/advisory context only; match status and score come
 * from rules alone (locked in by tests/domain/postureIsolation.test.ts).
 */

/**
 * Merge org-level overrides over the platform seed. An org row for a
 * canonical name (case-insensitive) fully replaces the seed row — one org's
 * read on a lender never affects another org (each org's overrides are
 * fetched under its own RLS scope and merged per request).
 */
export function mergePostureProfiles(
  orgOverrides: LenderFlexibilityProfile[],
  seed: LenderFlexibilityProfile[] = defaultPostureSeed
): LenderFlexibilityProfile[] {
  const live = orgOverrides.filter((p) => p.deletedAt == null);
  const overridden = new Set(live.map((p) => p.canonicalName.toLowerCase()));
  return [...live, ...seed.filter((s) => !overridden.has(s.canonicalName.toLowerCase()))];
}

/** Resolve a lender name (typed by a user, or a catalog lender's name) to a
 * posture profile via canonical name, alias, or small-edit-distance fuzzy
 * match. Returns undefined when nothing matches — callers must render
 * NOTHING in that case (silence, not a guess). */
export function resolvePostureProfile(
  name: string,
  profiles: LenderFlexibilityProfile[]
): LenderFlexibilityProfile | undefined {
  const query = name.toLowerCase().replace(/\s*\((sample|demo)\)\s*$/i, "").trim();
  if (!query) return undefined;

  for (const profile of profiles) {
    const names = [profile.canonicalName, ...profile.aliases].map((n) => n.toLowerCase());
    if (names.some((n) => n === query || query.includes(n) || n.includes(query))) return profile;
  }
  // Fuzzy pass — small edit distance against canonical/alias names, scaled
  // to name length so "Greenbocks" still resolves but "Greenline" does not.
  for (const profile of profiles) {
    for (const n of [profile.canonicalName, ...profile.aliases].map((x) => x.toLowerCase())) {
      if (n.length >= 5 && levenshtein(query, n) <= Math.max(1, Math.floor(n.length / 6))) return profile;
    }
  }
  return undefined;
}

/** Find every posture profile mentioned by name anywhere in a free-text
 * question. Used by the chatbot's pricing/exception answers. */
export function findMentionedProfiles(text: string, profiles: LenderFlexibilityProfile[]): LenderFlexibilityProfile[] {
  const lower = text.toLowerCase();
  const hits: LenderFlexibilityProfile[] = [];
  for (const profile of profiles) {
    const names = [profile.canonicalName, ...profile.aliases].map((n) => n.toLowerCase());
    if (names.some((n) => n.length >= 3 && lower.includes(n))) hits.push(profile);
  }
  return hits;
}

export function isProfileStale(
  profile: LenderFlexibilityProfile,
  asOf: Date = new Date(),
  windowDays: number = DEFAULT_POSTURE_STALENESS_DAYS
): boolean {
  if (!profile.lastReviewedAt) return true;
  const reviewed = new Date(profile.lastReviewedAt).getTime();
  return asOf.getTime() - reviewed > windowDays * 24 * 60 * 60 * 1000;
}

export function profilesByPosture(
  profiles: LenderFlexibilityProfile[],
  posture: GuidelinePosture
): LenderFlexibilityProfile[] {
  return profiles.filter((p) => p.posture === posture);
}
