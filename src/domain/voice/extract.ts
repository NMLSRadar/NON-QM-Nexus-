import { Citizenship, IncomeDocType, LoanPurpose, Occupancy, PropertyType } from "@/domain/types/enums";
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

  // ---- Loan purpose -------------------------------------------------------
  const isCashOut = /cash[\s-]?out/.test(t);
  const isRateTerm = /rate\s*(?:and|&|\/)?\s*term|no[\s-]cash[\s-]?out/.test(t);
  const saysRefi = /\brefinanc\w*|\brefi\b/.test(t);
  const saysPurchase = /\bpurchas\w*|\bbuying\b|\bbuy\b|\bacquisition\b/.test(t);
  if (saysRefi) {
    if (isCashOut) x.loanPurpose = cap(LoanPurpose.CashOutRefinance, "cash-out refinance");
    else if (isRateTerm) x.loanPurpose = cap(LoanPurpose.RateAndTermRefinance, "rate-and-term refinance");
    else {
      x.loanPurpose = cap(LoanPurpose.RateAndTermRefinance, "refinance (subtype not stated)", true);
      x.refinancePendingSubtype = true;
    }
  } else if (saysPurchase) {
    x.loanPurpose = cap(LoanPurpose.Purchase, "purchase");
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
  if (/first[\s-]?time investor/.test(t)) x.firstTimeInvestor = true;

  return x;
}
