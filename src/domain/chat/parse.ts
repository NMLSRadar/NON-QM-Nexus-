/**
 * Stage A parser: normalized text + intent + entity extraction -> ParsedQuery.
 *
 * Deterministic and testable. The parser never recalls lender facts — it only
 * extracts WHAT the user asked about and WHICH entities they stated. All
 * factual answering happens in the tool layer (Stage B), scoped to the
 * tier-gated catalog.
 */

import type { Citizenship, IncomeDocType, LoanPurpose, Occupancy, PropertyType, Vesting } from "@/domain/types/enums";
import { normalizeText, parseLatePattern } from "./normalize";
import { classifyIntent } from "./intents";
import type { ChatIntent, CreditEvent, MetricDirection, ParsedEntities, ParsedQuery, TargetMetric } from "./types";

interface KnownNames {
  lenderNames: string[];
  programNames: string[];
}

const DOC_TYPE_SIGNALS: Array<{ re: RegExp; value: IncomeDocType }> = [
  { re: /\bbank_statement\b|\bbank statements\b|\b12 ?month (bank )?statement\b|\b24 ?month (bank )?statement\b/, value: "bank_statement" },
  { re: /\bpnl_only\b|\bpnl\b|\bprofit[ -]?\&?[ -]?loss\b/, value: "pnl_only" },
  { re: /(^|\s)dscr\b|\bno_ratio\b/, value: "dscr" },
  { re: /\basset_depletion\b|\basset depletion\b/, value: "asset_depletion" },
  { re: /\b1099\b|\b1099_only\b/, value: "1099" },
  { re: /\bwvoe\b/, value: "wvoe_only" },
  { re: /\bfull_doc\b|\btaxes?\b|\bw2\b|\bw-?2\b|\bpaystub\b|\btax returns\b|\bin come\b/g, value: "full_doc" },
];

const OCCUPANCY_SIGNALS: Array<{ re: RegExp; value: Occupancy }> = [
  { re: /\bowner_occupied\b|\bprimary\b/, value: "primary" },
  { re: /\bsecond_home\b/, value: "second_home" },
  { re: /\binvestment_property\b|\bnoo\b|\brental\b|\binvestor\b/, value: "investment" },
];

const PURPOSE_SIGNALS: Array<{ re: RegExp; value: LoanPurpose }> = [
  { re: /\bcash_out\b/, value: "cash_out_refinance" },
  { re: /\brate_term\b/, value: "rate_term_refinance" },
  { re: /\bheloc\b/, value: "heloc" },
  { re: /\bsecond lien\b|\bsecond mortgage\b|\bstandalone second\b/, value: "second_lien" },
  { re: /\bpurchase\b|\bbuying\b|\bbuy\b/, value: "purchase" },
];

const PROPERTY_SIGNALS: Array<{ re: RegExp; value: PropertyType }> = [
  { re: /\bnon_warrantable\b.*\bcondo\b|\bcondo\b.*\bnon_warrantable\b|\bnw ?condo\b/, value: "non_warrantable_condo" },
  { re: /\bcondotel\b/, value: "condotel" },
  { re: /\bcondo\b/, value: "condo" },
  { re: /\b2_4_unit\b/, value: "2_4_unit" },
  { re: /\b5_8_unit\b/, value: "5_8_unit" },
  { re: /\b9_plus_unit\b/, value: "9_plus_unit" },
  { re: /\brural\b/, value: "rural" },
  { re: /\btownhome\b|\btownhouse\b/, value: "townhome" },
  { re: /\bsfr\b|\bsingle family\b/, value: "single_family" },
  { re: /\bmanufactured\b/, value: "manufactured" },
  { re: /\bpud\b/, value: "pud" },
];

const CITIZENSHIP_SIGNALS: Array<{ re: RegExp; value: Citizenship }> = [
  { re: /\bitin\b/, value: "itin" },
  { re: /\bforeign_national\b/, value: "foreign_national" },
  { re: /\bnon_permanent_resident\b|\bead\b|\bh-?1b\b|\bl-?1\b|\be-?2\b|\bdaca\b|\bwork visa\b/, value: "non_permanent_resident" },
  { re: /\bpermanent_resident\b|\bgreen card\b/, value: "permanent_resident" },
  { re: /\bus citizen\b|\bcitizen\b/, value: "us_citizen" },
];

const VESTING_SIGNALS: Array<{ re: RegExp; value: Vesting }> = [
  { re: /\bllc\b/, value: "llc" },
  { re: /\bcorporation\b|\bcorp\b/, value: "corporation" },
  { re: /\btrust\b/, value: "trust" },
  { re: /\bjoint tenants\b/, value: "joint_tenants" },
  { re: /\bindividual\b|\bpersonally\b|\bown name\b/, value: "individual" },
];

