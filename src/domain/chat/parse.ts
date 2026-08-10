import type { Citizenship, IncomeDocType, LoanPurpose, Occupancy, PropertyType, Vesting } from "../types/enums";
import { CREDIT_EVENT_SYNONYMS, DOC_TYPE_SYNONYMS } from "./normalizationDictionary";
import { fuzzyMatchNames, normalizeChatText, parseLatePattern } from "./normalize";
import type { ChatIntent, CreditEvent, ParsedEntities, ParsedQuery, TargetMetric } from "./types";

/**
 * Stage A — normalize and classify. Deterministic (no model call): the
 * intent router and entity extractor run on the dictionary-normalized text,
 * so classification is unit-testable and versioned with the code. Stage B
 * consumes the ParsedQuery; superlatives/thresholds resolve to ranked
 * domain-layer queries, never model recall.
 */

export interface ParseOptions {
  /** Known lender names from the caller's tier-gated catalog, for fuzzy
   * name matching. Never a cross-tenant list. */
  knownLenderNames?: string[];
}

const US_STATES = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia","ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj","nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt","va","wa","wv","wi","wy","dc",
]);
const STATE_NAMES: Record<string, string> = {
  california: "CA", texas: "TX", florida: "FL", "new york": "NY", arizona: "AZ", georgia: "GA",
  washington: "WA", colorado: "CO", nevada: "NV", oregon: "OR", utah: "UT", illinois: "IL",
  "north carolina": "NC", "south carolina": "SC", tennessee: "TN", ohio: "OH", michigan: "MI",
  "new jersey": "NJ", pennsylvania: "PA", virginia: "VA", maryland: "MD", massachusetts: "MA",
};

