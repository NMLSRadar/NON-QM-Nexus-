import { Citizenship, CreditProfileType, IncomeDocType, InvestorExperience, LoanPurpose, Occupancy, PropertyType, Vesting } from "@/domain/types/enums";
import { Captured, VoiceExtraction, emptyExtraction } from "./slots";

/**
 * Deterministic voice-transcript extraction.
 *
 * Turns a spoken scenario ("purchase of a single-family primary residence
 * worth eight hundred fifty thousand, loan amount 680k, 742 credit score,
 * twelve months of business bank statements…") into structured slots with
 * provenance. No AI is involved here; the optional AI-assisted extractor
 * (src/lib/ai/extractScenario.ts) can supplement this but its output must be
 * user-confirmed. Eligibility math downstream is deterministic either way.
 *
 * Heuristics are tuned for US-English mortgage phrasing; every captured value
 * carries the fragment it came from so the user can verify and edit.
 */

// ---------------------------------------------------------------------------
// Normalization: words -> digits, k/million -> integers
// ---------------------------------------------------------------------------

const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function wordsToDigits(input: string): string {
  const tokens = input.split(/\s+/);
  const out: string[] = [];
  let current = 0;
  let total = 0;
  let inRun = false;
  const flush = () => {
    if (inRun) {
      out.push(String(total + current));
      current = 0;
      total = 0;
      inRun = false;
    }
  };
  for (const raw of tokens) {
    const parts = raw.split("-");
    let allNumeric = true;
    for (const part of parts) {
      if (part in UNITS) current += UNITS[part] as number;
      else if (part in TEENS) current += TEENS[part] as number;
      else if (part in TENS) current += TENS[part] as number;
      else if (part === "hundred") current = (current || 1) * 100;
      else if (part === "thousand") { total += (current || 1) * 1_000; current = 0; }
      else if (part === "million") { total += (current || 1) * 1_000_000; current = 0; }
      else if (part === "and" && inRun) { /* "one hundred and five" */ }
      else { allNumeric = false; break; }
    }
    if (allNumeric && parts.length > 0) inRun = true;
    else { flush(); out.push(raw); }
  }
  flush();
  return out.join(" ");
}

const UNIT_WORD = "zero|one|two|three|four|five|six|seven|eight|nine";
function unitToNumber(token: string): number {
  return token in UNITS ? (UNITS[token] as number) : parseFloat(token);
}

export function normalizeTranscript(raw: string): string {
  let s = ` ${raw.toLowerCase()} `;
  s = s.replace(/\.{2,}/g, " "); // collapse an ellipsis ("Seven...") to a space BEFORE correction-stripping below, so it never acts as a false sentence boundary that blocks the lookback from reaching the misspoken word
  s = s.replace(/(\d),(?=\d{3}\b)/g, "$1"); // 850,000 -> 850000 (BEFORE correction-stripping below, so a thousands-separator comma inside a number is never mistaken for a real clause boundary)
  // Speech-to-text commonly renders mortgage abbreviations as spelled-out
  // or misheard letter sequences rather than the compact acronym itself
  // ("D-S-C-R", "S F R", "He-lock" for HELOC, "ten ninety-nine" for 1099).
  // Normalized here, BEFORE any downstream classifier runs, so every
  // existing bare-acronym check (\bdscr\b, \bsfr\b, \bllc\b, \bltv\b,
  // \bdti\b, 1099) keeps working unchanged against these spoken variants.
  s = s.replace(/\bd[\s-]*s[\s-]*c[\s-]*r\b/g, "dscr");
  s = s.replace(/\bs[\s-]*f[\s-]*r\b/g, "sfr");
  s = s.replace(/\bl[\s-]*l[\s-]*c\b/g, "llc");
  s = s.replace(/\bl[\s-]*t[\s-]*v\b/g, "ltv");
  s = s.replace(/\bd[\s-]*t[\s-]*i\b/g, "dti");
  s = s.replace(/\bhe[\s-]*lock\b/g, "heloc");
  s = s.replace(/\bfye[\s-]*co\b/g, "fico");
  s = s.replace(/\bten[\s-]+ninety[\s-]*nine\b/g, "1099");
  // Mid-speech self-corrections ("actually...", "excuse me...", "I mean...",
  // "let me correct that...", "my mistake...", "sorry...") — a broker
  // restating a value mid-sentence should have ONLY the corrected value
  // extracted, never the misspoken one before it. Removes ONLY the single
  // token immediately preceding the correction marker (e.g. "700," /
  // "seven" / "down,") along with the marker phrase itself — deliberately
  // NOT a broad multi-word/character span, which would also delete any
  // LABEL word earlier in the same clause ("credit score is 700, let me
  // correct that, 720" must become "credit score is 720", not just "720"
  // with the "credit score is" label gone too, or the FICO extractor has
  // no context word left to recognize the corrected number by). When the
  // misspoken value was itself multi-word ("twenty percent down, I mean,
  // twenty-five percent down"), only the LAST word of it ("down") is
  // removed, but that's enough — "twenty percent" is orphaned from the
  // "down" it needed to be classified as a down payment at all, so it's
  // silently ignored by every classifier while the corrected "twenty-five
  // percent down" remains intact and gets picked up normally.
  const CORRECTION_MARKERS = "actually|excuse me|i mean|let me correct that|my mistake|correction|sorry|wait|one second|that'?s incorrect|no,? make that|update that|i misspoke|scratch that";
  // Handles the REVERSED order too — "680 credit, no, make that 720" states
  // the misspoken NUMBER *before* its label word, unlike "credit score is
  // 700, let me correct that, 720" (label before number). A plain 1-token
  // strip would either lose the number (if the label is closer to the
  // marker) or the label (if the number is closer) depending on which
  // order the broker happened to use. This first pass only fires when the
  // token RIGHT before the marker is a recognized label word — in that
  // case it also reaches back one more token to drop the actual (numeric)
  // misspoken value, while keeping the label itself intact for the
  // corrected number that follows.
  s = s.replace(
    new RegExp(`(?:\\$?[\\d,.]+%?\\s+)?\\b(credit|score|fico|value|price|ltv|balance|cash|loan)\\b,?\\s*(?:${CORRECTION_MARKERS})\\b,?\\s*`, "gi"),
    "$1 "
  );
  s = s.replace(new RegExp(`[\\w$%]+,?\\s*(?:${CORRECTION_MARKERS})\\b,?\\s*`, "gi"), "");
  s = s.replace(/,/g, " , "); // remaining commas become separators
  s = s.replace(/([a-z0-9])([.!?;])/g, "$1 $2"); // detach sentence punctuation
  // A DIGIT directly followed by the spoken word "thousand" ("105
  // thousand", "1960 thousand") — must run BEFORE wordsToDigits() below,
  // which tokenizes on whitespace and only recognizes a fully spelled-out
  // word sequence ("one hundred five thousand"); given a literal digit
  // token like "1960" (which it doesn't treat as a number word at all) it
  // flushes that digit unchanged and then processes "thousand" against a
  // reset accumulator, producing "1960 1000" as two SEPARATE tokens
  // instead of the combined "1960000" — a real, silent 1000x undercount
  // real broker speech commonly mixing digit + literal number word
  // ("existing balance is roughly 250 thousand") would otherwise trigger.
  s = s.replace(/(\d+(?:\.\d+)?)\s*thousand\b/g, (_m, n: string) => String(Math.round(parseFloat(n) * 1_000)));
  // Spoken credit-score shorthand ("seven-forty", "seven forty", "six eighty",
  // "seven oh five") — mortgage-broker slang for a 3-digit FICO, said as a
  // hundreds digit (six/seven/eight) plus a separate tens/teens/"oh"+unit
  // word, NEVER as a proper "hundred"-grammar number. The generic word-to-
  // number pass below would otherwise just ADD the two words together
  // ("seven" + "forty" = 47, instead of 740), since normal English number
  // grammar has no other way to combine them. Detected and converted to a
  // literal 3-digit number BEFORE that generic pass runs.
  s = s.replace(
    /\b(six|seven|eight)[\s-](oh|zero|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](one|two|three|four|five|six|seven|eight|nine))?\b/g,
    (_m, hundreds: string, tensWord: string, unitWord?: string) => {
      const hundredsDigit = (UNITS[hundreds] as number) * 100;
      const tens = tensWord === "oh" || tensWord === "zero" ? 0 : (TEENS[tensWord] as number) ?? (TENS[tensWord] as number);
      const unit = unitWord ? (UNITS[unitWord] as number) : 0;
      return String(hundredsDigit + tens + unit);
    }
  );
  // A trailing hyphenated non-number word ("six-hundred-thousand-dollar
  // range") otherwise invalidates the ENTIRE hyphen-joined token for
  // wordsToDigits below, since it splits on "-" and requires every part to
  // be numeric — detach it so the numeric chain still converts.
  s = s.replace(/-(dollars?|range|purchase|value|price|mark)\b/g, " $1");
  // "one point two million" / "1 point 2 thousand" -> integer, BEFORE the word-number pass
  s = s.replace(
    new RegExp(`\\b(${UNIT_WORD}|\\d+)\\s+point\\s+(${UNIT_WORD}|\\d)\\s+(million|thousand)\\b`, "g"),
    (_m, a: string, b: string, scale: string) =>
      String(Math.round((unitToNumber(a) + unitToNumber(b) / 10) * (scale === "million" ? 1_000_000 : 1_000)))
  );
  s = wordsToDigits(s);
  // "1 point 2" / "1.2 million" / "850 k"
  s = s.replace(/(\d+)\s+point\s+(\d+)/g, "$1.$2");
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:million|mil\b|mm\b)/g, (_m, n: string) => String(Math.round(parseFloat(n) * 1_000_000)));
  s = s.replace(/(\d+(?:\.\d+)?)\s*k\b/g, (_m, n: string) => String(Math.round(parseFloat(n) * 1_000)));
  // "two hundred grand" -> "200 grand" -> 200000 ("grand" is common mortgage-
  // broker slang for thousands, same meaning as "k").
  s = s.replace(/(\d+(?:\.\d+)?)\s*grand\b/g, (_m, n: string) => String(Math.round(parseFloat(n) * 1_000)));
  s = s.replace(/\$\s+/g, "$");
  return s.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Slot extraction
// ---------------------------------------------------------------------------

function cap<T>(value: T, source: string, inferred = false): Captured<T> {
  return inferred ? { value, source, inferred } : { value, source };
}

// ---------------------------------------------------------------------------
// Loan purpose classifier — shared, independently testable, exported so
// other callers (or tests) can use the exact same phrase-to-enum mapping
// the voice extractor uses. Priority: cash-out > rate-and-term > generic
// refinance (pending subtype) > purchase.
// ---------------------------------------------------------------------------

