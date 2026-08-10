import {
  LATE_PATTERN_REGEX,
  PHRASE_CORRECTIONS,
  TOKEN_CORRECTIONS,
} from "./normalizationDictionary";
import type { LatePattern } from "./types";

/**
 * Deterministic text normalization for the chatbot's Stage A parser. Applies
 * the version-controlled dictionary (phrase pass, then token pass), collapses
 * whitespace, and lowercases. Never calls a model.
 */
export function normalizeChatText(raw: string): string {
  let text = ` ${raw.toLowerCase().trim()} `;
  for (const [pattern, replacement] of PHRASE_CORRECTIONS) {
    text = text.replace(new RegExp(pattern.source, pattern.flags.includes("i") ? pattern.flags : pattern.flags + "i"), replacement);
  }
  text = text
    .split(/\s+/)
    .map((token) => {
      const stripped = token.replace(/[?!.,;:]+$/g, "");
      const suffix = token.slice(stripped.length);
      const corrected = TOKEN_CORRECTIONS[stripped];
      return corrected != null ? corrected + suffix : token;
    })
    .join(" ");
  return text.replace(/\s+/g, " ").trim();
}

/** Parse `NxDDxM` housing-late shorthand ("2x30x12") into structure. */
export function parseLatePattern(text: string): LatePattern | undefined {
  const m = text.match(LATE_PATTERN_REGEX);
  if (!m || m[1] == null || m[2] == null || m[3] == null) return undefined;
  return {
    count: parseInt(m[1], 10),
    days: parseInt(m[2], 10) as LatePattern["days"],
    lookbackMonths: parseInt(m[3], 10),
    raw: m[0].replace(/\s+/g, ""),
  };
}

/** Levenshtein distance — small inputs only (lender/program names). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr;
  }
  return prev[n] ?? 0;
}

export interface FuzzyNameMatch {
  name: string;
  /** true = confident enough to answer for this name directly; false = only
   * good enough for a "did you mean …?" suggestion, never a direct answer. */
  exact: boolean;
}

/**
 * Fuzzy lender/program name matching with a "did you mean" path. A name is
 * only a direct match when it appears verbatim (case-insensitive) or within
 * a small edit distance scaled to its length; anything weaker is returned as
 * a suggestion so the caller can ask, rather than answering for the wrong
 * lender.
 */
export function fuzzyMatchNames(question: string, knownNames: string[]): { matches: FuzzyNameMatch[]; suggestions: string[] } {
  const q = question.toLowerCase();
  const matches: FuzzyNameMatch[] = [];
  const suggestions: string[] = [];

  for (const name of knownNames) {
    const lower = name.toLowerCase();
    if (q.includes(lower)) {
      matches.push({ name, exact: true });
      continue;
    }
    // Compare each known name against every same-length word window in the
    // question so "greenbox lones" still finds "Greenbox Loans".
    const nameWords = lower.split(/\s+/);
    const qWords = q.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
    const maxDist = Math.max(2, Math.round(lower.length / 5));
    for (let i = 0; i + nameWords.length <= qWords.length; i++) {
      const window = qWords.slice(i, i + nameWords.length).join(" ");
      const dist = levenshtein(window, lower);
      if (dist === 0) {
        matches.push({ name, exact: true });
        break;
      }
      if (dist <= maxDist) {
        suggestions.push(name);
        break;
      }
      // First word alone is often distinctive ("greenbox", "acra").
      const qWord = qWords[i];
      const firstNameWord = nameWords[0];
      if (qWord != null && firstNameWord != null && firstNameWord.length >= 5) {
        const firstWordDist = levenshtein(qWord, firstNameWord);
        if (firstWordDist <= (firstNameWord.length >= 6 ? 2 : 1)) {
          suggestions.push(name);
          break;
        }
      }
    }
  }
  const matchedNames = new Set(matches.map((m) => m.name));
  return { matches, suggestions: [...new Set(suggestions)].filter((s) => !matchedNames.has(s)) };
}