function extractEntities(text: string, opts: ParseOptions): ParsedEntities {
  const e: ParsedEntities = {};

  // Income documentation types
  const docTypes = new Set<IncomeDocType>();
  for (const [re, canonical] of DOC_TYPE_SYNONYMS) {
    if (re.test(text)) docTypes.add(canonical as IncomeDocType);
  }
  if (docTypes.size > 0) e.docType = [...docTypes];

  // Citizenship classifications (separate axis from doc type)
  const citizenship = new Set<Citizenship>();
  if (/\bitin\b/.test(text)) citizenship.add("itin");
  if (/\bforeign_national\b/.test(text)) citizenship.add("foreign_national");
  if (/\bnon[- ]?permanent resident\b|\bh-?1b\b|\bead\b|work visa/.test(text)) citizenship.add("non_permanent_resident");
  if (citizenship.size > 0) e.citizenship = [...citizenship];

  // Occupancy
  const occ = new Set<Occupancy>();
  if (/\binvestment\b|\binvestor\b|\brental( propert)?\b|\bdscr\b/.test(text)) occ.add("investment");
  if (/\bprimary\b|owner[- ]occ|\boo\b/.test(text)) occ.add("primary");
  if (/second home|vacation home/.test(text)) occ.add("second_home");
  if (occ.size > 0) e.occupancy = [...occ];

  // Loan purpose
  const purposes = new Set<LoanPurpose>();
  if (/\bcash_out\b/.test(text)) purposes.add("cash_out_refinance");
  if (/\brate_term\b/.test(text)) purposes.add("rate_term_refinance");
  if (/\bpurchase\b|\bbuying\b|\bbuy\b/.test(text)) purposes.add("purchase");
  if (/\bheloc\b/.test(text)) purposes.add("heloc");
  if (/second (lien|mortgage)|standalone second|heloan|closed[- ]end second/.test(text)) purposes.add("second_lien");
  if (purposes.size === 0 && /\brefinance\b/.test(text)) purposes.add("rate_term_refinance");
  if (purposes.size > 0) e.purpose = [...purposes];

  // Property type
  const props = new Set<PropertyType>();
  if (/non_warrantable/.test(text)) props.add("non_warrantable_condo");
  else if (/\bcondo\b/.test(text)) props.add("condo");
  if (/\bcondotel\b/.test(text)) props.add("condotel");
  if (/\bsfr\b/.test(text)) props.add("single_family");
  if (/\b2_4_unit\b|duplex|triplex|fourplex/.test(text)) props.add("2_4_unit");
  if (/\b([5-8])[- ]?unit\b/.test(text)) props.add("5_8_unit");
  if (/\brural\b/.test(text)) props.add("rural");
  if (/\bmanufactured\b/.test(text)) props.add("manufactured");
  if (/\btownhome\b|\btownhouse\b/.test(text)) props.add("townhome");
  if (props.size > 0) e.propertyType = [...props];

  // State
  const stateAbbr = text.match(/\bin ([a-z]{2})\b/);
  if (stateAbbr?.[1] != null && US_STATES.has(stateAbbr[1])) e.state = stateAbbr[1].toUpperCase();
  for (const [name, abbr] of Object.entries(STATE_NAMES)) {
    if (text.includes(name)) {
      e.state = abbr;
      break;
    }
  }

  // FICO — 3-digit number in the plausible range, not followed by % or unit words.
  const fico = text.match(/\b([3-8]\d{2})\b(?!\s*(%|percent|k\b|,?000|ltv|units?))/);
  if (fico?.[1] != null) e.fico = parseInt(fico[1], 10);

  // LTV — explicit LTV phrasing, or "N% down" converted to LTV.
  const ltv = text.match(/(\d{1,3})\s*%?\s*ltv\b/) ?? text.match(/\bltv\s*(?:of|at|is)?\s*(\d{1,3})/);
  if (ltv?.[1] != null) {
    const pct = parseInt(ltv[1], 10);
    if (pct >= 5 && pct <= 100) e.ltv = pct;
  } else {
    const down = text.match(/(\d{1,3})\s*%\s*down\b/) ?? text.match(/\bdown_payment\s*(?:of|is)?\s*(\d{1,3})\s*%/);
    if (down?.[1] != null) {
      const pct = parseInt(down[1], 10);
      if (pct >= 0 && pct < 100) e.ltv = 100 - pct; // "20% down" ⇄ 80% LTV
    }
  }

  // Loan amount
  const loan = text.match(/\$\s?([\d,.]+)\s*(k|m|mm|million)?\b/);
  if (loan?.[1] != null) {
    let n = parseFloat(loan[1].replace(/,/g, ""));
    if (loan[2] === "k") n *= 1_000;
    else if (loan[2]) n *= 1_000_000;
    if (n >= 10_000) e.loanAmount = Math.round(n);
  }

  // DSCR ratio value
  const dscr = text.match(/\bdscr\s*(?:of|at|is|ratio of|>=|≥)?\s*([01]?\.\d{1,2}|1\.0|1)\b/);
  if (dscr?.[1] != null && dscr[1].includes(".")) e.dscr = parseFloat(dscr[1]);

  // Credit events + late-pattern shorthand
  const events = new Set<CreditEvent>();
  for (const [re, canonical] of CREDIT_EVENT_SYNONYMS) {
    if (re.test(text)) events.add(canonical as CreditEvent);
  }
  const latePattern = parseLatePattern(text);
  if (latePattern) {
    e.latePattern = latePattern;
    events.add("mortgage_lates");
  }
  const lateCount = text.match(/\b(one|two|three|1|2|3)\s+(?:mortgage\s+)?lates?\b/);
  if (lateCount || /\bmortgage lates\b/.test(text)) events.add("mortgage_lates");
  if (events.size > 0) e.creditEvents = [...events];

  // Vesting
  const vesting = new Set<Vesting>();
  if (/\bllc\b/.test(text)) vesting.add("llc");
  if (/\bcorp(oration)?\b/.test(text)) vesting.add("corporation");
  if (/\btrust\b/.test(text)) vesting.add("trust");
  if (vesting.size > 0) e.vesting = [...vesting];

  // Feature tags
  const features: string[] = [];
  if (/\bio\b/.test(text)) features.push("io");
  if (/\bppp\b/.test(text)) features.push("ppp_options");
  if (/non_warrantable/.test(text)) features.push("non_warrantable");
  if (/\bstr\b/.test(text)) features.push("str");
  if (/\bfti\b/.test(text)) features.push("first_time_investor");
  if (/\bfthb\b/.test(text)) features.push("first_time_homebuyer");
  if (/\bno_ratio\b/.test(text)) features.push("no_ratio");
  if (/gift funds?\b/.test(text)) features.push("gift_funds");
  if (/\bexceptions?\b/.test(text)) features.push("exceptions");
  if (/\bstated\b/.test(text)) features.push("stated");
  if (features.length > 0) e.features = features;

  // Reserves ("4 months reserves", "12 mos of reserves")
  const reserves = text.match(/(\d{1,2})\s*(?:months?|mos?)\s*(?:of\s*)?reserves?\b/);
  if (reserves?.[1] != null) e.reservesMonths = parseInt(reserves[1], 10);

  // Self-employment tenure ("self-employed 18 months", "self employed for a year")
  const seMonths = text.match(/self[- ]?employed?\s*(?:for)?\s*(\d{1,2})\s*months?/);
  const seYears = text.match(/self[- ]?employed?\s*(?:for)?\s*(?:(\d)|a|one)\s*years?/);
  if (seMonths?.[1] != null) e.selfEmploymentMonths = parseInt(seMonths[1], 10);
  else if (seYears) e.selfEmploymentMonths = (seYears[1] != null ? parseInt(seYears[1], 10) : 1) * 12;

  // Lender name fuzzy matching against the caller's own catalog only
  if (opts.knownLenderNames?.length) {
    const { matches, suggestions } = fuzzyMatchNames(text, opts.knownLenderNames);
    if (matches.length > 0) e.lenderNames = matches.map((m) => m.name);
    if (suggestions.length > 0) e.lenderNameSuggestions = suggestions;
  }

  return e;
}