const CASH_OUT_PHRASES =
  /cash[\s-]?outs?\b|cash[\s-]?out refi(?:nance)?\b|take (?:some |the )?cash out\b|pull(?:ing)? cash out\b|pull(?:ing)?[^.!?]{0,25}\bout\b|pull(?:ing)? (?:money|funds)( out)?\b|pull(?:ing)? equity\b|access(?:ing)? (?:equity|cash)\b|tap(?:ping)? (?:into )?(?:the )?equity\b|use (?:the )?equity\b|leverag(?:e|ing) (?:the )?equity\b|borrow(?:ing)? against (?:the )?equity\b|equity (?:take[\s-]?out|withdrawal)\b|refi(?:nance)? for cash\b|refinanc\w*[^.!?]{0,25}\bfor cash\b|refinanc\w*[^.!?]{0,25}\breceiv\w* cash\b|refinanc\w*[^.!?]{0,25}\ba larger loan\b|refinanc\w*[^.!?]{0,25}\baccess (?:to )?equity\b|refinanc\w*[^.!?]{0,25}\btake money out\b|refinanc\w*[^.!?]{0,25}\bwalk away with cash\b|refinanc\w*[^.!?]{0,25}\breceive proceeds\b|receiv(?:e|ing) proceeds\b|consolidat\w* debt with equity\b|pay(?:ing)? off debt using the property\b|refinanc\w*.{0,20}receiv\w* cash back\b|cash[\s-]?back refinance\b|cash equity refinance\b|equity refinance\b/;

// Explicit negations of cash-out language ("without cash out", "no cash
// back", "not taking cash back") must never be matched by CASH_OUT_PHRASES
// above — "cash out"/"cash back" appear literally inside the negation, but
// the intent is the opposite (a plain rate-and-term refinance).
const NEGATED_CASH_OUT_PHRASES = /without (?:any )?cash[\s-]?out\b|no cash[\s-]?(?:out|back)\b|not taking (?:any )?cash back\b|no cash back\b/;

const RATE_TERM_PHRASES =
  /rate[\s-]*(?:and|&|\/)?[\s-]*term\b|lower(?:ing)? (?:the|their|his|her) rate\b|chang(?:e|ing) (?:the|their|his|her) term\b|reduc\w* (?:the|their|his|her) payment\b|refinanc\w*.{0,15}without cash out\b|no cash back\b|pay(?:ing)? off the existing loan only\b|straight refinanc\w*\b/;

const GENERIC_REFI_PHRASES =
  /\brefinanc\w*|\brefi\b|doing a refi\b|refinanc\w* the property\b|refinanc\w* the loan\b|replac\w* the current mortgage\b|pay(?:ing)? off the existing mortgage\b|new loan on an owned property\b/;

const PURCHASE_PHRASES =
  /\bpurchas\w*|\bbuy(?:ing)?\b|\bacquir\w*|\bacquisition\b|under contract\b|buying a home\b|buying an investment property\b/;

export interface LoanPurposeClassification {
  value: LoanPurpose;
  source: string;
  inferred?: boolean;
  pendingSubtype?: boolean;
}

/** Classifies free text into a normalized LoanPurpose. Cash-out language
 * always wins when both cash-out and generic-refinance/rate-term language
 * are present (per the required priority order); a bare "refi"/"refinance"
 * with no subtype language returns pendingSubtype so the caller can ask one
 * concise follow-up rather than guessing or leaving the field blank. */
export function classifyLoanPurpose(t: string): LoanPurposeClassification | undefined {
  const cashOutMatch = !NEGATED_CASH_OUT_PHRASES.test(t) ? CASH_OUT_PHRASES.exec(t) : null;
  if (cashOutMatch) return { value: LoanPurpose.CashOutRefinance, source: cashOutMatch[0].trim() };

  const rateTermMatch = RATE_TERM_PHRASES.exec(t);
  const refiMatch = GENERIC_REFI_PHRASES.exec(t);
  if (rateTermMatch) return { value: LoanPurpose.RateAndTermRefinance, source: rateTermMatch[0].trim() };
  if (refiMatch) {
    return { value: LoanPurpose.RateAndTermRefinance, source: `${refiMatch[0].trim()} (subtype not stated)`, inferred: true, pendingSubtype: true };
  }

  const purchaseMatch = PURCHASE_PHRASES.exec(t);
  if (purchaseMatch) return { value: LoanPurpose.Purchase, source: purchaseMatch[0].trim() };

  return undefined;
}

// ---------------------------------------------------------------------------
// First-time homebuyer classifier — tri-state (true/false/undefined=unknown).
// ---------------------------------------------------------------------------

const NOT_FIRST_TIME_BUYER_PHRASES =
  /not a first[\s-]?time (?:home\s?)?buyer\b|currently owns? a home\b|has owned property before\b|previously owned a primary residence\b/;
const FIRST_TIME_BUYER_PHRASES =
  /first[\s-]?time (?:home\s?)?buyer\b|first home\b|first house\b|first purchase\b|never owned a home\b|never owned before\b|never purchased a home\b|never purchased before\b|has not owned a home before\b|hasn't owned a home\b|buying (?:their|his|her) first (?:primary residence|home|house)\b|buying their first house\b/;

export function classifyFirstTimeHomebuyer(t: string): { value: boolean; source: string } | undefined {
  // Negative phrasing is checked first so "not a first-time homebuyer" doesn't
  // also match the positive "first-time...buyer" fragment inside it.
  const negMatch = NOT_FIRST_TIME_BUYER_PHRASES.exec(t);
  if (negMatch) return { value: false, source: negMatch[0].trim() };
  const posMatch = FIRST_TIME_BUYER_PHRASES.exec(t);
  if (posMatch) return { value: true, source: posMatch[0].trim() };
  return undefined;
}

// ---------------------------------------------------------------------------
// Investor experience classifier — distinct from first-time-homebuyer.
// ---------------------------------------------------------------------------

const EXPERIENCED_INVESTOR_PHRASES =
  /experienced investor\b|owns? rentals?\b|owns? investment propert(?:y|ies)\b|owns? (?:multiple|several|two|three|four|five|\d+) (?:rental )?propert(?:y|ies)\b|owns? (?:multiple|several|two|three|four|five|\d+) rentals?\b|has a rental portfolio\b|has landlord experience\b|has owned (?:an )?investment property before\b/;
const FIRST_TIME_INVESTOR_PHRASES =
  /first[\s-]?time investor\b|first investment property\b|first rental\b|never owned an investment property\b|new investor\b|this will be (?:their|his|her) first rental property\b/;

export function classifyInvestorExperience(t: string): { value: InvestorExperience; source: string } | undefined {
  const expMatch = EXPERIENCED_INVESTOR_PHRASES.exec(t);
  if (expMatch) return { value: InvestorExperience.ExperiencedInvestor, source: expMatch[0].trim() };
  const firstMatch = FIRST_TIME_INVESTOR_PHRASES.exec(t);
  if (firstMatch) return { value: InvestorExperience.FirstTimeInvestor, source: firstMatch[0].trim() };
  return undefined;
}

