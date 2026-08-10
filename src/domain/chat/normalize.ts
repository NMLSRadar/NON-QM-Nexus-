/**
 * Normalization dictionary for the chatbot Stage A parser.
 *
 * Turns sloppy, speech-to-text-mangled broker phrasing into a canonical,
 * structured token stream the intent classifier and entity extractor can
 * work from reliably. Version-controlled here (not inline in a prompt) so
 * every mapping is testable and auditable.
 *
 * The literal REPLACEMENTS below are applied to the lowercased text BEFORE
 * tokenization. The classified phrases (intent/entity signals) are matched
 * against the normalized text afterwards.
 */

// ---------------------------------------------------------------------------
// 1. Literal token/typo replacements (speech-to-text + common misspellings).
//    Applied as whole-word/substring expansions on the normalized string.
//    Order matters: longer/more-specific phrases before shorter ones.
// ---------------------------------------------------------------------------

export interface Replacement {
  from: RegExp;
  to: string;
}

export const NORMALIZATION_REPLACEMENTS: Replacement[] = [
  // -- speech-to-text / typo errors for domain terms -------------------------
  { from: /\bmortgage lights?\b/g, to: "mortgage lates" },
  { from: /\bmortgage late(s)?\b/gi, to: "mortgage_lates" },
  { from: /\b(dcsr|dscr ratio|debt service coverage)\b/g, to: "dscr" },
  { from: /\bbank statment\b/g, to: "bank statement" },
  { from: /\bbank.statements?\b/g, to: "bank_statement" },
  { from: /\bassett depletion\b/g, to: "asset depletion" },
  { from: /\basset depletion\b/g, to: "asset_depletion" },
  { from: /\bitn\b|\bittin\b/g, to: "itin" },
  { from: /\bforeign national(s)?\b/g, to: "foreign_national" },
  { from: /\bnon[- ]?warrantable\b/g, to: "non_warrantable" },
  { from: /\bnon[- ]?warr\b/g, to: "non_warrantable" },
  { from: /\bprofit & loss\b|\bp&l only\b|\bprofit and loss\b/g, to: "pnl_only" },
  { from: /\bp&l\b|\bpnl\b/g, to: "pnl" },
  { from: /\bfull dock\b/g, to: "full doc" },
  { from: /\bfull[- ]?doc\b/g, to: "full_doc" },
  { from: /\b1099[- ]?only\b/g, to: "1099_only 1099" },
  { from: /\bw-?2\b/g, to: "w2" },
  { from: /\bwvo e\b|\bw-?voe\b/g, to: "wvoe" },
  { from: /\bairbnb\b|\bvrbo\b|\bshort[- ]?term rental(s)?\b/g, to: "str" },
  { from: /\bpass[- ]?through\b/g, to: "passthrough" },
  { from: /\bgreenbox\b/g, to: "greenbox loans" },
  { from: /\bgbx\b/g, to: "greenbox loans" },
  { from: /\bhome ?xpress\b/g, to: "homexpress mortgage" },
  // -- shorthand / abbreviations --------------------------------------------
  { from: /\bch ?13\b|\bchapter ?13\b|\bbk ?13\b/g, to: "bk13" },
  { from: /\bch ?7\b|\bchapter ?7\b|\bbk ?7\b/g, to: "bk7" },
  { from: /\bforeclosure\b|\bforeclosed\b/g, to: "fc" },
  { from: /\bshort sale\b/g, to: "ss" },
  { from: /\bdeed in lieu\b/g, to: "dil" },
  { from: /\bforbearance\b/g, to: "forbearance" },
  { from: /\bmodification\b/g, to: "modification" },
  { from: /\binterest[- ]only\b/g, to: "io" },
  { from: /\bpre[- ]payment penalty\b/g, to: "ppp" },
  { from: /\bcombined loan[- ]to[- ]value\b|\bcltv\b/g, to: "cltv" },
  { from: /\bprincipal, interest, taxes and insurance\b|\bpitia\b/g, to: "pitia" },
  { from: /\bnon[- ]?owner[- ]?occupied\b/g, to: "noo" },
  { from: /\bsingle[- ]?family residence\b|\bsingle[- ]?family\b/g, to: "sfr" },
  { from: /\b2[- ]?to[- ]?4 ?units?\b|\b2[- ]?4 ?units?\b/g, to: "2_4_unit" },
  { from: /\b5[- ]?to[- ]?8 ?units?\b|\b5[- ]?8 ?units?\b/g, to: "5_8_unit" },
  { from: /\b9[- ]?plus ?units?\b|\b9\+ ?units?\b/g, to: "9_plus_unit" },
  { from: /\bead\b/g, to: "ead" },
  { from: /\btrv\b/g, to: "trv" },
  { from: /\bllc\b/g, to: "llc" },
  { from: /\bcorp\b/g, to: "corporation" },
  { from: /\bno[- ]?ratio\b/g, to: "no_ratio" },
  { from: /\bowner[- ]?occupied\b|\bprimary residence\b|\bprimary residence purchase\b/g, to: "owner_occupied" },
  { from: /\bsecond home\b/g, to: "second_home" },
  { from: /\binvestment (?:property|purchase)\b|\brental property\b|\binvestor purchase\b/g, to: "investment_property" },
  { from: /\bcash[- ]?out\b/g, to: "cash_out" },
  { from: /\brate[- ]?and[- ]?term\b|\brate term\b/g, to: "rate_term" },
  { from: /\bpurchase\b/g, to: "purchase" },
  { from: /\bnon[- ]?permanent resident\b/g, to: "non_permanent_resident" },
  { from: /\bpermanent resident\b|\bgreen card\b/g, to: "permanent_resident" },
  { from: /\bfirst[- ]?time investor\b|\bnew investor\b/g, to: "first_time_investor" },
  { from: /\bfirst[- ]?time home ?buyer\b|\bnever owned a home\b/g, to: "first_time_homebuyer" },
  { from: /\bself[- ]?employed\b/g, to: "self_employed" },
  { from: /\bdown[- ]?payment\b|\bdown payment\b/g, to: "down_payment" },
  { from: /\bloan[- ]?to[- ]?value\b/g, to: "ltv" },
  { from: /\bdebt[- ]?to[- ]?income\b/g, to: "dti" },
  { from: /\breserves?\b/g, to: "reserves" },
  { from: /\bnmls\b/g, to: "nmls" },
  { from: /\bturn[- ]?times?\b/g, to: "turn_time" },
  { from: /\bclose[- ]?to[- ]?close\b/g, to: "ctc" },
];

