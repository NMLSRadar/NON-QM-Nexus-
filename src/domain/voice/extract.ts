import { Citizenship, IncomeDocType, InvestorExperience, LoanPurpose, Occupancy, PropertyType, Vesting } from "@/domain/types/enums";
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
  s = s.replace(/(\d),(?=\d{3}\b)/g, "$1"); // 850,000 -> 850000 (before any comma splitting)
  s = s.replace(/,/g, " , "); // remaining commas become separators
  s = s.replace(/([a-z0-9])([.!?;])/g, "$1 $2"); // detach sentence punctuation
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
  /cash[\s-]?outs?\b|cash[\s-]?out refi(?:nance)?\b|take (?:some |the )?cash out\b|pull(?:ing)? cash out\b|pull(?:ing)?[^.!?]{0,25}\bout\b|pull(?:ing)? equity\b|access(?:ing)? equity\b|tap(?:ping)? into equity\b|receiv(?:e|ing) proceeds\b|consolidat\w* debt with equity\b|pay(?:ing)? off debt using the property\b|refinanc\w*.{0,20}receiv\w* cash back\b/;

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
  /first[\s-]?time (?:home\s?)?buyer\b|first home\b|never owned a home\b|has not owned a home before\b|buying (?:their|his|her) first primary residence\b/;

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
    re: /\bindividual\b|personal name\b|borrower'?s name\b|their own name\b|husband and wife\b|\bjointly\b|joint tenants\b|tenants in common\b|individual vesting\b|vested personally\b/,
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
  /\brequested loan amount\b|\bproperty value\b|\bestimated value\b|\bmarket value\b|\bappraised value\b|\bappraisal value\b|\bexpected appraisal\b|\bappraises? for\b|\bsubject value\b|\bvalue of the property\b|\bpurchase price\b|\bsales? price\b|\bacquisition price\b|\bcontract price\b|\bhome price\b|\bproperty price\b|\bvalued at\b|\bworth\b|\bappraisal\b|\bappraise\b|\bvalue\b|\bprice\b/;
// Generic single words ("purchase", "property", "home") are real signals
// ("a $600,000 purchase", "looking at a $600,000 property") but far too
// common to search sentence-wide without false hits — scoped to the
// number's own clause only (see classifyMortgageAmounts).
const PROPERTY_VALUE_WEAK_TERMS = /\bpurchase\b|\bproperty\b|\bhome\b/;

const LOAN_AMOUNT_TERMS =
  /\brequested loan amount\b|\bloan amount\b|\bmortgage amount\b|\bfinancing amount\b|\bamount financed\b|\bnew loan\b|\bproposed loan\b|\bloan request\b|\bborrower needs?\b|\blooking to borrow\b|\bwants? to borrow\b|\bunpaid principal balance\b|\bfinancing\b|\bborrow\b|\bloan\b/;
// The specific phrases only (no bare "loan"/"borrow"/"financing") — used
// instead of the full set above whenever the clause already contains an
// EXISTING_LIEN_TERMS phrase, since those phrases (e.g. "current loan
// balance", "existing loan balance") literally contain the word "loan"/
// "borrow" themselves; without this, the bare word — sitting a few
// characters closer to the number than the full phrase's start — would
// win by raw distance and misclassify a lien balance as the new loan.
const LOAN_AMOUNT_STRONG_TERMS =
  /\brequested loan amount\b|\bloan amount\b|\bmortgage amount\b|\bfinancing amount\b|\bamount financed\b|\bnew loan\b|\bproposed loan\b|\bloan request\b|\bborrower needs?\b|\blooking to borrow\b|\bwants? to borrow\b|\bunpaid principal balance\b/;

// Refinance-only: what the borrower currently owes on the subject property
// — distinct from LOAN_AMOUNT_TERMS above (the NEW requested loan). Getting
// these two confused would silently use the old balance as the proposed
// loan amount (wildly wrong LTV) or vice versa, so this category is scored
// and disambiguated the same way property value / loan amount / cash-out
// are, never by simple keyword adjacency.
const EXISTING_LIEN_TERMS =
  /\bcurrent loan balance\b|\bcurrent mortgage balance\b|\bexisting mortgage balance\b|\bexisting loan balance\b|\bamount (?:they |he |she )?still owed?\b|\bstill owed?\b|\bstill owes\b|\bborrower still owes\b|\bpayoff amount\b|\bestimated payoff\b|\bcurrent payoff\b|\bremaining balance\b|\bbalance on the property\b|\bfirst mortgage balance\b|\bexisting first lien\b|\bexisting lien\b|\bdebt currently secured by the property\b|\bthey owe\b|\bhe owes\b|\bshe owes\b|\bcurrently owe[sd]?\b/;

const CASH_OUT_AMOUNT_TERMS = /\bcash[\s-]?out\b|\bcash back\b|\bproceeds\b/;