// ---------------------------------------------------------------------------
// Citizenship / residency classifier — a required (core) vital: the
// borrower's citizenship classification gates real program eligibility
// (baseChecks.ts hard-fails a program whose citizenshipEligible list doesn't
// include it), so it must be either explicitly captured or explicitly asked
// for — never guessed when nothing is said (returns undefined, same as any
// other unset vital).
//
// A single combined, ORDERED alternation (not five independent regexes) is
// used deliberately so overlapping phrases resolve to the right, more
// specific category instead of both matching at once:
//   - "non-U.S. citizen" (Foreign National) contains the substring "U.S.
//     citizen" — the Foreign National alternative is listed BEFORE the U.S.
//     Citizen alternative, so a global left-to-right scan consumes the whole
//     "non-U.S. citizen" phrase first and never gets a second, separate
//     chance to match "citizen" bare inside it.
//   - "non-permanent resident" contains the substring "permanent resident" —
//     same fix, Non-Permanent Resident is listed before Permanent Resident.
//
// Multiple mentions are handled last-mention-wins (mirrors the same
// correction semantics used for LTV/down-payment above): if the borrower
// self-corrects ("Actually, they're not a U.S. citizen — they're an ITIN
// borrower"), the LATER category found wins. A short negation lookback
// ("not", "isn't", "never", "no longer") immediately before a match discards
// that specific mention entirely, rather than mis-registering "not a U.S.
// citizen" as an assertion of U.S. citizenship — it does NOT force any other
// category by itself; whatever explicit category is actually stated (here,
// "ITIN borrower") is what wins, exactly as a plain last-wins scan already
// produces once the negated mention is discarded.
//
// ITIN detection confidence (2026-07-28, per platform spec): most spoken/
// spelled ITIN phrasings are unambiguous on their own ("ITIN", "I-T-I-N",
// "eye-tin", "individual taxpayer identification number", "tax ID borrower",
// "no social security number") and are always HIGH confidence regardless of
// context. The one genuinely ambiguous surface form is "I-10"/"I ten"/"eye
// ten" — a common STT mishearing of ITIN, but also literally Interstate 10.
// That form is gated by nearby mortgage-borrower-context words (see
// ITIN_I10_MORTGAGE_CONTEXT/ITIN_I10_HIGHWAY_CONTEXT below): with mortgage
// context nearby it's MEDIUM confidence ITIN; with highway context nearby
// (and no mortgage context) it's discarded entirely, never classified as
// ITIN; with neither context present nearby, it's also left unclassified
// (never guess a citizenship class without any anchoring signal) — the
// assistant simply keeps asking, exactly as it already does for any other
// unstated vital.
const CITIZENSHIP_RE = new RegExp(
  [
    // ITIN Borrower — unambiguous phonetic/speech-to-text variants (never
    // gated by context, always high confidence): spelled letter-by-letter
    // ("I-T-I-N"), "eye-tin", "individual taxpayer identification number"
    // (with or without "individual"/"number"), "tax ID borrower", "no
    // social security number" (and common negation phrasings of the same),
    // "ITIN instead of an SSN". The ambiguous "I-10"/"I ten"/"eye ten"
    // surface form is captured separately below (itinAmbiguous) so it can
    // be context-gated before being trusted.
    String.raw`(?<itin>\bi[\s.-]*t[\s.-]*i[\s.-]*n\b|\beye[\s-]*tin\b|\bitin\s+(?:borrower|loan|instead)\b|\btax\s?id\s+borrower\b|\bindividual taxpayer id(?:entification)?(?:\s+number)?\b|\btaxpayer identification number\b|\btax identification number\b|\bno\s+social security number\b|\b(?:does\s?n['o]?t|do\s+not|doesn['o]?t)\s+have\s+a\s+social security number\b|\bwithout\s+a\s+social security number\b)`,
    // ITIN Borrower — the ambiguous "I-10"/"I ten"/"eye ten" form, matched
    // separately so it can be context-gated (see the disambiguation pass
    // right after this regex definition) rather than trusted outright. Note
    // "eye ten" is ALSO matched as "eye 10" — normalizeTranscript's
    // word-to-digit pass runs before this classifier and silently converts
    // the bare number word "ten" to the digit "10" even in "eye ten"
    // (there's no number-word before "eye" to signal it isn't a real
    // number), so the literal text this regex sees is "eye 10", never
    // "eye ten".
    String.raw`(?<itinAmbiguous>\bi[\s-]*10\b|\bi[\s-]*ten\b|\beye[\s-]*ten\b|\beye[\s-]*10\b)`,
    // Foreign National — the "u.s." spacing must tolerate the same
    // detached-punctuation normalization as the U.S. Citizen pattern below
    // (normalizeTranscript turns "U.S." into "u .s ." with a space before
    // each dot), or "non-U.S. citizen" would fail this stricter pattern and
    // fall through to matching the plain "U.S. citizen" alternative later
    // in the same phrase instead — silently losing the "non-" negation.
    String.raw`(?<foreignNational>\bforeign[\s-]national\b|\bfn borrower\b|\bforeign investor\b|\bforeign buyer\b|non[\s-]?u\s*\.?\s*s\s*\.?\s*citizen\b|\binternational borrower\b|\binternational buyer\b|\boverseas (?:buyer|borrower|investor)\b)`,
    // Non-Permanent Resident — "EAD" is a mortgage-specific abbreviation
    // rare enough outside this domain to match bare (not just "EAD
    // holder"), since real phrasing varies freely: "EAD card", "on an
    // EAD", "with an EAD", "holding a valid EAD".
    // Extended per the real visa-eligibility matrix in Cake Mortgage's
    // uploaded Non-QM guideline (2026-07-28) — H-1B, H-4, L-1/L-2,
    // E-1/E-2/E-3, O-1/O-2, DACA (C33), TPS/refugee/asylee, and NATO/G
    // visas are ALL real categories a broker describes in natural speech
    // ("they're on an H1", "they're on OPT", "they're DACA"). The
    // shorter/higher-collision-risk codes (TN, R-1, OPT) are gated to
    // require "visa"/"on a/an" framing so bare "opt" (a common English
    // verb) or "TN" (a state abbreviation) don't false-positive — the
    // same context-gating principle already used for the ambiguous
    // ITIN "I-10" surface form above. H-1B/L-1/O-1/E-visas are left
    // ungated (bare) since they're rare enough outside this domain that
    // the existing bare "c09"/"ead" precedent already accepts that risk.
    String.raw`(?<nonPermanentResident>\bnon[\s-]*perm(?:anent)?(?:\s+resident)?\b|\bwork visa\b|\bemployment authorization\b|\bead\b|\btemporary resident\b|\bvisa holder\b|\bc[\s-]?09\b|\bh[\s-]?1[\s-]?b?\b|\bh[\s-]?2[\s-]?b?\b|\bh[\s-]?4\b|\bl[\s-]?1[ab]?\b|\bl[\s-]?2\b|\be[\s-]?1\b|\be[\s-]?2\b|\be[\s-]?3\b|\bo[\s-]?1\b|\bo[\s-]?2\b|\bdaca\b|\btps\b|\btemporary protected status\b|\basylee\b|\basylum\b|\brefugee\b|\bnato\b|\bstem opt\b|\bf[\s-]?1 opt\b|\bon (?:an?|the) opt\b|\bopt visa\b|\bon (?:an?|the) tn\b|\btn visa\b|\bon (?:an?|the) r[\s-]?1\b|\br[\s-]?1 visa\b)`,
    // F-1 visa / international student — F-1 Visa Classification fix
    // (2026-07-28). Per current Non-QM Nexus business rules, an F-1 (student)
    // visa holder is classified as FOREIGN NATIONAL, distinct from the
    // Non-Permanent Resident / EAD category above — an EAD holder lives and
    // works IN the U.S. on employment authorization, while an F-1 student
    // has no such employment-based status. Matched BELOW (later in this
    // alternation) than the f-1-OPT-specific patterns already inside
    // nonPermanentResident above, so "F-1 OPT"/"STEM OPT"/"on the OPT" (a
    // real employment-authorization extension) keeps classifying as
    // Non-Permanent Resident exactly as before — this group only ever wins
    // when none of those more specific OPT patterns matched first. The bare
    // \bf[\s-]?1\b form accepts the same risk already taken for H-1B/L-1/O-1
    // above (rare enough outside this domain); every other alternative here
    // covers the plain-language ways a broker actually says "international
    // student" without ever using the literal code "F-1".
    String.raw`(?<f1Visa>\bf[\s-]?1\b|\bf[\s-]?one\b|\bstudent visa\b|\binternational student(?:'?s)?\s+visa\b|\bforeign student\b|\binternational student\b|\bnon[\s-]?u\s*\.?\s*s\s*\.?\s*\.?\s*student\b|\bstudying in (?:the united states|america)\b(?=(?:(?!\.).){0,60}\bvisa\b)|\bhere (?:temporarily )?for school\b|\bdoes not have permanent residency\b(?=(?:(?!\.).){0,60}\bf[\s-]?1\b))`,
    // Permanent Resident (green card) — a real, distinct category already
    // used by real lender program data (citizenshipEligible), even though
    // it wasn't one of the four requested UI options; kept recognizable so
    // a green-card borrower is never miscategorized into one of the four.
    String.raw`(?<permanentResident>\bpermanent resident\b|\blawful permanent resident\b|\blpr\b|\bgreen card(?:\s+holder)?\b)`,
    // U.S. Citizen
    String.raw`(?<usCitizen>\bu\s*\.?\s*s\s*\.?\s*citizen\b|\bunited states citizen\b|\bamerican citizen\b|\bnaturalized citizen\b|\bborn here\b|\bcitizen\b)`,
  ].join("|"),
  "gi"
);
const CITIZENSHIP_NEGATION_LOOKBACK =
  /\b(?:not|isn'?t|never|no longer)\b\s*(?:a|an)?\s*$|\b(?:does\s?n['o]?t|do\s+not|doesn['o]?t)\s+have\s*(?:a|an)?\s*$|\bwithout\s*(?:a|an)?\s*$/i;
// Nearby-context windows used ONLY to disambiguate the ambiguous "I-10"/"I
// ten"/"eye ten" surface form from the literal Interstate 10 — never applied
// to the unambiguous ITIN phrasings above, which are always trusted as-is.
const ITIN_I10_MORTGAGE_CONTEXT =
  /\bborrower\b|\bclient\b|\bcitizenship\b|\bimmigration\b|\bsocial security\b|\bssn\b|\btax return\b|\btaxpayer\b|\bidentification number\b|\bmortgage\b|\bloan\b|\bpurchase\b|\brefinance\b|\bbank statements?\b|\bincome documentation\b/i;
const ITIN_I10_HIGHWAY_CONTEXT =
  /\bfreeway\b|\bhighway\b|\btraffic\b|\bdriving\b|\bcommute\b|\bexit\b|\broad\b|\btransportation\b/i;
const ITIN_I10_CONTEXT_WINDOW = 60;

export interface CitizenshipMatch {
  value: Citizenship;
  source: string;
  /** high = an unambiguous ITIN phrasing (or any non-ITIN category, which
   * has no ambiguous surface form to worry about); medium = the "I-10"/"I
   * ten"/"eye ten" form, resolved as ITIN only because mortgage-borrower
   * context was found nearby — surfaced to the user as a soft confirmation
   * ("Borrower classification interpreted as ITIN.") rather than treated as
   * definitively confirmed the way an explicit "ITIN" statement is. */
  confidence: "high" | "medium";
  /** Preserved SEPARATELY from `value` (F-1 visa fix, 2026-07-28) — set
   * only when an explicit visa/immigration code was recognized (currently
   * "F-1"), so lender matching can search guidelines for both the general
   * citizenship classification AND any lender-specific visa restriction. */
  visaType?: string;
}

export function classifyCitizenship(t: string): CitizenshipMatch | undefined {
  const re = new RegExp(CITIZENSHIP_RE.source, CITIZENSHIP_RE.flags);
  let m: RegExpExecArray | null;
  let winner: CitizenshipMatch | undefined;
  while ((m = re.exec(t)) !== null) {
    const before = t.slice(Math.max(0, m.index - 20), m.index);
    if (CITIZENSHIP_NEGATION_LOOKBACK.test(before)) continue; // e.g. "not a U.S. citizen" — discard, don't assert UsCitizen
    const g = m.groups ?? {};
    if (g.itinAmbiguous) {
      // "I-10"/"I ten"/"eye ten" — genuinely ambiguous with Interstate 10.
      // Look at a window of nearby text on both sides: mortgage-borrower
      // context anywhere in the window resolves it as ITIN (medium
      // confidence); highway context with NO mortgage context resolves it
      // as the freeway, never ITIN; neither context present leaves it
      // unclassified rather than guessing either way.
      const windowStart = Math.max(0, m.index - ITIN_I10_CONTEXT_WINDOW);
      const windowEnd = Math.min(t.length, m.index + m[0].length + ITIN_I10_CONTEXT_WINDOW);
      const window = t.slice(windowStart, windowEnd);
      const hasMortgageContext = ITIN_I10_MORTGAGE_CONTEXT.test(window);
      const hasHighwayContext = ITIN_I10_HIGHWAY_CONTEXT.test(window);
      if (hasMortgageContext) {
        winner = { value: Citizenship.Itin, source: m[0].trim(), confidence: "medium" };
      } else if (hasHighwayContext) {
        continue; // Interstate 10 — never classify as ITIN
      } else {
        continue; // no anchoring context either way — don't guess
      }
      continue;
    }
    const value = g.itin
      ? Citizenship.Itin
      : g.foreignNational
        ? Citizenship.ForeignNational
        : g.f1Visa
          ? Citizenship.ForeignNational
          : g.nonPermanentResident
            ? Citizenship.NonPermanentResident
            : g.permanentResident
              ? Citizenship.PermanentResident
              : g.usCitizen
                ? Citizenship.UsCitizen
                : undefined;
    if (value) {
      // The explicitly stated visa type overrides a missing/ambiguous
      // citizenship description — visaType is preserved ONLY when the
      // literal "F-1" code was actually stated (g.f1Code), never inferred
      // from descriptive-only phrasing ("international student") that
      // implies but doesn't confirm the exact visa category. Attached via
      // an INDEPENDENT flag (see f1CodeSeenAnywhere below) rather than only
      // when this exact winning match happened to carry it — a later
      // descriptive match ("student visa") winning the last-match-wins
      // race must never silently drop an EARLIER literal "F-1" mention in
      // the same sentence ("F1 student visa").
      winner = { value, source: m[0].trim(), confidence: "high" };
    }
  }
  if (winner?.value === Citizenship.ForeignNational) {
    const f1Re = /\bf[\s-]?1\b|\bf[\s-]?one\b/i;
    if (f1Re.test(t)) winner = { ...winner, visaType: "F-1" };
  }
  return winner;
}

// ---------------------------------------------------------------------------
// Credit-profile classifier — F-1 visa / no-FICO fix (2026-07-28).
//
// A borrower can legitimately have NO numeric U.S. FICO score at all (a
// foreign national, or an F-1 visa holder who never established U.S.
// credit) — that is a valid, resolvable answer to the credit-profile Vital,
// never treated as missing data. This runs ONLY when the numeric FICO
// extractor (see `fico` below) found nothing, and recognizes the real
// semantic variations a broker actually says instead of a number.
// Last-match-wins, same self-correction semantics used throughout this file.
// ---------------------------------------------------------------------------

const CREDIT_PROFILE_RE = new RegExp(
  [
    // Foreign Credit — the borrower has a credit history, just not a U.S. one.
    String.raw`(?<foreignCredit>\bforeign credit(?:\s+(?:only|report))?\b|\binternational credit report\b|\bhas foreign credit\b)`,
    // No U.S. Credit — explicitly scoped to the U.S./domestic dimension.
    String.raw`(?<noUsCredit>\bno u\s*\.?\s*s\s*\.?\s* credit(?:\s+score)?\b|\bno domestic credit history\b|\bnever (?:used|established) credit in the united states\b|\bno u\s*\.?\s*s\s*\.?\s* credit history\b|\b(?:never|has not|have not|hasn['o]?t|haven['o]?t) established (?:any )?u\s*\.?\s*s\s*\.?\s*\.?\s* credit\b)`,
    // Insufficient Credit History — some credit exists, but not enough depth.
    String.raw`(?<insufficientCreditHistory>\bhas not established credit\b|\bnot established (?:any )?credit\b|\bnever established (?:any )?credit\b|\bno established tradelines\b|\binsufficient credit history\b|\bthin(?:\s+or\s+no)? credit (?:file|history)\b)`,
    // Credit Score Unknown — genuinely undetermined, not asserted as absent.
    String.raw`(?<creditUnknown>\bcredit (?:score|profile) (?:is )?unknown\b|\bcredit status (?:is )?unknown\b)`,
    // No FICO — the general/default case; also the fallback the spec's own
    // worked example expects for "does not have a FICO score".
    String.raw`(?<noFico>\bno fico\b|\bno credit score\b|\bn\s*\/?\s*a\s+fico\b|\bfico\s+(?:is\s+)?not applicable\b|\bfico\s+n\s*\/?\s*a\b|\bcredit score (?:is\s+)?unavailable\b|\bdoes\s?n['o]?t\s+have\s+a\s+fico\b|\bdoes not have a (?:u\s*\.?\s*s\s*\.?\s* )?credit score\b|\bhas no fico\b|\bwithout a fico\b|\bdoes not have a social security[\s-]based credit profile\b|\bno social security[\s-]based credit\b|\brecently arrived.{0,60}no fico\b)`,
  ].join("|"),
  "gi"
);

export interface CreditProfileMatch {
  value: Exclude<CreditProfileType, "us_fico_score">;
  source: string;
}

export function classifyCreditProfile(t: string): CreditProfileMatch | undefined {
  const re = new RegExp(CREDIT_PROFILE_RE.source, CREDIT_PROFILE_RE.flags);
  let m: RegExpExecArray | null;
  let winner: CreditProfileMatch | undefined;
  while ((m = re.exec(t)) !== null) {
    const g = m.groups ?? {};
    const value: CreditProfileMatch["value"] | undefined = g.foreignCredit
      ? CreditProfileType.ForeignCredit
      : g.noUsCredit
        ? CreditProfileType.NoUsCredit
        : g.insufficientCreditHistory
          ? CreditProfileType.InsufficientCreditHistory
          : g.creditUnknown
            ? CreditProfileType.Unknown
            : g.noFico
              ? CreditProfileType.NoFico
              : undefined;
    if (value) winner = { value, source: m[0].trim() }; // last valid match wins (self-corrections)
  }
  return winner;
}

// ---------------------------------------------------------------------------
// Property state classifier — a 2-letter USPS code, recognized from a full
// state name (safe, unambiguous, case-insensitive — this is how brokers
// actually say it on a call: "in Georgia", never "in G-A") or, ONLY when
// anchored by an unambiguous phrase immediately before it, a spoken
// abbreviation ("in the state of TX", "located in TX", "property in TX").
// Bare 2-letter abbreviations are deliberately NOT matched unanchored: many
// (OR, IN, ME, HI, OK, PA, ID, LA, DE, AT...) collide with common English
// words, and by the time this runs the transcript has already been
// lowercased, so there's no capitalization signal left to disambiguate "in"
// (preposition) from "IN" (Indiana).
// ---------------------------------------------------------------------------

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC", "washington dc": "DC",
};
const STATE_NAME_RE = new RegExp(
  `\\b(${Object.keys(STATE_NAME_TO_ABBR).sort((a, b) => b.length - a.length).join("|")})\\b`,
  "gi"
);
const STATE_ABBR_ANCHOR_RE = new RegExp(
  `\\b(?:in the state of|state of|located in|property is in|property in)\\s+([a-z]{2})\\b`,
  "gi"
);
const VALID_STATE_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR));