/** Lender-company suffixes used to spot a lender-shaped proper name that is
 * NOT in the caller's catalog (the hallucination-trap path: the only honest
 * answer is "not in your library"). Checked against the RAW question so
 * capitalization survives. */
const LENDER_NAME_SHAPE =
  /\b([A-Z][a-zA-Z&'-]*(?:\s+[A-Z][a-zA-Z&'-]*)*\s+(?:Lending|Funding|Capital|Mortgage|Financial|Loans|Bank|Bancorp|Partners|Finance|Wholesale|Home\s+Loans))\b/g;

/** Words that make a capitalized phrase a mortgage term, not a company name. */
const NOT_A_LENDER_WORDS = new Set([
  "statement", "statements", "month", "months", "doc", "full", "non-qm", "dscr", "itin", "ltv", "fico",
]);

/** Sentence-position words that can lead a capitalized match ("Does Apex
 * Prime Lending…") — trimmed off, not grounds for rejection. */
const LEADING_QUESTION_WORDS = new Set([
  "what's", "whats", "what", "who's", "whos", "who", "which", "does", "do", "did", "is", "can", "will", "would", "compare", "versus", "vs", "how", "about", "anyone",
]);

function detectUnknownLender(raw: string, e: ParsedEntities, knownNames: string[]): string | undefined {
  // A fuzzy near-miss already has a better path ("did you mean …?").
  if (e.lenderNameSuggestions?.length) return undefined;
  const candidates = raw.match(LENDER_NAME_SHAPE) ?? [];
  for (const rawCandidate of candidates) {
    let words = rawCandidate.split(/\s+/);
    while (words.length > 0 && LEADING_QUESTION_WORDS.has(words[0]!.toLowerCase())) words = words.slice(1);
    if (words.length < 2) continue;
    if (words.some((w) => NOT_A_LENDER_WORDS.has(w.toLowerCase()))) continue;
    const candidate = words.join(" ");
    const lower = candidate.toLowerCase();
    const isKnown = knownNames.some((n) => {
      const known = n.toLowerCase();
      return known.includes(lower) || lower.includes(known.replace(/\s*\(sample\)\s*$/i, ""));
    });
    if (!isKnown) return candidate;
  }
  return undefined;
}

interface MetricDetection {
  metric: TargetMetric;
  direction: "min" | "max";
}

/** Map superlative phrasing onto a deterministic ranked-query metric. */
function detectMetric(text: string): MetricDetection | undefined {
  const wantsLow = /\b(lowest|minimum|min|smallest|least|shortest|best.*(down_payment|reserves))\b/.test(text);
  const wantsHigh = /\b(highest|maximum|max|biggest|largest|most)\b/.test(text);

  if (/down_payment/.test(text)) return { metric: "min_down_payment", direction: "min" };
  if (/\bltv\b/.test(text) && (wantsHigh || /\bhighest\b/.test(text))) return { metric: "max_ltv", direction: "max" };
  if (/\bltv\b/.test(text) && wantsLow) return { metric: "max_ltv", direction: "min" };
  if (/\bdti\b/.test(text)) return { metric: "max_dti", direction: wantsLow ? "min" : "max" };
  if (/\bfico\b/.test(text) && (wantsLow || /allowed|floor|as low as/.test(text))) return { metric: "min_fico", direction: "min" };
  if (/\bdscr\b.*\b(lowest|min(imum)?)\b|\b(lowest|min(imum)?)\b.*\bdscr\b/.test(text) && /ratio|requirement|\bdscr\s*(of|ratio)?\s*$/.test(text)) {
    return { metric: "min_dscr", direction: "min" };
  }
  if (/reserves?\b/.test(text) && (wantsLow || /least/.test(text))) return { metric: "min_reserves", direction: "min" };
  if (/loan (amount|size)\b/.test(text)) {
    if (wantsHigh) return { metric: "max_loan_amount", direction: "max" };
    return { metric: "min_loan_amount", direction: "min" };
  }
  if (/seasoning\b/.test(text) && (wantsLow || /shortest/.test(text))) return { metric: "min_seasoning", direction: "min" };
  return undefined;
}