const CREDIT_SCORE_CONTEXT = /\bfico\b|credit score|\bscore\b|\bcredit\b/;
const INCOME_CONTEXT = /\bincome\b|\bannually\b|\bearns?\b|\bsalary\b|per year|per month|\bearning\b/;
const RENT_CONTEXT = /\brent\b|rental income\b/;
const DISQUALIFYING_CONTEXT = new RegExp(
  `${CREDIT_SCORE_CONTEXT.source}|${INCOME_CONTEXT.source}|${RENT_CONTEXT.source}|\\bdscr\\b|\\breserves?\\b|\\binterest rate\\b|\\brate of\\b|\\bunits?\\b|\\byears? in business\\b|\\bmonths? of seasoning\\b|\\bzip\\b`
);

const DOWN_PAYMENT_TERMS = /\bdown payment\b|\bputting down\b|\bpercent(?:age)? financed\b|\bfinancing percentage\b|\bequity position\b|\bdown\b/;
const LTV_DIRECT_TERMS = /\bltv\b|loan[\s-]*to[\s-]*value|\bleverage\b/;

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

/** Smallest distance from `numIndex` to any occurrence of `re` whose match
 * falls within [from, to) of the full text — Infinity if none is found, so
 * "nearest relevant alias term in this sentence" can be compared across
 * candidate fields regardless of word order. */
function nearestTermDistance(t: string, from: number, to: number, numIndex: number, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let best = Infinity;
  let m: RegExpExecArray | null;
  while ((m = g.exec(t)) !== null) {
    if (m.index < from || m.index >= to) continue;
    const d = Math.abs(m.index - numIndex);
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
    if (LTV_DIRECT_TERMS.test(clause) || LTV_DIRECT_TERMS.test(sentence)) {
      ltv = { value: n, source: clause.trim() || sentence.trim() };
      break;
    }
    if (DOWN_PAYMENT_TERMS.test(clause) || DOWN_PAYMENT_TERMS.test(sentence)) {
      ltv = { value: round2ForLtv(100 - n), source: `${clause.trim() || sentence.trim()} (down payment converted to LTV)` };
      break;
    }
  }

  // ---- dollar-band: property value / loan amount / cash-out / lien -------
  let propertyValue: { value: number; source: string; inferred?: boolean } | undefined;
  let loanAmount: { value: number; source: string; inferred?: boolean } | undefined;
  let requestedCashOut: { value: number; source: string } | undefined;
  let existingLienBalance: { value: number; source: string } | undefined;
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
    // Clause-scoped distance first — this is what stops a term that
    // actually belongs to the OTHER number in the same sentence (e.g. "the
    // purchase price is $600,000 and the loan request is $450,000") from
    // winning just because it happens to sit fewer characters away. Only
    // widen to the full sentence when the number's own clause has no
    // relevant term at all (e.g. "...worth approximately $600,000" with no
    // comma/"and" to bound a narrower clause).
    let dCashOut = nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, CASH_OUT_AMOUNT_TERMS);
    let dLien = nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, EXISTING_LIEN_TERMS);
    let dLoan = nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, loanTermsForClause);
    let dValue = clauseHasLien
      ? nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, PROPERTY_VALUE_TERMS)
      : Math.min(
          nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, PROPERTY_VALUE_TERMS),
          nearestTermDistance(t, clauseRange.start, clauseRange.end, dm.index, PROPERTY_VALUE_WEAK_TERMS)
        );
    if (dCashOut === Infinity && dLien === Infinity && dLoan === Infinity && dValue === Infinity) {
      dCashOut = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, CASH_OUT_AMOUNT_TERMS);
      dLien = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, EXISTING_LIEN_TERMS);
      dLoan = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, loanTermsForSentence);
      dValue = nearestTermDistance(t, sentRange.start, sentRange.end, dm.index, PROPERTY_VALUE_TERMS);
    }
    const min = Math.min(dCashOut, dLien, dLoan, dValue);
    const source = clause.trim();

    if (min === Infinity) {
      unclassified.push({ num: n, index: dm.index, source: `$${n}` });
    } else if (min === dCashOut && !requestedCashOut) {
      requestedCashOut = { value: n, source };
    } else if (min === dLien && !existingLienBalance) {
      existingLienBalance = { value: n, source };
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
    const dValue = Math.min(
      nearestTermDistance(t, clauseRange.start, clauseRange.end, sm.index, PROPERTY_VALUE_TERMS),
      nearestTermDistance(t, clauseRange.start, clauseRange.end, sm.index, PROPERTY_VALUE_WEAK_TERMS)
    );
    const dLoan = nearestTermDistance(t, clauseRange.start, clauseRange.end, sm.index, LOAN_AMOUNT_TERMS);
    const dLien = nearestTermDistance(t, clauseRange.start, clauseRange.end, sm.index, EXISTING_LIEN_TERMS);
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

  return { propertyValue, loanAmount, requestedCashOut, existingLienBalance, ltv, assumedBothFromUnlabeledPair };
}