export function classifyState(t: string): { value: string; source: string } | undefined {
  // Last-mention-wins (same self-correction semantics used throughout this
  // file) — scans every match of both patterns and keeps whichever ends up
  // latest in the transcript, not just the first one found.
  let winner: { value: string; source: string; index: number } | undefined;
  const nameRe = new RegExp(STATE_NAME_RE.source, STATE_NAME_RE.flags);
  let nm: RegExpExecArray | null;
  while ((nm = nameRe.exec(t)) !== null) {
    const abbr = STATE_NAME_TO_ABBR[nm[1]!.toLowerCase()];
    if (abbr && (!winner || nm.index >= winner.index)) winner = { value: abbr, source: nm[0].trim(), index: nm.index };
  }
  const abbrRe = new RegExp(STATE_ABBR_ANCHOR_RE.source, STATE_ABBR_ANCHOR_RE.flags);
  let am: RegExpExecArray | null;
  while ((am = abbrRe.exec(t)) !== null) {
    const abbr = am[1]!.toUpperCase();
    if (VALID_STATE_ABBRS.has(abbr) && (!winner || am.index >= winner.index)) winner = { value: abbr, source: am[0].trim(), index: am.index };
  }
  return winner ? { value: winner.value, source: winner.source } : undefined;
}

// ---------------------------------------------------------------------------
// Title vesting classifier.
// ---------------------------------------------------------------------------

const VESTING_PHRASES: Array<{ value: Vesting; re: RegExp }> = [
  {
    value: Vesting.Llc,
    re: /\bllc\b|limited liability company\b|vested in an? llc\b|borrowing entity\b|property[\s-]holding llc\b/,
  },
  {
    value: Vesting.Corporation,
    re: /\bcorporation\b|\bcorp\b|incorporated\b|\binc\.?\b|c[\s-]corporation\b|s[\s-]corporation\b|corporate entity\b/,
  },
  {
    value: Vesting.Trust,
    re: /\btrust\b|family trust\b|revocable trust\b|irrevocable trust\b|living trust\b|land trust\b|vested in a trust\b/,
  },
  {
    value: Vesting.Individual,
    re: /\bindividually?\b|personal name\b|borrower'?s name\b|their own name\b|husband and wife\b|\bjointly\b|joint tenants\b|tenants in common\b|individual vesting\b|vested personally\b/,
  },
];

export function classifyVesting(t: string): { value: Vesting; source: string } | undefined {
  for (const { value, re } of VESTING_PHRASES) {
    const m = re.exec(t);
    if (m) return { value, source: m[0].trim() };
  }
  return undefined;
}