function detectGuardrail(text: string): ParsedQuery["guardrailFlag"] {
  if (/call it (owner|primary)|say (it'?s|its) (owner|primary)|fudge|pretend|hide the|not disclose|don'?t (tell|mention|disclose)|misrepresent|fake (income|docs|documents)|inflate (income|deposits|value)/.test(text)) {
    return "misrepresentation";
  }
  if (/\b(race|religion|national origin|ethnicity|gender|sex|familial status|disability|age)\b.*\b(borrower|approve|deny|rank|prefer)\b|\b(borrower|approve|deny|rank|prefer)\b.*\b(race|religion|ethnicity)\b/.test(text)) {
    return "protected_class";
  }
  if (/legal advice|is (this|that) legal|licensing requirement|compliance question|tax advice|deduct(ible)?\b.*tax|\btrid\b|respa\b/.test(text)) {
    return "legal_tax_advice";
  }
  if (
    /\brate\b(?!.?term)|\bpricing\b|\bpoints?\b.*\bcost\b|what.*rate|par rate|price out|\bcheap(er|est)?\b|priced? (better|lower)|better priced|why is .* (cheaper|better priced)/.test(text) &&
    !/rate_term/.test(text)
  ) {
    return "pricing";
  }
  // Approval predictions are never given — for any lender, real or demo.
  if (/will (they|[a-z][a-z\s]+?) approve\b|will (this|it|i|we) (get )?approved?\b|chances? of (approval|getting approved)|approval odds|likely to approve/.test(text)) {
    return "approval";
  }
  return undefined;
}

function classifyIntent(text: string, e: ParsedEntities, metric: MetricDetection | undefined): ChatIntent {
  const asksWho = /\b(who|which lenders?|anyone|any lenders?|what lenders?)\b/.test(text);
  const mortgageFlavor = Boolean(
    e.docType || e.citizenship || e.creditEvents || e.features || e.propertyType || e.purpose || e.latePattern ||
      /\blender|loan|mortgage|ltv|fico|guideline|program|refinance|borrower|reserves|vesting|down_payment|dscr|non[- ]?qm|seasoning|escrow|appraisal\b/.test(text)
  );

  // Definitions: "what does X mean", "what is a X", "difference between X and Y"
  // — mortgage concepts only; unrelated "what is" questions are out of scope.
  if (mortgageFlavor) {
    if (/what (does|do|is|are)\b.*\bmean\b|^define\b|what'?s a\b|^what is\b|^what are\b/.test(text) && !asksWho) return "definition";
    if (/difference between/.test(text) && !e.lenderNames?.length) return "definition";
    if (/how is\b.*\b(calculated|computed|figured)\b/.test(text)) return "definition";
  }

  // Process help: the exception PROCESS ("how do I submit one"), turn times,
  // submissions — checked before exception_guidance so a how-to stays a how-to.
  if (/how do i (get|submit|request)\b.*exception|exception submitted|fastest to close|turn ?times?|how long.*close|submit (a )?(loan|file|scenario)\b/.test(text)) {
    return "process_help";
  }

  // Exception guidance: WHO is flexible / gives exceptions / works outside
  // the box — answered from the editorial posture layer + compensating
  // factors, never from guideline data alone (Part 2, §5.1).
  if (
    /\bexceptions?\b|\bflexib(le|ility)\b|\blenient\b|who will (actually )?do\b|who actually does\b|outside (the )?(guidelines?|box)\b|\bone[- ]off\b|make an exception\b|compensating factors?\b/.test(
      text
    )
  ) {
    return "exception_guidance";
  }

  // Availability phrased as "where can I find lenders that ..." — takes
  // precedence over the app-navigation "where do I" pattern.
  if (/where can i find\b.*\blenders?\b/.test(text)) return "availability_lookup";

  // App navigation: where/how inside the product
  if (/where (do|can) i (upload|find|see|view|download)|how do i (duplicate|delete|share|save|create|start|run) (a |an |the )?(scenario|p&l|pnl|document|report)|where is the\b/.test(text)) {
    return "app_navigation";
  }

  // Comparison: two named lenders, or explicit vs
  if ((e.lenderNames?.length ?? 0) >= 2 || /\bvs\.?\b|\bversus\b|\bcompare\b/.test(text)) {
    if ((e.lenderNames?.length ?? 0) >= 1 || /\bcompare\b/.test(text)) return "comparison";
  }

  // Program detail: exactly one named lender
  if ((e.lenderNames?.length ?? 0) === 1 && !metric) return "program_detail";

  // Superlative vs threshold: both are ranked queries; "who/which lender"
  // framing = superlative (name the winners), otherwise a library-wide floor/
  // ceiling = threshold.
  if (metric) return asksWho ? "superlative_lookup" : "threshold_lookup";

  // Scenario triage: concrete borrower facts present
  const factCount = [e.fico, e.ltv, e.dscr, e.loanAmount, e.latePattern, e.selfEmploymentMonths].filter((v) => v != null).length
    + (e.creditEvents?.length ? 1 : 0);
  if (/\bborrower\b|i have a\b|my client\b|who works\b|can anyone\b|scenario\b/.test(text) && factCount >= 1) return "scenario_triage";
  if (factCount >= 2) return "scenario_triage";

  // Availability: who supports X
  if (asksWho || /\bwho'?s\b|who does\b|who allows?\b|who has\b|anyone doing\b/.test(text)) return "availability_lookup";

  // Anything mortgage-flavored but unclassified still routes to availability
  // (the tool layer answers honestly from data); truly unrelated → out_of_scope.
  if (mortgageFlavor) return "availability_lookup";
  return "out_of_scope";
}

/** Compute fields whose absence genuinely flips the answer (max one clarifying
 * question is ever asked downstream). */
function missingCritical(intent: ChatIntent, metric: MetricDetection | undefined, e: ParsedEntities): string[] {
  const missing: string[] = [];
  if (metric?.metric === "max_ltv" && !e.purpose?.length && !e.docType?.length) {
    // Max-LTV question with no purpose AND no doc type: the ceiling swings
    // hugely (purchase full-doc vs cash-out DSCR) — worth one question.
    missing.push("loanPurpose");
  }
  if ((intent === "scenario_triage" || intent === "exception_guidance") && e.creditEvents?.includes("mortgage_lates") && !e.latePattern) {
    // Late severity/timing (1x30 vs 1x60, and how recent) changes which
    // lenders qualify — worth the one allowed clarifying question.
    missing.push("latePattern");
  }
  return missing;
}

export function parseChatQuery(raw: string, opts: ParseOptions = {}): ParsedQuery {
  const normalizedText = normalizeChatText(raw);
  const guardrailFlag = detectGuardrail(normalizedText);
  const entities = extractEntities(normalizedText, opts);
  const metric = detectMetric(normalizedText);

  // Hallucination trap: a lender-shaped name that matches nothing in the
  // catalog forces the "not in your library" path — never a general-market
  // answer computed as if the lender hadn't been named. Runs even when a
  // REAL lender was also named (e.g. "compare FakeCo vs Summit") — a
  // question about an unknown lender must never be silently answered as if
  // only the known one had been asked about.
  const unknown = detectUnknownLender(raw, entities, opts.knownLenderNames ?? []);
  if (unknown) entities.unknownLenderName = unknown;

  const intent: ChatIntent = guardrailFlag != null
    ? "out_of_scope" // all four guardrails (misrepresentation, protected class, legal/tax, pricing) decline
    : entities.unknownLenderName != null
      ? "program_detail"
      : !entities.lenderNames?.length && entities.lenderNameSuggestions?.length
        ? "program_detail" // near-miss lender name → the "did you mean" path
        : classifyIntent(normalizedText, entities, metric);

  // Confidence heuristic: strong pattern matches and extracted entities push
  // up; a bare fallback classification stays low.
  let confidence = 0.5;
  if (metric) confidence += 0.25;
  const entityCount = Object.keys(entities).length;
  confidence += Math.min(0.2, entityCount * 0.05);
  if (intent === "out_of_scope") confidence = guardrailFlag ? 0.95 : 0.4;
  if (entities.lenderNameSuggestions?.length && !entities.lenderNames?.length) confidence = Math.min(confidence, 0.45);
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    intent,
    normalizedText,
    entities,
    targetMetric: metric?.metric,
    direction: metric?.direction,
    missingCriticalFields: missingCritical(intent, metric, entities),
    confidence,
    guardrailFlag,
  };
}