export function extractFromTranscript(rawTranscript: string): VoiceExtraction {
  const x = emptyExtraction();
  if (!rawTranscript.trim()) return x;
  const t = ` ${normalizeTranscript(rawTranscript)} `;

  // ---- FICO ---------------------------------------------------------------
  const fico = firstMatch(
    t,
    [
      /(?:\bfico\b|credit score|\bscore\b|\bcredit\b)[^\d%]{0,14}(\d{3})\b/,
      /\b(\d{3})\s*(?:\bfico\b|credit score|\bscore\b|\bcredit\b)/,
    ],
    (n) => n >= 300 && n <= 850
  );
  if (fico) x.fico = cap(Math.round(fico.num), fico.source);

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
  }

  // ---- Occupancy ----------------------------------------------------------
  if (/second home|vacation home|secondary residence/.test(t)) x.occupancy = cap(Occupancy.SecondHome, "second home");
  else if (/investment propert|rental propert|\binvestment\b|\brental\b|\binvestor\b|non[\s-]owner|tenant[\s-]occupied|airbnb|short[\s-]term rental|\bstr\b/.test(t)) {
    x.occupancy = cap(Occupancy.Investment, "investment / rental");
    if (/airbnb|short[\s-]term rental|\bstr\b/.test(t)) x.shortTermRental = true;
  } else if (/primary residence|primary home|owner[\s-]occupied|principal residence|\bprimary\b|live in/.test(t)) {
    x.occupancy = cap(Occupancy.Primary, "primary residence");
  }

  // ---- Property type ------------------------------------------------------
  const unitMatch = /\b(\d{1,2})\s*(?:to\s*4\s*)?units?\b/.exec(t);
  if (/non[\s-]?warrantable/.test(t)) x.propertyType = cap(PropertyType.NonWarrantableCondo, "non-warrantable condo");
  else if (/condo(?:minium)?s?\b/.test(t)) x.propertyType = cap(PropertyType.Condo, "condo");
  else if (/town\s?(?:home|house)/.test(t)) x.propertyType = cap(PropertyType.Townhome, "townhome");
  else if (/\bduplex\b/.test(t)) { x.propertyType = cap(PropertyType.TwoToFourUnit, "duplex"); x.units = 2; }
  else if (/\btriplex\b/.test(t)) { x.propertyType = cap(PropertyType.TwoToFourUnit, "triplex"); x.units = 3; }
  else if (/\b(?:four|quad)[\s-]?plex\b/.test(t)) { x.propertyType = cap(PropertyType.TwoToFourUnit, "fourplex"); x.units = 4; }
  else if (unitMatch) {
    const n = parseInt(unitMatch[1] ?? "", 10);
    if (n >= 5) { x.propertyType = cap(PropertyType.FivePlusUnit, unitMatch[0].trim()); x.units = n; }
    else if (n >= 2) { x.propertyType = cap(PropertyType.TwoToFourUnit, unitMatch[0].trim()); x.units = n; }
    else if (n === 1) { x.propertyType = cap(PropertyType.SingleFamily, unitMatch[0].trim()); x.units = 1; }
  } else if (/\bpud\b/.test(t)) x.propertyType = cap(PropertyType.Pud, "PUD");
  else if (/manufactured|mobile home/.test(t)) x.propertyType = cap(PropertyType.Manufactured, "manufactured");
  else if (/\brural\b|\bfarm\b|acreage/.test(t)) x.propertyType = cap(PropertyType.Rural, "rural");
  else if (/single[\s-]?family|\bsfr\b|detached (?:home|house)|\bhouse\b/.test(t)) x.propertyType = cap(PropertyType.SingleFamily, "single-family");

  // ---- Income documentation ----------------------------------------------
  if (/bank statements?/.test(t)) {
    x.incomeDocType = cap(IncomeDocType.BankStatement, "bank statements");
    const months = /\b(12|24)\s*months?\b/.exec(t);
    if (months) x.bankStatementMonths = parseInt(months[1] ?? "", 10) as 12 | 24;
    const kind = /\b(personal|business)\b/.exec(t);
    if (kind) x.bankStatementKind = (kind[1] ?? "") as "personal" | "business";
  } else if (/\bdscr\b|debt[\s-]?service|investor cash[\s-]?flow|rental income only|no[\s-]ratio/.test(t)) {
    x.incomeDocType = cap(IncomeDocType.Dscr, "DSCR");
  } else if (/p\s*&\s*l|p and l|\bpnl\b|profit and loss/.test(t)) {
    x.incomeDocType = cap(IncomeDocType.ProfitAndLoss, "P&L");
  } else if (/\b1099\b/.test(t)) {
    x.incomeDocType = cap(IncomeDocType.Income1099, "1099");
  } else if (/asset (?:depletion|utilization|based)/.test(t)) {
    x.incomeDocType = cap(IncomeDocType.AssetDepletion, "asset depletion");
  } else if (/\bwvoe\b|written voe/.test(t)) {
    x.incomeDocType = cap(IncomeDocType.WvoeOnly, "WVOE");
  } else if (/full[\s-]?doc(?:umentation)?|\bw-?2s?\b|tax returns?|paystubs?/.test(t)) {
    x.incomeDocType = cap(IncomeDocType.FullDoc, "full documentation");
  }

  // ---- Borrower extras ----------------------------------------------------
  if (/\bitin\b/.test(t)) x.citizenship = cap(Citizenship.Itin, "ITIN");
  else if (/foreign national/.test(t)) x.citizenship = cap(Citizenship.ForeignNational, "foreign national");

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