function firstMatch(
  text: string,
  patterns: RegExp[],
  valid: (n: number) => boolean
): { num: number; source: string } | undefined {
  for (const re of patterns) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const num = parseFloat(m[1] ?? "");
      // An implausible capture (e.g. "ltv ... 720 fico" grabbing 720) must not
      // block later patterns or later occurrences — keep scanning.
      if (Number.isFinite(num) && valid(num)) return { num, source: m[0].trim() };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Mortgage dollar-amount classification — semantic, not proximity-based.
//
// The prior implementation required a fixed alias phrase to sit immediately
// before (or immediately after, with no words in between) the number — so
// "estimated at around $600,000 in value" was missed entirely, since "value"
// trails the number by a whole phrase. This layer instead: (1) separates
// candidates by magnitude band (percent 1-100 for LTV/down-payment vs. dollar
// >= 1,000 for value/loan/cash-out — FICO's distinct 300-850 band is handled
// separately, so bands never collide), (2) for each dollar candidate, finds
// the mortgage-field alias term NEAREST to it anywhere in its sentence
// (rather than requiring a specific word order or adjacency), and (3) skips
// any number whose own clause carries credit-score, income, rent, DSCR,
// reserve, unit-count, or seasoning language, so those numbers are never
// misread as a property value or loan amount.
// ---------------------------------------------------------------------------

const PROPERTY_VALUE_TERMS =
  /\brequested loan amount\b|\bproperty value\b|\bestimated value\b|\bmarket value\b|\bappraised value\b|\bappraisal value\b|\bexpected appraisal\b|\bexpected value\b|\bappraises? for\b|\bshould appraise for\b|\bsubject value\b|\bvalue of the property\b|\bpurchase price\b|\bsales? price\b|\basking price\b|\blist(?:ed)? price\b|\blisted for\b|\bgoing for\b|\bselling for\b|\bpriced at\b|\bacquisition price\b|\bcontract price\b|\bhome price\b|\bproperty price\b|\bvalued at\b|\bworth\b|\bprobably worth\b|\bappraisal\b|\bappraise\b|\bappraised\b|\bvalue\b|\bprice\b|\bcoming in (?:around|at)\b|\bin the neighborhood of\b|\bcurrent market estimate\b|\bzestimate\b/;
// Generic single words ("purchase", "property", "home") are real signals
// ("a $600,000 purchase", "looking at a $600,000 property") but far too
// common to search sentence-wide without false hits — scoped to the
// number's own clause only (see classifyMortgageAmounts).
const PROPERTY_VALUE_WEAK_TERMS = /\bpurchase\b|\bproperty\b|\bhome\b|\bhouse\b|\bcondo\b/;

const LOAN_AMOUNT_TERMS =
  /\brequested loan amount\b|\bloan amount\b|\bmortgage amount\b|\bfinancing amount\b|\bamount financed\b|\bnew loan\b|\bproposed loan\b|\bloan request\b|\bborrower needs?\b|\blooking to borrow\b|\bwants? to borrow\b|\bneeds? to finance\b|\blooking to finance\b|\bwants? to finance\b|\bfinancing\b|\bborrow\b|\bloan\b/;
// The specific phrases only (no bare "loan"/"borrow"/"financing") — used
// instead of the full set above whenever the clause already contains an
// EXISTING_LIEN_TERMS phrase, since those phrases (e.g. "current loan
// balance", "existing loan balance") literally contain the word "loan"/
// "borrow" themselves; without this, the bare word — sitting a few
// characters closer to the number than the full phrase's start — would
// win by raw distance and misclassify a lien balance as the new loan.
const LOAN_AMOUNT_STRONG_TERMS =
  /\brequested loan amount\b|\bloan amount\b|\bmortgage amount\b|\bfinancing amount\b|\bamount financed\b|\bnew loan\b|\bproposed loan\b|\bloan request\b|\bborrower needs?\b|\blooking to borrow\b|\bwants? to borrow\b|\bneeds? to finance\b|\blooking to finance\b|\bwants? to finance\b/;

// Refinance-only: what the borrower currently owes on the subject property
// — distinct from LOAN_AMOUNT_TERMS above (the NEW requested loan). Getting
// these two confused would silently use the old balance as the proposed
// loan amount (wildly wrong LTV) or vice versa, so this category is scored
// and disambiguated the same way property value / loan amount / cash-out
// are, never by simple keyword adjacency.
const EXISTING_LIEN_TERMS =
  /\bcurrent loan balance\b|\bcurrent mortgage balance\b|\bexisting mortgage balance\b|\bexisting loan balance\b|\bloan balance\b|\bmortgage balance\b|\bcurrent balance\b|\bexisting balance\b|\bcurrent mortgage\b|\bexisting mortgage\b|\bexisting loan\b|\bremaining mortgage\b|\bremaining on (?:the )?mortgage\b|\bfirst mortgage\b|\bunpaid principal balance\b|\bprincipal balance\b|\bupb\b|\bamount (?:they |he |she )?still owed?\b|\bstill owed?\b|\bstill owes\b|\bborrower still owes\b|\bpayoff\b|\bpayoff amount\b|\bestimated payoff\b|\bcurrent payoff\b|\bremaining balance\b|\bbalance on the property\b|\bfirst mortgage balance\b|\bexisting first lien\b|\bexisting lien\b|\bdebt currently secured by the property\b|\bthey owe\b|\bhe owes\b|\bshe owes\b|\bcurrently owe[sd]?\b|\bowed?\b|\bowes\b/;

// Requested cash-out proceeds — the DOLLAR figure a cash-out refinance
// borrower wants in hand. Broadened beyond the literal "cash out"/"cash
// back"/"proceeds" phrases to the many equivalent ways a broker actually
// says this ("receive $X", "net $X", "walk away with $X", "$X after
// closing costs/fees/costs", "cash in hand") — real transcripts routinely
// state the amount with NONE of the three original phrases anywhere near
// it (e.g. "would like to receive $250,000 in cash after closing costs").
const CASH_OUT_AMOUNT_TERMS =
  /\bcash[\s-]?out\b|\bcash back\b|\bproceeds\b|\breceive\b|\breceiving\b|\bnet\b|\bwalk away with\b|\bcash in hand\b|\bin cash\b|\bafter closing costs\b|\bafter fees\b|\bafter costs\b|\bafter closing\b|\bafter closing expenses\b|\bback at closing\b|\bcash requested\b|\bcash needed\b|\bwants to net\b|\bwants proceeds\b|\bneeds proceeds\b|\bpulling out\b|\btaking out\b|\bwants equity\b|\bwants money\b|\bwants funds\b|\bwants access to\b|\bcash to (?:the )?borrower\b|\bfunds to (?:the )?borrower\b/;

const CREDIT_SCORE_CONTEXT = /\bfico\b|credit score|\bscore\b|\bcredit\b|\bsitting at\b/;
const INCOME_CONTEXT = /\bincome\b|\bannually\b|\bearns?\b|\bsalary\b|per year|per month|\bearning\b/;
const RENT_CONTEXT = /\brent\b|rental income\b/;
const DISQUALIFYING_CONTEXT = new RegExp(
  `${CREDIT_SCORE_CONTEXT.source}|${INCOME_CONTEXT.source}|${RENT_CONTEXT.source}|\\bdscr\\b|\\breserves?\\b|\\binterest rate\\b|\\brate of\\b|\\bunits?\\b|\\byears? in business\\b|\\bmonths? of seasoning\\b|\\bzip\\b|\\b1099s?\\b`
  // "1099" is added here specifically: the literal number 1099 is
  // unambiguously the tax-form reference ("1099 only", "a 1099
  // contractor"), never a real dollar figure at that scale — but its own
  // narrow clause (after "independent contractor income, 1099 only" is
  // split by the comma into two clauses) doesn't always contain "income"
  // or another disqualifying word, so without this it can fall through to
  // the generic unlabeled-number fallback and get misread as a loan amount.
);

// NOTE: "X percent financing"/"X percent financed"/"financing percentage of
// X" all mean X IS the LTV directly (the percentage of value being
// financed/borrowed) — NOT a down payment to invert. These belong in
// LTV_DIRECT_TERMS, never in DOWN_PAYMENT_TERMS (an earlier version of this
// code wrongly bucketed them as a down payment and computed 100-X, which
// silently flipped e.g. "eighty percent financing" — meaning 80% LTV —
// into an assumed 20% LTV).
const DOWN_PAYMENT_TERMS = /\bdown payment\b|\bputting down\b|\bput down\b|\bequity position\b|\bminimum down\b|\bdown\b/;
const LTV_DIRECT_TERMS =
  /\bltv\b|loan[\s-]*to[\s-]*value|\bleverage\b|\bpercent(?:age)? financ(?:ed|ing)\b|\bfinanc(?:ed|ing) percent(?:age)?\b/;
// The reversed word-order variant ("they'll finance eighty percent", with
// the number sitting between "finance" and "percent") needs a wider,
// bounded character gap to bridge that word order — but that gap is wide
// enough to also bridge an UNRELATED "and"-joined clause in the same
// sentence ("finance seventy-five percent AND put twenty-five percent
// down" — checking this pattern at the SENTENCE level would wrongly make
// the down-payment clause's "25" look like it's also "X percent
// financing", since the earlier clause's "finance...percent" text is
// still physically present somewhere in that wider sentence scope). Kept
// as a separate, CLAUSE-ONLY check for exactly that reason — never tested
// against the wider `sentence` fallback the way LTV_DIRECT_TERMS above is.
const LTV_DIRECT_REVERSED_CLAUSE_ONLY = /\bfinanc(?:e|ing|ed)\b[^.!?;]{0,20}\bpercent(?:age)?\b|\bpercent(?:age)?\b[^.!?;]{0,20}\bfinanc(?:e|ing|ed)\b/;
// Dollar-DENOMINATED down payment ("putting $100,000 down", "$50k down
// payment", "bringing $80,000 to closing") — previously had no home in the
// dollar-band classifier at all (only a PERCENT-based down payment, e.g.
// "10% down", was recognized), so a spoken dollar down payment fell through
// to the generic unlabeled-number fallback and could be misassigned as the
// loan amount itself instead of being subtracted from the property value.
// Note: multi-word phrases here are split into independent single-word
// alternatives ("bring(?:ing)?" / "to closing", not a joined "bringing to
// closing") because the dollar figure itself normally sits BETWEEN the two
// halves ("bringing $65,000 to closing") — a joined phrase would never
// match since the words aren't actually adjacent in real speech. Kept
// SEPARATE from DOWN_PAYMENT_TERMS above (the percent-band set) — "bring
// to closing"/"cash to close"/"out of pocket" only make sense next to a
// DOLLAR figure ("bringing $X to closing"); nobody says "bringing 80% to
// closing", and letting those phrases leak into the percent-band matcher
// previously caused a real regression (a sentence mentioning BOTH a dollar
// down payment AND a separate LTV percentage, e.g. "bringing $200,000 to
// closing, so eighty percent financing", had the unrelated 80% wrongly
// re-classified as a down-payment percentage just because "bringing"/"to
// closing" appeared anywhere in the same sentence).
const DOWN_PAYMENT_DOLLAR_TERMS = /\bdown payment\b|\bputting down\b|\bput down\b|\bbring(?:ing)?\b|\bto closing\b|\bcash to close\b|\bout of pocket\b|\bminimum down\b|\bdown\b/;

interface BoundaryHit {
  index: number;
  end: number;
}

function findBoundaries(t: string, re: RegExp): BoundaryHit[] {
  const hits: BoundaryHit[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = g.exec(t)) !== null) hits.push({ index: m.index, end: m.index + m[0].length });
  return hits;
}

function rangeAround(index: number, len: number, boundaries: BoundaryHit[], textLength: number): { start: number; end: number } {
  const priorEnds = boundaries.filter((b) => b.end <= index).map((b) => b.end);
  const start = priorEnds.length > 0 ? Math.max(...priorEnds) : 0;
  const nextStart = boundaries.find((b) => b.index >= index + len);
  const end = nextStart ? nextStart.index : textLength;
  return { start, end };
}

/** Smallest TRUE character gap between `[numStart, numEnd)` and any
 * occurrence of `re` whose match falls within [from, to) of the full text —
 * Infinity if none is found, so "nearest relevant alias term in this
 * sentence" can be compared across candidate fields regardless of word
 * order. Deliberately measures edge-to-edge (0 when the spans touch or
 * overlap), NOT start-to-start — start-to-start distance is asymmetric: it
 * counts a preceding term's own text length as part of the "distance" (so
 * "property value is $500,000" looks artificially far from its own label)
 * while a following term's text length is excluded entirely (so "$500,000,
 * the loan amount is..." looks artificially CLOSE to a label that doesn't
 * even describe it). That asymmetry systematically favored whichever label
 * happened to sit right after a number over the one immediately preceding
 * it, misreading which figure was the property value vs. the loan amount
 * whenever a sentence named both without a clause boundary between them
 * (e.g. two dollar figures in one un-punctuated breath).
 *
 * Ties are broken in favor of a term that PRECEDES the number over one
 * that follows it (a tiny epsilon added only to a following match) — in
 * natural English, "<label> <number>" word order is the default, so when
 * two labels sit at genuinely equal distance on either side of a number
 * ("value 500000 loan 400000", read left to right), the number belongs to
 * the label that comes right before it, not the one describing the NEXT
 * number that merely happens to sit an equal number of characters after.
 *
 * A copula/filler word directly between a PRECEDING label and its number
 * ("value IS 500000", "appraised AT 500000") is collapsed to a near-zero
 * gap rather than counted literally — otherwise a label phrased with a
 * linking verb ("loan IS 400000") loses to a same-sentence label phrased
 * without one ("financing 400000" — the dollar sign sits directly against
 * the word) purely because of that verb's character count, even though
 * both constructions are equally direct. Only a gap of filler words ALONE
 * collapses; genuine unrelated text in between (e.g. another clause's own
 * label/number) still measures as a real, larger distance. */
const FILLER_GAP = /^(?:is|was|are|were|of|at|around|about|approximately|roughly|near|for|equals|equal to|totaling|totals)?$/i;
function nearestTermDistance(t: string, from: number, to: number, numStart: number, numEnd: number, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let best = Infinity;
  let m: RegExpExecArray | null;
  while ((m = g.exec(t)) !== null) {
    if (m.index < from || m.index >= to) continue;
    const termEnd = m.index + m[0].length;
    let d: number;
    if (termEnd <= numStart) {
      const gapText = t.slice(termEnd, numStart).trim();
      d = FILLER_GAP.test(gapText) ? 0 : numStart - termEnd;
    } else if (numEnd <= m.index) {
      const gapText = t.slice(numEnd, m.index).trim();
      d = (FILLER_GAP.test(gapText) ? 0 : m.index - numEnd) + 0.5;
    } else {
      d = 0; // overlapping spans
    }
    if (d < best) best = d;
  }
  return best;
}

const round2ForLtv = (n: number) => Math.round(n * 100) / 100;