const FEATURE_SIGNALS: Array<{ re: RegExp; value: string }> = [
  { re: /\b\bio\b/, value: "io" },
  { re: /\bppp\b/, value: "ppp_options" },
  { re: /\bnon_warrantable\b/, value: "non_warrantable" },
  { re: /\bstr\b|\bairbnb\b/, value: "str" },
  { re: /\bfirst_time_investor\b/, value: "first_time_investor" },
  { re: /\bfirst_time_homebuyer\b/, value: "first_time_homebuyer" },
  { re: /\bno_ratio\b/, value: "no_ratio" },
];

const METRIC_SIGNALS: Array<{ re: RegExp; metric: TargetMetric; defaultDirection: MetricDirection }> = [
  { re: /\bdown_payment\b|\bdown ?payment\b/, metric: "min_down_payment", defaultDirection: "min" },
  { re: /\bltv\b|\bloan[- ]?to[- ]?value\b/, metric: "max_ltv", defaultDirection: "max" },
  { re: /\bfico\b|\bcredit score\b|\bscore\b/, metric: "min_fico", defaultDirection: "min" },
  { re: /\bdti\b|\bdebt[- ]?to[- ]?income\b/, metric: "max_dti", defaultDirection: "max" },
  { re: /\bdscr (ratio|requirement)?\b/, metric: "min_dscr", defaultDirection: "min" },
  { re: /\breserves\b/, metric: "min_reserves", defaultDirection: "min" },
  { re: /\bloan amount\b/, metric: "min_loan_amount", defaultDirection: "min" },
  { re: /\bseasoning\b/, metric: "min_seasoning", defaultDirection: "min" },
];

const MIN_DIRECTION_WORDS = /\b(lowest|minimum|min|shortest|least|smallest|most conservative)\b/;
const MAX_DIRECTION_WORDS = /\b(highest|maximum|max|longest|most|largest|most aggressive)\b/;

