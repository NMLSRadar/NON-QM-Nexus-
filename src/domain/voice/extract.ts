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

const VALUE_LABELS =
  "property value|appraised value|appraised at|appraisal of|home value|purchase price|sales? price|valued at|value of|value is|worth|price of|price is|value\\b|price\\b";
const LOAN_LABELS = "loan amount|loan size|loan of|loan is|borrowing|borrow|mortgage amount|mortgage of|note amount|financing of";

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

  // ---- Stated LTV ---------------------------------------------------------
  const ltv = firstMatch(
    t,
    [
      /(?:\bltv\b|loan[\s-]*to[\s-]*value)[^\d]{0,12}(\d{1,3}(?:\.\d+)?)/,
      /(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)?\s*(?:\bltv\b|loan[\s-]*to[\s-]*value)/,
    ],
    (n) => n >= 5 && n <= 100
  );
  if (ltv) x.statedLtv = cap(ltv.num, ltv.source);

  // ---- Labeled money: property value & loan amount ------------------------
  const value = firstMatch(
    t,
    [
      new RegExp(`(?:${VALUE_LABELS})[^\\d,]{0,14}\\$?(\\d{4,9})\\b`),
      new RegExp(
        "\\$?(\\d{4,9})\\s*(?:dollars?\\s*)?(?:property value|home value|purchase price|sales? price|value\\b|worth\\b|price\\b|apprais)"
      ),
    ],
    (n) => n >= 25_000
  );
  if (value) x.propertyValue = cap(Math.round(value.num), value.source);

  const loan = firstMatch(
    t,
    [
      new RegExp(`(?:${LOAN_LABELS})[^\\d,]{0,14}\\$?(\\d{4,9})\\b`),
      new RegExp(`\\$?(\\d{4,9})\\s*(?:dollar\\s*)?loan\\b`),
    ],
    (n) => n >= 10_000
  );
  if (loan) x.loanAmount = cap(Math.round(loan.num), loan.source);

  const cashOut = firstMatch(t, [/cash[\s-]?out(?:\s+of)?[^\d]{0,10}\$?(\d{4,9})\b/], (n) => n >= 1_000);
  if (cashOut) x.requestedCashOut = cap(Math.round(cashOut.num), cashOut.source);

  // ---- Unlabeled money fallback ------------------------------------------
  if (!x.propertyValue || !x.loanAmount) {
    const used = new Set<number>([x.propertyValue?.value ?? -1, x.loanAmount?.value ?? -1, x.requestedCashOut?.value ?? -1]);
    const candidates: number[] = [];
    for (const m of t.matchAll(/\$?(\d{5,9})\b/g)) {
      const n = parseInt(m[1] ?? "", 10);
      if (n >= 25_000 && !used.has(n) && n !== x.fico?.value) candidates.push(n);
    }
    const uniq = [...new Set(candidates)].sort((a, b) => b - a);
    if (!x.propertyValue && !x.loanAmount && uniq.length >= 2) {
      const larger = uniq[0] as number;
      const smaller = uniq[1] as number;
      x.propertyValue = cap(larger, `assumed larger figure $${larger} is the value`, true);
      x.loanAmount = cap(smaller, `assumed smaller figure $${smaller} is the loan`, true);
      x.notesFragments.push("Two dollar figures were given without labels; assumed the larger is the property value.");
    } else if (!x.propertyValue && x.loanAmount && uniq.length >= 1 && (uniq[0] as number) > x.loanAmount.value) {
      const larger = uniq[0] as number;
      x.propertyValue = cap(larger, `assumed $${larger} is the property value`, true);
    } else if (!x.loanAmount && x.propertyValue && uniq.length >= 1) {
      const below = uniq.find((n) => n < (x.propertyValue as Captured<number>).value);
      if (below) x.loanAmount = cap(below, `assumed $${below} is the loan amount`, true);
    }
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