export interface AmountClassification {
  propertyValue?: { value: number; source: string; inferred?: boolean };
  loanAmount?: { value: number; source: string; inferred?: boolean };
  requestedCashOut?: { value: number; source: string };
  existingLienBalance?: { value: number; source: string };
  /** A DOLLAR-denominated down payment ("putting $100,000 down") — resolved
   * against propertyValue into a real loanAmount/ltv by the caller, never
   * treated as the loan amount itself. */
  downPaymentDollar?: { value: number; source: string };
  ltv?: { value: number; source: string };
  /** Set when the fallback path assigned BOTH value and loan from two
   * unlabeled dollar figures (larger → value, smaller → loan) — callers use
   * this to add a single explanatory note rather than guessing why. */
  assumedBothFromUnlabeledPair?: boolean;
}

/** Classifies every dollar amount and LTV/down-payment percentage in an
 * already-normalized transcript by MEANING, not proximity — see the header
 * comment above for the approach. Exported and independently testable. */
export function classifyMortgageAmounts(t: string): AmountClassification {
  // Clause boundaries include comma/"and" AND sentence-enders, so a clause
  // never crosses a full sentence — a clause is always the tightest scope,
  // sentence the fallback-widened one (clause ⊆ sentence).
  const clauseBoundaries = findBoundaries(t, /,|;|\band\b|\.|\?|!/);
  const sentenceBoundaries = findBoundaries(t, /\.|\?|!/);

  // ---- percent-band: LTV stated directly, or down payment / equity -------
  // Deliberately keeps scanning ALL matching candidates and lets the LAST
  // one win (no `break` on first match) rather than stopping at the first
  // qualifying percentage in the transcript. Two percent candidates can
  // legitimately end up sharing one clause after a mid-speech correction
  // is stripped ("twenty percent down, I mean, twenty-five percent down"
  // becomes one clause with a single trailing "down" once the misspoken
  // "down," and the correction phrase are removed) — first-match-wins
  // would silently keep the WRONG, earlier value in that case. Last-wins
  // is also the correct default with no correction at all: if a broker
  // restates a number in natural speech, the later figure is the one that
  // was meant to stick.
  let ltv: { value: number; source: string } | undefined;
  const percentRe = /\$?(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)?\b/g;
  let pm: RegExpExecArray | null;
  while ((pm = percentRe.exec(t)) !== null) {
    const n = parseFloat(pm[1] ?? "");
    if (!Number.isFinite(n) || n < 1 || n > 100) continue;
    const clauseRange = rangeAround(pm.index, pm[0].length, clauseBoundaries, t.length);
    const sentRange = rangeAround(pm.index, pm[0].length, sentenceBoundaries, t.length);
    const clause = t.slice(clauseRange.start, clauseRange.end);
    const sentence = t.slice(sentRange.start, sentRange.end);
    if (LTV_DIRECT_TERMS.test(clause) || LTV_DIRECT_TERMS.test(sentence) || LTV_DIRECT_REVERSED_CLAUSE_ONLY.test(clause)) {
      ltv = { value: n, source: clause.trim() || sentence.trim() };
      continue;
    }
    if (DOWN_PAYMENT_TERMS.test(clause) || DOWN_PAYMENT_TERMS.test(sentence)) {
      ltv = { value: round2ForLtv(100 - n), source: `${clause.trim() || sentence.trim()} (down payment converted to LTV)` };
    }
  }

  // ---- dollar-band: property value / loan amount / cash-out / lien -------
  let propertyValue: { value: number; source: string; inferred?: boolean } | undefined;
  let loanAmount: { value: number; source: string; inferred?: boolean } | undefined;
  let requestedCashOut: { value: number; source: string } | undefined;
  let existingLienBalance: { value: number; source: string } | undefined;
  let downPaymentDollar: { value: number; source: string } | undefined;
  const unclassified: Array<{ num: number; index: number; source: string }> = [];
  const dollarRe = /\$?(\d{4,9})\b/g;
  let dm: RegExpExecArray | null;
  while ((dm = dollarRe.exec(t)) !== null) {
    const n = parseInt(dm[1] ?? "", 10);
    if (!Number.isFinite(n) || n < 1_000) continue;
    const clauseRange = rangeAround(dm.index, dm[0].length, clauseBoundaries, t.length);
    const clause = t.slice(clauseRange.start, clauseRange.end);
    if (DISQUALIFYING_CONTEXT.test(clause)) continue; // rent / income / credit-score / DSCR / reserves clause — never a value or loan

    const sentRange = rangeAround(dm.index, dm[0].length, sentenceBoundaries, t.length);
    const sentence = t.slice(sentRange.start, sentRange.end);
    // A clause carrying a specific EXISTING_LIEN_TERMS phrase (e.g.
    // "current loan balance") must not lose to the bare "loan"/"borrow"/
    // "property"/"purchase" words embedded WITHIN that very phrase, which
    // otherwise sit a few characters closer to the number and would win on
    // raw distance alone — so weak/bare terms from other categories are
    // suppressed whenever a lien phrase is already present.
    const clauseHasLien = EXISTING_LIEN_TERMS.test(clause);
    const sentenceHasLien = EXISTING_LIEN_TERMS.test(sentence);
    const loanTermsForClause = clauseHasLien ? LOAN_AMOUNT_STRONG_TERMS : LOAN_AMOUNT_TERMS;
    const loanTermsForSentence = sentenceHasLien ? LOAN_AMOUNT_STRONG_TERMS : LOAN_AMOUNT_TERMS;
    const dmEnd = dm.index + dm[0].length;
    // Clause-scoped distance first — this is what stops a term that
    // actually belongs to the OTHER number in the same sentence (e.g. "the
    // purchase price is $600,000 and the loan request is $450,000") from
    // winning just because it happens to sit fewer characters away. Only
    // widen to the full sentence when the number's own clause has no
    // relevant term at all (e.g. "...worth approximately $600,000" with no
    // comma/"and" to bound a narrower clause).
    let dCashOut = nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, dmEnd, CASH_OUT_AMOUNT_TERMS);
    let dLien = nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, dmEnd, EXISTING_LIEN_TERMS);
    let dLoan = nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, dmEnd, loanTermsForClause);
    let dDown = nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, dmEnd, DOWN_PAYMENT_DOLLAR_TERMS);
    let dValue = clauseHasLien
      ? nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, dmEnd, PROPERTY_VALUE_TERMS)
      : Math.min(
          nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, dmEnd, PROPERTY_VALUE_TERMS),
          nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, dmEnd, PROPERTY_VALUE_WEAK_TERMS)
        );
    if (dCashOut === Infinity && dLien === Infinity && dLoan === Infinity && dValue === Infinity && dDown === Infinity) {
      dCashOut = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, dmEnd, CASH_OUT_AMOUNT_TERMS);
      dLien = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, dmEnd, EXISTING_LIEN_TERMS);
      dLoan = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, dmEnd, loanTermsForSentence);
      dValue = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, dmEnd, PROPERTY_VALUE_TERMS);
      dDown = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, dmEnd, DOWN_PAYMENT_DOLLAR_TERMS);
    }
    const min = Math.min(dCashOut, dLien, dLoan, dValue, dDown);
    const source = clause.trim();

    if (min === Infinity) {
      unclassified.push({ num: n, index: dm.index, source: `$${n}` });
    } else if (min === dCashOut && !requestedCashOut) {
      requestedCashOut = { value: n, source };
    } else if (min === dLien && !existingLienBalance) {
      existingLienBalance = { value: n, source };
    } else if (min === dDown && !downPaymentDollar) {
      // Checked AHEAD of dLoan/dValue below only via the Math.min ordering
      // above — a bare "down" is part of DOWN_PAYMENT_DOLLAR_TERMS, so a
      // number genuinely near "down"/"down payment"/"put down" wins this
      // category over the generic LOAN_AMOUNT_TERMS' bare "loan"/"borrow",
      // preventing a real down payment from ever being misread as the loan
      // amount itself.
      downPaymentDollar = { value: n, source };
    } else if (min === dLoan && !loanAmount) {
      loanAmount = { value: n, source };
    } else if (min === dValue && !propertyValue) {
      propertyValue = { value: n, source };
    } else {
      // The nearest term's field is already filled (e.g. two numbers both
      // read as closest to "value") — fall through to the unlabeled pass,
      // which fills whichever slot is still open.
      unclassified.push({ num: n, index: dm.index, source: `$${n}` });
    }
  }

  // Bare small numbers ("a value of about 600") are common mortgage-broker
  // shorthand for the thousands figure. Only expand a 2-3 digit number
  // (100-999) into thousands when a strong property-value or loan-amount
  // term sits genuinely close by in its own clause — never just because a
  // number happens to be small, which would risk misreading unit counts,
  // seasoning months, or other unrelated figures.
  const NEAR_CHARS = 20;
  const smallRe = /\$?(\d{2,3})\b/g;
  let sm: RegExpExecArray | null;
  while ((sm = smallRe.exec(t)) !== null) {
    const n = parseInt(sm[1] ?? "", 10);
    if (!Number.isFinite(n) || n < 100 || n > 999) continue;
    const clauseRange = rangeAround(sm.index, sm[0].length, clauseBoundaries, t.length);
    const clause = t.slice(clauseRange.start, clauseRange.end);
    if (DISQUALIFYING_CONTEXT.test(clause)) continue;
    const smEnd = sm.index + sm[0].length;
    const dValue = Math.min(
      nearestTermDistance(t, clauseRange.start, clauseRange.end, sm.index, smEnd, PROPERTY_VALUE_TERMS),
      nearestTermDistance(t, clauseRange.start, clauseRange.end, sm.index, smEnd, PROPERTY_VALUE_WEAK_TERMS)
    );
    const dLoan = nearestTermDistance(t, clauseRange.start, clauseRange.end, sm.index, smEnd, LOAN_AMOUNT_TERMS);
    const dLien = nearestTermDistance(t, clauseRange.start, clauseRange.end, sm.index, smEnd, EXISTING_LIEN_TERMS);
    if (!propertyValue && dValue <= NEAR_CHARS && dValue <= dLoan && dValue <= dLien) {
      propertyValue = { value: n * 1_000, source: clause.trim() };
    } else if (!existingLienBalance && dLien <= NEAR_CHARS && dLien < dValue && dLien <= dLoan) {
      existingLienBalance = { value: n * 1_000, source: clause.trim() };
    } else if (!loanAmount && dLoan <= NEAR_CHARS && dLoan < dValue && dLoan < dLien) {
      loanAmount = { value: n * 1_000, source: clause.trim() };
    }
  }

  // Unlabeled fallback — mirrors the prior behavior: with a leftover dollar
  // figure and a still-open slot, fill property value first (asked first),
  // then loan amount if it's smaller than the value already captured.
  let assumedBothFromUnlabeledPair = false;
  if (!propertyValue && !loanAmount && unclassified.length >= 2) {
    const sorted = [...unclassified].sort((a, b) => b.num - a.num);
    const larger = sorted[0]!;
    const smaller = sorted[1]!;
    propertyValue = { value: larger.num, source: `assumed larger figure $${larger.num} is the value`, inferred: true };
    loanAmount = { value: smaller.num, source: `assumed smaller figure $${smaller.num} is the loan`, inferred: true };
    assumedBothFromUnlabeledPair = true;
  } else {
    for (const u of unclassified) {
      if (!propertyValue) {
        propertyValue = { value: u.num, source: `assumed $${u.num} is the property value`, inferred: true };
      } else if (!loanAmount && u.num < propertyValue.value) {
        loanAmount = { value: u.num, source: `assumed $${u.num} is the loan amount`, inferred: true };
      }
    }
  }

  return { propertyValue, loanAmount, requestedCashOut, existingLienBalance, downPaymentDollar, ltv, assumedBothFromUnlabeledPair };
}