function extractEntities(normalized: string, entities: ParsedEntities): void {
  const docTypes = new Set<IncomeDocType>();
  for (const { re, value } of DOC_TYPE_SIGNALS) {
    if (re.test(normalized)) docTypes.add(value);
  }
  if (docTypes.size) entities.docType = [...docTypes];

  const occ = new Set<Occupancy>();
  for (const { re, value } of OCCUPANCY_SIGNALS) {
    if (re.test(normalized)) occ.add(value);
  }
  if (occ.size) entities.occupancy = [...occ];

  const purp = new Set<LoanPurpose>();
  for (const { re, value } of PURPOSE_SIGNALS) {
    if (re.test(normalized)) purp.add(value);
  }
  if (purp.size) entities.purpose = [...purp];

  const prop = new Set<PropertyType>();
  for (const { re, value } of PROPERTY_SIGNALS) {
    if (re.test(normalized)) prop.add(value);
  }
  if (prop.size) entities.propertyType = [...prop];

  const cit = new Set<Citizenship>();
  for (const { re, value } of CITIZENSHIP_SIGNALS) {
    if (re.test(normalized)) cit.add(value);
  }
  if (cit.size) entities.citizenship = [...cit];

  for (const { re, value } of VESTING_SIGNALS) {
    if (re.test(normalized)) {
      entities.vesting = value;
      break;
    }
  }

  const feats: string[] = [];
  for (const { re, value } of FEATURE_SIGNALS) {
    if (re.test(normalized) && !feats.includes(value)) feats.push(value);
  }
  if (feats.length) entities.features = feats;

  // State (two-letter, e.g. "in florida", "CA", "texas").
  const stateAbbrev = normalized.match(/\b(in|florida|california|texas|new york|washington|nevada|colorado|arizona|georgia|illinois|ohio|pennsylvania|north carolina|south carolina|massachusetts)\b\s*([a-z]{2})\b/);
  const abbrevOnly = normalized.match(/\b(fl|ca|tx|ny|wa|nv|co|az|ga|il|oh|pa|nc|sc|ma)\b\b/);
  if (abbrevOnly?.[1]) {
    entities.state = abbrevOnly[1].toUpperCase();
  } else if (stateAbbrev?.[2]) {
    entities.state = stateAbbrev[2].toUpperCase();
  } else {
    const stateName = normalized.match(/\b(florida|california|texas|nevada|colorado|arizona|georgia|illinois|ohio|pennsylvania|massachusetts)\b/);
    const key = stateName?.[1];
    if (key) {
      const map: Record<string, string> = {
        florida: "FL", california: "CA", texas: "TX", nevada: "NV", colorado: "CO",
        arizona: "AZ", georgia: "GA", illinois: "IL", ohio: "OH", pennsylvania: "PA",
        massachusetts: "MA",
      };
      entities.state = map[key];
    }
  }

  // FICO: a 300-850 number not part of LTV/down payment.
  const ficoRaw = normalized.match(/\b([3-8]\d{2})\b(?!\s*%|\s*(?:ltv|down_payment|month|months|k|,?000))/)?.[1];
  if (ficoRaw) {
    const n = parseInt(ficoRaw, 10);
    if (n >= 300 && n <= 850) entities.fico = n;
  }

  // LTV: "80% ltv" / "ltv 80" / "80% down" (derive from down payment %).
  let ltv: number | undefined;
  const ltvPctRaw = normalized.match(/(\d{1,3})\s*%\s*ltv\b/)?.[1];
  if (ltvPctRaw) ltv = parseInt(ltvPctRaw, 10);
  else {
    const ltvWordRaw = normalized.match(/\bltv\s*(?:of|at|is)?\s*(\d{1,3})\s*%?/)?.[1];
    if (ltvWordRaw) ltv = parseInt(ltvWordRaw, 10);
  }
  const downPctRaw = normalized.match(/(?:down_payment|downpayment|down)\s*(?:of|at|is)?\s*(\d{1,3})\s*%/)?.[1] ?? normalized.match(/(\d{1,3})\s*%\s*(?:down_payment|down)/)?.[1];
  if (downPctRaw) {
    const d = parseInt(downPctRaw, 10);
    if (d >= 5 && d <= 50) ltv = 100 - d;
  }
  if (ltv !== undefined && ltv >= 5 && ltv <= 100) entities.ltv = ltv;

  // DSCR ratio.
  const dscrRaw = normalized.match(/\bdscr\s*(?:of|at|is|ratio of|ratio)?\s*([0-9]?\.[0-9]{1,2})/)?.[1];
  if (dscrRaw) entities.dscr = parseFloat(dscrRaw);

  // Reserves months.
  const reservesRaw = normalized.match(/(?:^|\s)(\d{1,2})\s*(?:months?|mos?)\s*(?:of\s*)?reserves\b/)?.[1];
  if (reservesRaw) entities.reservesMonths = parseInt(reservesRaw, 10);

  // Loan amount ($NNNk / $NNN,000 / NN thousand).
  const loanMatch = normalized.match(/(?:^|\s)\$\s?([\d,.]+)\s*(k|mm|m|million|thousand)?/);
  if (loanMatch) {
    const amountRaw = loanMatch[1];
    if (amountRaw) {
      let n = parseFloat(amountRaw.replace(/,/g, ""));
      const suffix = (loanMatch[2] ?? "").toLowerCase();
      if (suffix === "k") n *= 1_000;
      else if (suffix === "mm" || suffix === "m" || suffix === "million") n *= 1_000_000;
      else if (suffix === "thousand") n *= 1_000;
      if (n >= 10_000) entities.loanAmount = Math.round(n);
    }
  }

  // Credit events.
  const events: CreditEvent[] = [];
  const latePattern = parseLatePattern(normalized);
  if (latePattern) {
    entities.latePattern = latePattern.text;
    events.push({ type: "mortgage_lates", pattern: latePattern.text });
  }
  const lateWords = /\b(mortgage_lates|lates?|late\b)/;
  if (lateWords.test(normalized) && !events.some((e) => e.type === "mortgage_lates")) {
    events.push({ type: "mortgage_lates" });
  }
  const eventSignals: Array<{ re: RegExp; type: CreditEvent["type"] }> = [
    { re: /\bbk7\b/, type: "bk7" },
    { re: /\bbk13\b/, type: "bk13" },
    { re: /\bfc\b|\bforeclosure\b/, type: "foreclosure" },
    { re: /\bss\b|\bshort sale\b/, type: "short_sale" },
    { re: /\bdil\b/, type: "dil" },
    { re: /\bforbearance\b/, type: "forbearance" },
    { re: /\bmodification\b/, type: "modification" },
  ];
  for (const { re, type } of eventSignals) {
    if (re.test(normalized) && !events.some((e) => e.type === type)) events.push({ type });
  }
  if (events.length) entities.creditEvents = events;
}