/**
 * Apply the literal normalization replacements. Also collapses whitespace and
 * strips ASCII punctuation that has no meaning for classification (so "80%"
 * and "80" both match FICO/LTV extraction).
 */
export function normalizeText(raw: string): string {
  let out = ` ${raw.toLowerCase()} `;
  for (const { from, to } of NORMALIZATION_REPLACEMENTS) {
    out = out.replace(from, ` ${to} `);
  }
  // Collapse repeated spaces; keep %, $, ., digits, letters.
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

// ---------------------------------------------------------------------------
// 2. Late-pattern parsing (2x30x12, 1x60x24, 0x30x12, "two forty-five" ...).
// ---------------------------------------------------------------------------

export interface LatePattern {
  count: number;
  days: 30 | 60 | 90;
  lookbackMonths: number;
  text: string;
}

const LATE_PATTERN_RE = /(\d{1,2})\s*[x×]\s*(\d{2})\s*[x×]\s*(\d{1,3})/;
// "one sixty in twelve" / "two thirty in twelve" style speech variants.
const LATE_SPOKEN_RE =
  /(one|two|three|four|five|zero|no)\s*[ -]?(\d{2}|thirty|sixty|ninety)\s*(?:day)?\s*(?:lates?|late)?\s*(?:in|over|within)?\s*(?:the?)?\s*(?:last\s*)?(\d{1,3}|twelve|twenty[- ]?four)\s*(?:months?|mos?)?/;

const WORD_NUM: Record<string, number> = {
  zero: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
};
const DAY_WORD: Record<string, 30 | 60 | 90> = { thirty: 30, sixty: 60, ninety: 90 };
const MONTH_WORD: Record<string, number> = { twelve: 12, "twenty four": 24, twenty: 20, "twenty-four": 24 };

export function parseLatePattern(normalized: string): LatePattern | null {
  const m = normalized.match(LATE_PATTERN_RE);
  if (m) {
    const days = Number(m[2]) as 30 | 60 | 90;
    if (![30, 60, 90].includes(days)) return null;
    return {
      count: Number(m[1]),
      days,
      lookbackMonths: Number(m[3]),
      text: m[0].replace(/\s+/g, ""),
    };
  }
  const s = normalized.match(LATE_SPOKEN_RE);
  if (s) {
    const countStr = s[1];
    const dayStr = s[2];
    const lookbackStr = s[3];
    if (!countStr || !dayStr || !lookbackStr) return null;
    const count = WORD_NUM[countStr];
    const days = DAY_WORD[dayStr] ?? (/^\d{2}$/.test(dayStr) ? (Number(dayStr) as 30 | 60 | 90) : undefined);
    const lookback = MONTH_WORD[lookbackStr] ?? (/^\d{1,3}$/.test(lookbackStr) ? Number(lookbackStr) : undefined);
    if (count === undefined || days === undefined || lookback === undefined) return null;
    if (![30, 60, 90].includes(days)) return null;
    return { count, days, lookbackMonths: lookback, text: `${count}x${days}x${lookback}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Colloquial equivalences.
//    "down payment 20%" ⇄ "80% LTV" handled in the parser (derive LTV from
//    down-payment %). "no ratio" → DSCR no-ratio. "stated income" → closest
//    supported alt-doc with an explicit note that it isn't a supported class.
// ---------------------------------------------------------------------------

export const STATED_INCOME_NOTE =
  "\"Stated income\" is not a supported income-documentation category in this platform. The closest supported alternative-documentation methods are bank statement or P&L only — both require verifiable documentation, not a stated number.";

export const NO_RATIO_NOTE =
  "\"No ratio\" refers to a DSCR-family loan with no minimum DSCR ratio requirement. It is not the same as no income verification.";

// ---------------------------------------------------------------------------
// 4. Lender/program fuzzy name matching (Levenshtein) — "did you mean" path.
// ---------------------------------------------------------------------------

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const up = dp[j] ?? 0;
      const diag = prev;
      const left = dp[j - 1] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(up + 1, left + 1, diag + cost);
      prev = up;
    }
  }
  return dp[n] ?? 0;
}

/** Best fuzzy match to a known name; returns the target and its distance. */
export function fuzzyMatch(
  candidate: string,
  knownNames: string[],
  maxDistance = 3,
): { target: string; distance: number } | null {
  const c = candidate.trim().toLowerCase();
  if (!c) return null;
  let best: { target: string; distance: number } | null = null;
  for (const known of knownNames) {
    const k = known.toLowerCase();
    // Exact/substring containment (e.g. "greenbox" -> "Greenbox Loans",
    // "homexpress" -> "HomeXpress Mortgage") counts as a strong match — the
    // common real-world case where the trade name is a prefix of the legal name.
    if (k === c) return { target: known, distance: 0 };
    if (k.includes(c)) return { target: known, distance: 0 }; // trade-name alias match
    const d = levenshtein(c, k);
    if (d <= maxDistance && (!best || d < best.distance)) best = { target: known, distance: d };
  }
  return best;
}