export function extractFromTranscript(rawTranscript: string): VoiceExtraction {
  const x = emptyExtraction();
  if (!rawTranscript.trim()) return x;
  const t = ` ${normalizeTranscript(rawTranscript)} `;

  // ---- FICO ---------------------------------------------------------------
  // Window widened from 14 to 32 chars so an estimate qualifier between the
  // label and the number ("credit score is approximately 740") doesn't push
  // the number outside the match — "approximately "/"around "/"roughly "
  // alone can already eat 12-15 characters.
  const fico = firstMatch(
    t,
    [
      /(?:\bfico\b|credit score|\bscore\b|\bcredit\b|\bsitting at\b)[^\d%]{0,32}(\d{3})\b/,
      /\b(\d{3})\s*(?:\bfico\b|credit score|\bscore\b|\bcredit\b)/,
    ],
    (n) => n >= 300 && n <= 850
  );
  if (fico) x.fico = cap(Math.round(fico.num), fico.source);
  // No numeric FICO found — check for a valid NONNUMERIC credit-profile
  // statement (F-1 visa / no-FICO fix, 2026-07-28) rather than leaving the
  // credit-profile Vital blank. A stated "no FICO"/"no U.S. credit"/etc. is
  // a legitimate, resolved answer, never treated as missing data.
  if (!x.fico) {
    const creditProfile = classifyCreditProfile(t);
    if (creditProfile) x.creditProfileType = cap(creditProfile.value, creditProfile.source);
  }

  // ---- Property value, loan amount, LTV, cash-out (semantic, not proximity)
  // See classifyMortgageAmounts() above — replaces the old fixed-order,
  // fixed-window regex matching that missed phrasing like "estimated at
  // around $600,000 in value" (the label trailing the number by a whole
  // phrase) and confused rent/income/credit-score figures for the value or
  // loan amount when they appeared in the same sentence.
  const amounts = classifyMortgageAmounts(t);
  if (amounts.ltv) x.statedLtv = cap(amounts.ltv.value, amounts.ltv.source);
  if (amounts.propertyValue) x.propertyValue = cap(Math.round(amounts.propertyValue.value), amounts.propertyValue.source, amounts.propertyValue.inferred);
  if (amounts.loanAmount) x.loanAmount = cap(Math.round(amounts.loanAmount.value), amounts.loanAmount.source, amounts.loanAmount.inferred);
  if (amounts.requestedCashOut) x.requestedCashOut = cap(Math.round(amounts.requestedCashOut.value), amounts.requestedCashOut.source);
  if (amounts.existingLienBalance) x.existingLienBalance = cap(Math.round(amounts.existingLienBalance.value), amounts.existingLienBalance.source);
  // A dollar-denominated down payment ("putting $100,000 down") only makes
  // sense once we know the property value, and only when the loan amount
  // wasn't ALSO stated directly (which would already be more specific and
  // authoritative than deriving it from value minus down payment).
  if (amounts.downPaymentDollar && amounts.propertyValue && !amounts.loanAmount && !amounts.ltv) {
    const value = amounts.propertyValue.value;
    const down = amounts.downPaymentDollar.value;
    const derivedLoan = Math.round(value - down);
    x.loanAmount = cap(derivedLoan, `${amounts.downPaymentDollar.source} (down payment subtracted from value)`);
    x.statedLtv = cap(round2ForLtv((derivedLoan / value) * 100), `${amounts.downPaymentDollar.source} (down payment converted to LTV)`);
  }
  if (amounts.assumedBothFromUnlabeledPair) {
    x.notesFragments.push("Two dollar figures were given without labels; assumed the larger is the property value.");
  }

  // ---- Loan purpose ---------------------------------------------------------
  // Shared, independently-testable classifier — the single source of truth
  // used by both the voice-transcript path (here) and reusable wherever
  // else free text needs a loan-purpose call (see docs/voice-vitals.md's
  // "one shared extraction and normalization layer" requirement). Priority
  // when multiple signals appear: cash-out > rate-and-term > generic refi
  // pending subtype > purchase.
  const purposeResult = classifyLoanPurpose(t);
  if (purposeResult) {
    x.loanPurpose = cap(purposeResult.value, purposeResult.source, purposeResult.inferred);
    if (purposeResult.pendingSubtype) x.refinancePendingSubtype = true;
  } else if (x.requestedCashOut) {
    // A real requested cash-out dollar amount was captured — receiving
    // cash proceeds on a refinance IS a cash-out refinance by definition,
    // even when no literal "cash-out"/"cash-out refi" label was ever
    // spoken (e.g. "...owe $300,000 and want $250,000 cash after closing
    // costs" never says the words "cash-out" at all).
    x.loanPurpose = cap(LoanPurpose.CashOutRefinance, `inferred from a stated cash-out amount ($${x.requestedCashOut.value})`, true);
  } else if (x.existingLienBalance) {
    // A stated existing mortgage balance/payoff on the subject property
    // can only mean a refinance (a purchase has no existing lien to
    // refer to) — pending subtype since no cash-out amount was found to
    // resolve cash-out vs. plain rate-and-term.
    x.loanPurpose = cap(LoanPurpose.RateAndTermRefinance, `inferred from a stated existing mortgage balance ($${x.existingLienBalance.value}) — no purchase has an existing lien`, true);
    x.refinancePendingSubtype = true;
  } else {
    // No explicit purchase/refinance language at all — but "first-time
    // homebuyer" (in any of its phrasings) is only ever possible on a
    // purchase; a first-time buyer cannot be refinancing a property they've
    // never owned. Several real broker transcripts open straight with "need
    // a bank statement loan for a first-time homebuyer..." and never say
    // "purchase" or "buying" explicitly at all.
    const fthbSignal = classifyFirstTimeHomebuyer(t);
    if (fthbSignal?.value === true) {
      x.loanPurpose = cap(LoanPurpose.Purchase, `inferred from "${fthbSignal.source}" (a first-time buyer can only be purchasing)`, true);
    }
  }
  // A generic "refinance"/"refi" with no subtype language ALSO resolves
  // immediately once a real cash-out dollar amount was separately
  // captured — the broker never needs to be asked "cash-out or
  // rate-and-term?" when they already stated an actual amount they want
  // in hand (e.g. "Need some refinance options... want $250,000 cash
  // after closing" — "refinance" alone only matched the generic/pending
  // phrase above, but the cash amount makes the subtype unambiguous).
  if (x.refinancePendingSubtype && x.requestedCashOut) {
    x.loanPurpose = cap(LoanPurpose.CashOutRefinance, `inferred from a stated cash-out amount ($${x.requestedCashOut.value})`, true);
    x.refinancePendingSubtype = false;
  }

  // ---- Occupancy ----------------------------------------------------------
  if (/second home|vacation home|secondary residence/.test(t)) x.occupancy = cap(Occupancy.SecondHome, "second home");
  else if (/investment propert|rental propert|\binvestment\b(?!\s+account|\s+portfolio)|\brental\b|\binvestor\b|non[\s-]owner|tenant[\s-]occupied|airbnb|short[\s-]term rental|\bstr\b|purchas\w* to rent\b|buying (?:it |this |the property )?as an investment\b|strictly as an investment\b/.test(t)) {
    x.occupancy = cap(Occupancy.Investment, "investment / rental");
    if (/airbnb|short[\s-]term rental|\bstr\b/.test(t)) x.shortTermRental = true;
  } else if (/primary residence|primary home|owner[\s-]occupied|principal residence|\bprimary\b|live in/.test(t)) {
    x.occupancy = cap(Occupancy.Primary, "primary residence");
  }

  // ---- Property type ------------------------------------------------------
  const unitMatch = /\b(\d{1,2})\s*(?:to\s*4\s*)?units?\b/.exec(t);
  // Warrantability matters for real LTV eligibility (see propertyTypeLtvCaps
  // in program.ts) — a bare "condo"/"condominium" with no warrantable/
  // non-warrantable qualifier must NOT be silently assumed as warrantable.
  // `explicitWarrantable` recognizes a standalone "warrantable" (not part of
  // "non-warrantable") so a follow-up answer like "it's warrantable" alone
  // (without repeating the word "condo") still resolves the pending flag,
  // mirroring how a bare "cash-out" alone resolves refinancePendingSubtype.
  const explicitWarrantable = /\bwarrantable\b/.test(t) && !/non[\s-]?warrantable/.test(t);
  if (/non[\s-]?warrantable/.test(t)) {
    x.propertyType = cap(PropertyType.NonWarrantableCondo, "non-warrantable condo");
    x.condoPendingWarrantability = false;
  } else if (/condo[\s-]?tel|\bpudtel\b/.test(t)) {
    x.propertyType = cap(PropertyType.Condotel, "condotel");
  } else if (explicitWarrantable) {
    x.propertyType = cap(PropertyType.Condo, "warrantable condo");
    x.condoPendingWarrantability = false;
  } else if (/condo(?:minium)?s?\b/.test(t)) {
    x.propertyType = cap(PropertyType.Condo, "condo (warrantability not yet specified)");
    x.condoPendingWarrantability = true;
  }
  else if (/town\s?(?:home|house)/.test(t)) x.propertyType = cap(PropertyType.Townhome, "townhome");
  else if (/\bduplex\b/.test(t)) { x.propertyType = cap(PropertyType.TwoToFourUnit, "duplex"); x.units = 2; }
  else if (/\btriplex\b/.test(t)) { x.propertyType = cap(PropertyType.TwoToFourUnit, "triplex"); x.units = 3; }
  else if (/\b(?:four|quad)[\s-]?plex\b/.test(t)) { x.propertyType = cap(PropertyType.TwoToFourUnit, "fourplex"); x.units = 4; }
  else if (unitMatch) {
    const n = parseInt(unitMatch[1] ?? "", 10);
    if (n >= 5) { x.propertyType = cap(PropertyType.FivePlusUnit, unitMatch[0].trim()); x.units = n; }
    else if (n >= 2) { x.propertyType = cap(PropertyType.TwoToFourUnit, unitMatch[0].trim()); x.units = n; }
    else if (n === 1) { x.propertyType = cap(PropertyType.SingleFamily, unitMatch[0].trim()); x.units = 1; }
  } else if (/\bpud\b|planned unit development/.test(t)) x.propertyType = cap(PropertyType.Pud, "PUD");
  else if (/manufactured|mobile home/.test(t)) x.propertyType = cap(PropertyType.Manufactured, "manufactured");
  else if (/\brural\b|\bfarm\b|acreage/.test(t)) x.propertyType = cap(PropertyType.Rural, "rural");
  else if (/single[\s-]?family|\bsfr\b|detached (?:home|house)|\bhouse\b/.test(t)) x.propertyType = cap(PropertyType.SingleFamily, "single-family");
  // Bare "home" only as the LAST resort (after every more specific type
  // above already failed to match) — "home" alone is genuinely ambiguous
  // in general (it appears constantly in occupancy phrasing like "primary
  // home"), but once nothing more specific was said, it is the single most
  // common real-world case and the natural-language default a broker means.
  else if (/\bhome\b/.test(t)) x.propertyType = cap(PropertyType.SingleFamily, "home (assumed single-family — no more specific type stated)", true);

  // ---- Income documentation ----------------------------------------------
  // Same concept-based (not exact-phrase) approach applied consistently
  // across every doc type this platform models — real broker slang and
  // paraphrases for each are recognized as the same underlying concept,
  // not just the formal name of the product.
  //
  // Full-Documentation Income Detection update (2026-07-29): expands the
  // Full Doc branch with the real speech-to-text variation "full dock"
  // (a common STT mishearing of "Full Doc") plus a much broader set of
  // real broker phrasings for traditional/tax-return/W-2 qualification
  // (taxes to qualify, personal/business/federal tax returns, 1040s, wage/
  // salaried/payroll/employment income, pay stubs, IRS transcripts,
  // 4506-C, standard/conventional documentation). This branch remains
  // LAST in the priority chain (after bank statement / DSCR / P&L / 1099
  // / asset depletion / WVOE) so an explicitly stated ALTERNATIVE
  // documentation program is never silently overwritten by a full-doc
  // phrase mentioned elsewhere in the same transcript — e.g. "they don't
  // need a bank statement loan because they can qualify using taxes"
  // still correctly resolves to Full Doc (bank_statement's own regex
  // requires an affirmative "bank statement(s)" mention, which isn't
  // present in that sentence), while "12 months of bank statements, but
  // they also have tax returns" still correctly resolves to bank_statement
  // (the explicit alternative program wins, per spec priority rule 3).
  //
  // Ambiguity guard (spec priority rule 5): when the transcript hedges
  // between two doc types with NO stated preference ("not sure which",
  // "haven't decided", "either... or", "could go either way") alongside
  // BOTH a full-doc-style mention (taxes/W-2/pay stubs) AND an
  // alternative-doc mention (bank statements/P&L/1099/asset/DSCR/WVOE),
  // leave incomeDocType unset entirely rather than guessing — this
  // correctly re-surfaces the income-documentation Vital for the user to
  // resolve, instead of silently picking one side.
  const fullDocPattern =
    /full[\s-]?doc(?:s|umentation)?\b|full[\s-]?dock\b|fully documented\b|traditional (?:income )?documentation\b|conventional (?:income )?documentation\b|standard (?:income )?documentation\b|normal (?:income )?documentation\b|(?:personal|business|federal)\s+tax returns?\b|\btax returns?\b|taxes? (?:to|used to) qualify\b|qualify(?:ing)? (?:using|with|off) (?:the )?taxes\b|\b1040s?\b|\bw-?2s?\b|wage income\b|salaried income\b|pay ?stubs?\b|payroll income\b|employment income\b|\btranscripts?\b|irs transcripts?\b|4506-?c\b/;
  const bankStatementPattern = /bank statements?|bank deposits\b|qualifying off deposits\b|deposit[\s-]only income\b|deposit[\s-]based income\b|\b(?:personal|business)\s+deposits\b|deposits for income\b/;
  const dscrPattern = /\bdscr\b|debt[\s-]?service|investor cash[\s-]?flow|rental income only|no[\s-]ratio|cash[\s-]?flow (?:only )?loan|rental cash[\s-]?flow|property('s)? cash[\s-]?flow|qualify(?:ing)? off (?:the )?(?:rent|property)|no income no employment/;
  const pnlPattern = /p\s*&\s*l|p and l|\bpnl\b|profit and loss|cpa[\s-]prepared statement|accountant[\s-]prepared statement/;
  const income1099Pattern = /\b1099s?\b|independent contractor income|contractor income only/;
  const assetDepletionPattern = /asset (?:depletion|utilization|based|qualifier)|qualify(?:ing)? off (?:their |his |her )?assets\b|using (?:their |his |her )?assets to qualify\b|no income at all\s*,?\s*just using (?:their |his |her )?(?:investment )?accounts\b|qualifying off (?:their |his |her )?(?:investment )?(?:accounts|portfolio)\b/;
  // WVOE (Written Verification of Employment) — first-class semantic intent
  // (2026-07-29 WVOE Detection update). Recognized as a distinct Full-
  // Documentation-style qualification pathway: employment (not tax returns)
  // is the income evidence. Broad concept coverage, not just the formal
  // "WVOE"/"written verification of employment" name — real broker speech
  // and speech-to-text output routinely drop "written"/"of", spell the
  // acronym out letter-by-letter, or phrase it as the employer/HR
  // confirming or verifying income:
  //   - the bare acronym in any spoken/STT form: "wvoe", "w v o e",
  //     "w-v-o-e", "w.v.o.e", "double u v o e" (STT spelling out "W"),
  //     bare "voe" ("VOE", "written VOE", "VOE loan")
  //   - "written verification of employment" / "verification of
  //     employment" (loan/program/type loan variants all match as
  //     substrings) / "verification employment" (STT dropping "of")
  //   - "verify employment" / "verifying employment" / "employment
  //     verified" / "employment verification" / "employment confirmation"
  //     / "employment letter" / "written employment letter" /
  //     "written employment verification"
  //   - "employer verification" / "employer verified (income)" /
  //     "employer letter" / "employer confirmation" / "employer confirms
  //     (the) income" / "verification from employer" / "verification
  //     letter from employer"
  //   - "income verified by employer"
  //   - contextual "the employer can/will verify the income", "the
  //     employer is providing income verification"
  //   - legacy: "verbal verification"/"verbal VOE" (a related but distinct
  //     verbal-only variant), "employer letter only"
  const wvoePattern =
    /\bw[\s.-]*v[\s.-]*o[\s.-]*e\b|\bdouble\s*u\s*v\s*o\s*e\b|\bvoe\b|written\s+(?:voe|verification\s+of\s+employment|employment\s+verification|employment\s+letter)\b|verif(?:y|ying|ication|ied|ies)\s+(?:of\s+)?employment\b|employment\s+(?:verif(?:ied|ication)|confirmation|letter)\b|employer\s+(?:verif(?:y|ying|ication|ied|ies)|letter|confirmation|confirms?)\b|verification\s+(?:from|letter\s+from)\s+employer\b|income\s+verified\s+by\s+employer\b|employer\s+(?:can|will|is\s+(?:able\s+to\s+)?)?\s*(?:verify|verifying|providing)\s+(?:the\s+)?income\b|verbal\s+(?:verification|voe)|employer letter only/;
  const hedgePattern = /not sure which|haven'?t decided|either\s.+\sor\s|could go either way|not sure yet|undecided/;

  // Ambiguity guard (spec priority rule 5): checked FIRST, before any
  // single doc-type branch commits — otherwise (e.g.) the bank-statement
  // branch below would always win outright and this guard would never be
  // reachable. Only fires when the transcript BOTH hedges between options
  // ("not sure which", "haven't decided", "either... or", "could go
  // either way") AND mentions 2+ distinct doc-type categories — a genuine
  // "has both, hasn't chosen" case, never a guess.
  const matchedCategoryCount = [bankStatementPattern, dscrPattern, pnlPattern, income1099Pattern, assetDepletionPattern, wvoePattern, fullDocPattern].filter((re) => re.test(t)).length;
  const isGenuinelyAmbiguous = hedgePattern.test(t) && matchedCategoryCount >= 2;

  if (isGenuinelyAmbiguous) {
    // Leave incomeDocType unset entirely so the missing-Vital flow re-asks
    // the user which method to use, rather than silently picking one side.
  } else if (bankStatementPattern.test(t)) {
    x.incomeDocType = cap(IncomeDocType.BankStatement, "bank statements");
    const months = /\b(12|24)\s*months?\b/.exec(t);
    if (months) x.bankStatementMonths = parseInt(months[1] ?? "", 10) as 12 | 24;
    const kind = /\b(personal|business)\b/.exec(t);
    if (kind) x.bankStatementKind = (kind[1] ?? "") as "personal" | "business";
  } else if (dscrPattern.test(t)) {
    x.incomeDocType = cap(IncomeDocType.Dscr, "DSCR");
  } else if (pnlPattern.test(t)) {
    x.incomeDocType = cap(IncomeDocType.ProfitAndLoss, "P&L");
  } else if (income1099Pattern.test(t)) {
    x.incomeDocType = cap(IncomeDocType.Income1099, "1099");
  } else if (assetDepletionPattern.test(t)) {
    x.incomeDocType = cap(IncomeDocType.AssetDepletion, "asset depletion");
  } else if (wvoePattern.test(t)) {
    x.incomeDocType = cap(IncomeDocType.WvoeOnly, "Written Verification of Employment (WVOE)");
  } else if (fullDocPattern.test(t)) {
    x.incomeDocType = cap(IncomeDocType.FullDoc, "full documentation");
  }

  // Employment type — a separate classification from incomeDocType (see
  // slots.ts). Concept-based, not exclusive to Full Doc: a borrower can be
  // self-employed on a DSCR, bank-statement, or P&L file just as easily as
  // on Full Doc, so this is captured independently whenever the
  // transcript supports it, never inferred FROM incomeDocType.
  if (/self[\s-]?employed|owns? (?:a |his |her |their )?(?:own )?business|business owner|1099 income|independent contractor|personal and business tax returns?|business tax returns?/.test(t)) {
    x.employmentType = cap("self_employed", "self-employed");
  } else if (/\bw-?2s?\b|salaried|salary income|wage income|hourly (?:employee|worker|wages?)|pay ?stubs?|payroll income|employment income|works? for (?:an? )?employer/.test(t)) {
    x.employmentType = cap("salaried_w2", "W-2/salaried");
  }

  // ---- Borrower extras ----------------------------------------------------
  x.citizenship = classifyCitizenship(t);
  x.state = classifyState(t);

  const investorExperience = classifyInvestorExperience(t);
  if (investorExperience) {
    x.investorExperience = cap(investorExperience.value, investorExperience.source);
    // Legacy boolean, kept for backward compatibility with existing callers.
    x.firstTimeInvestor = investorExperience.value === InvestorExperience.FirstTimeInvestor;
  }

  const firstTimeHomebuyer = classifyFirstTimeHomebuyer(t);
  if (firstTimeHomebuyer) x.firstTimeHomebuyer = cap(firstTimeHomebuyer.value, firstTimeHomebuyer.source);

  const vesting = classifyVesting(t);
  if (vesting) x.vesting = cap(vesting.value, vesting.source);

  return x;
}