function extractMetric(normalized: string): { targetMetric: TargetMetric; direction: MetricDirection } | undefined {
  // A generic "who's the best lender/program" question names no attribute to
  // rank — the borrower vitals it mentions (FICO, LTV) are context, not the
  // metric being asked. No metric -> no deterministic rank (honest non-answer).
  if (/\bbest (lender|program|company|option|fit|rate)\b|\bwho[’']s the best\b|\bwho is the best\b|\bmost flexib/.test(normalized)) {
    return undefined;
  }
  let matched: { re: RegExp; metric: TargetMetric; defaultDirection: MetricDirection } | undefined;
  for (const s of METRIC_SIGNALS) {
    if (s.re.test(normalized)) {
      matched = s;
      break;
    }
  }
  if (!matched) return undefined;
  const hasMin = MIN_DIRECTION_WORDS.test(normalized);
  const hasMax = MAX_DIRECTION_WORDS.test(normalized);
  let direction = matched.defaultDirection;
  if (hasMin && !hasMax) direction = "min";
  else if (hasMax && !hasMin) direction = "max";
  return { targetMetric: matched.metric, direction };
}

/** Fuzzy-resolve any lender/program names the user mentioned. */
function extractNamedPrograms(normalized: string, known: KnownNames): NonNullable<ParsedQuery["namedPrograms"]> {
  const out: NonNullable<ParsedQuery["namedPrograms"]> = [];
  for (const name of known.programNames.concat(known.lenderNames)) {
    const lower = name.toLowerCase();
    // Tolerate mixed space/underscore/hyphen separators so "Foreign National
    // Investor" matches the normalized "foreign_national investor".
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const spaced = escaped.replace(/[ _-]+/g, "[ _-]+");
    if (new RegExp(spaced).test(normalized)) {
      out.push({ query: name, resolvedLenderName: known.lenderNames.find((l) => l.toLowerCase() === lower) });
    }
  }
  return out;
}

/**
 * Classify critical-field gaps for the answer. Occupancy/purpose/property type
 * flip LTV/down-payment ceilings, so they matter for those metrics.
 */
function missingCriticalFields(
  intent: ChatIntent,
  entities: ParsedEntities,
  metric?: TargetMetric,
): string[] {
  const missing: string[] = [];
  const ltvSensitive = metric === "max_ltv" || metric === "min_down_payment";
  if (ltvSensitive && !entities.purpose?.length) missing.push("purpose");
  if (metric === "min_reserves" && !entities.occupancy?.length) missing.push("occupancy");
  if (intent === "scenario_triage" && !entities.fico && !entities.ltv && !entities.docType?.length) {
    missing.push("fico", "ltv", "docType");
  }
  return missing;
}

export function parseQuery(raw: string, known: KnownNames = { lenderNames: [], programNames: [] }): ParsedQuery {
  const normalizedText = normalizeText(raw);
  const entities: ParsedEntities = {};
  extractEntities(normalizedText, entities);

  const namedPrograms = extractNamedPrograms(normalizedText, known);
  const hasNamedProgram = namedPrograms.length > 0;
  // "tell me about X" / "guidelines for Y" / "a lender named Z" where X/Z
  // isn't a known name — still a program-detail question (resolves to an
  // honest non-answer if the lender/program isn't in the library).
  const hasUnknownProgramRef = /\btell me about\b|\bdetails? on\b|\bguidelines? for\b|\bterms? for\b|\b(named|called)\b/.test(normalizedText);

  const { intent, reason } = classifyIntent(normalizedText, hasNamedProgram, hasUnknownProgramRef);

  const metricInfo = intent === "superlative_lookup" || intent === "threshold_lookup" ? extractMetric(normalizedText) : undefined;

  // "down payment 20%" may state the metric implicitly; fall back by presence.
  const targetMetric = metricInfo?.targetMetric;
  const direction = metricInfo?.direction;

  const missingCritical = missingCriticalFields(intent, entities, targetMetric);

  // Confidence: high when the intent is unambiguous and core entities are present.
  let confidence = 0.7;
  if (intent !== "out_of_scope" && (entities.docType?.length || targetMetric)) confidence += 0.2;
  if (missingCritical.length === 0) confidence += 0.1;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    intent,
    normalizedText,
    entities,
    targetMetric,
    direction,
    namedPrograms,
    missingCriticalFields: missingCritical,
    confidence,
    needsClarification: false, // deterministic: proceed with stated assumptions
    statedIncomeMappedTo: /\bstated\b|\bstated income\b/.test(normalizedText)
      ? (entities.docType?.includes("bank_statement") ? "bank_statement" : (entities.docType?.[0] ?? "bank_statement"))
      : undefined,
    // out-of-scope reason is carried so the orchestrator can give a precise
    // non-answer instead of a generic refusal.
    ...(reason ? { outOfScopeReason: reason } : {}),
  } as ParsedQuery;
}