/**
 * Chatbot normalization dictionary — version-controlled, NOT embedded in any
 * prompt. Stage A (normalize.ts) applies these before intent classification
 * and entity extraction, so typos, speech-to-text errors, and broker
 * shorthand all resolve to canonical tokens deterministically.
 *
 * Ordering matters: multi-word phrase corrections run before single-token
 * corrections so "mortgage lights" is fixed before "lights" could be
 * mis-corrected in isolation.
 */

/** Multi-word phrase corrections (applied first, case-insensitive). */
export const PHRASE_CORRECTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Speech-to-text / typo phrases
  [/\bmortgage\s+lights?\b/g, "mortgage lates"],
  [/\bmortgage\s+lakes?\b/g, "mortgage lates"],
  [/\bfull\s+dock\b/g, "full doc"],
  [/\bbank\s+stat?ements?\b/g, "bank statement"],
  [/\bbank\s+statments?\b/g, "bank statement"],
  [/\bbank\s+statemnts?\b/g, "bank statement"],
  [/\bassett?\s+depl[ea]tion\b/g, "asset depletion"],
  [/\basset\s+depl[ea]tion\b/g, "asset depletion"],
  [/\bhe[\s-]?lock\b/g, "heloc"],
  [/\bshort\s+sail\b/g, "short sale"],
  [/\bp\s*&\s*l\b/g, "pnl"],
  [/\bp\s+and\s+l\b/g, "pnl"],
  [/\bprofit\s+and\s+loss\b/g, "pnl"],
  [/\bforeign\s+nationals?\b/g, "foreign_national"],
  [/\bnon[\s-]?warr?(antable)?\b/g, "non_warrantable"],
  [/\bnon[\s-]?owner[\s-]?occ(upied)?\b/g, "investment"],
  [/\bshort[\s-]?term\s+rentals?\b/g, "str"],
  [/\bair\s?bnb\b/g, "str"],
  [/\bvrbo\b/g, "str"],
  [/\bfirst[\s-]?time\s+home\s?buyers?\b/g, "fthb"],
  [/\bfirst[\s-]?time\s+buyers?\b/g, "fthb"],
  [/\bfirst[\s-]?time\s+investors?\b/g, "fti"],
  [/\bdeed\s+in\s+lieu\b/g, "dil"],
  [/\binterest[\s-]?only\b/g, "io"],
  [/\bprepay(ment)?\s+penalt(y|ies)\b/g, "ppp"],
  [/\bloan[\s-]?to[\s-]?value\b/g, "ltv"],
  [/\bloan[\s-]?to[\s-]?cost\b/g, "ltc"],
  [/\bdebt[\s-]?service(\s+coverage)?(\s+ratio)?\b/g, "dscr"],
  [/\bno[\s-]?ratio\b/g, "no_ratio"],
  [/\bcash[\s-]?out\b/g, "cash_out"],
  [/\brate\s*(and|\/|&)\s*term\b/g, "rate_term"],
  [/\br\s*\/\s*t\b/g, "rate_term"],
  [/\bsingle[\s-]?family\b/g, "sfr"],
  [/\bcredit\s+score\b/g, "fico"],
  [/\bdown\s?paym?ent\b/g, "down_payment"],
  [/\bdownpayment\b/g, "down_payment"],
  [/\b(ch(apter)?\.?\s*7|bk\s*7|chapter\s*seven)\b/g, "bk7"],
  [/\b(ch(apter)?\.?\s*13|bk\s*13|chapter\s*thirteen)\b/g, "bk13"],
  [/\bstated\s+income\b/g, "stated"],
  [/\b(2|two)\s*[-to]{0,3}\s*4\s+units?\b/g, "2_4_unit"],
  [/\bbankruptc(y|ies)\b/g, "bk"],
] as const;

/** Single-token typo corrections (applied after phrase pass, whole-word). */
export const TOKEN_CORRECTIONS: Readonly<Record<string, string>> = {
  // DSCR misspellings / speech-to-text
  dcsr: "dscr",
  dscsr: "dscr",
  dsrc: "dscr",
  descr: "dscr",
  // ITIN
  itn: "itin",
  itins: "itin",
  iten: "itin",
  // FICO
  ficos: "fico",
  fica: "fico",
  // doc-type words
  statment: "statement",
  statments: "statement",
  statemnt: "statement",
  lends: "lenders",
  lendors: "lenders",
  guidline: "guideline",
  guidlines: "guidelines",
  gudelines: "guidelines",
  // credit events
  forclosure: "foreclosure",
  foreclosuer: "foreclosure",
  fc: "foreclosure",
  // late variants
  lates: "lates",
  laits: "lates",
  // misc shorthand
  noo: "investment",
  sfr: "sfr",
  oo: "primary",
  refi: "refinance",
  cashout: "cash_out",
  condotel: "condotel",
  nonwarrantable: "non_warrantable",
  wvoe: "wvoe",
};

/** Canonical vocabulary hints for entity extraction — kept here so tests and
 * the parser share one source of truth for what a token means. */
export const DOC_TYPE_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bbank statement\b/, "bank_statement"],
  [/\bpnl\b/, "pnl_only"],
  [/\bdscr\b/, "dscr"],
  [/\bno_ratio\b/, "dscr"],
  [/\basset (depletion|utilization|qualifier)\b/, "asset_depletion"],
  [/\bfull doc\b/, "full_doc"],
  [/\bw-?2s?\b/, "full_doc"],
  [/\btax returns?\b/, "full_doc"],
  [/\b1099s?(\s|-)?(only)?\b/, "1099"],
  [/\bwvoe\b/, "wvoe_only"],
] as const;

export const CREDIT_EVENT_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bbk7\b/, "bk7"],
  [/\bbk13\b/, "bk13"],
  [/\bbk\b/, "bk7"], // unqualified "BK"/"bankruptcy" defaults to the more common chapter-7 question; parser records the assumption
  [/\bforeclosure\b/, "foreclosure"],
  [/\bshort sale\b/, "short_sale"],
  [/\bss\b/, "short_sale"],
  [/\bdil\b/, "deed_in_lieu"],
  [/\bmortgage lates?\b/, "mortgage_lates"],
  [/\bhousing (history|lates?)\b/, "mortgage_lates"],
  [/\blate payments? on (the |their )?mortgage\b/, "mortgage_lates"],
] as const;

/** `NxDDxM` late-pattern shorthand, e.g. 2x30x12, 1x60x24, 0x30x12. */
export const LATE_PATTERN_REGEX = /\b(\d{1,2})\s*x\s*(30|60|90|120)\s*x\s*(\d{1,2})\b/i;

/** Notes surfaced when a colloquial term maps onto a supported concept with
 * a caveat the answer must carry. */
export const COLLOQUIAL_NOTES: Readonly<Record<string, string>> = {
  stated:
    '"Stated income" is not a supported category in this library — the closest supported alternative-documentation methods are bank statement, P&L only, 1099-only, and asset depletion.',
  no_ratio:
    '"No ratio" is treated as DSCR-family qualification with no minimum ratio requirement.',
};
