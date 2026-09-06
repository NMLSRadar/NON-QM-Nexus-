import lexicon from "./viqi-lexicon.json";

export type ViqiPath = "consumer" | "investor" | "foreign";
export type ViqiMode = "express" | "guided";
export type ViqiVitalState = "empty" | "heard_ambiguous" | "captured" | "confirmed" | "skipped" | "manual";
export type ViqiProvenance = "spoken" | "confirmed" | "manual" | "defaulted" | "skipped";
export type ViqiSessionStatus = "idle" | "listening" | "thinking" | "speaking" | "paused" | "ended";
export type ViqiVitalKey =
  | "occupancy" | "liquid_funds" | "monthly_income" | "monthly_liabilities" | "fico"
  | "state" | "property_type" | "citizenship_status" | "coverage" | "dscr"
  | "monthly_rent" | "annual_taxes" | "annual_insurance" | "monthly_hoa"
  | "annual_flood" | "rental_type" | "units" | "first_time_investor";

export interface ViqiVital {
  key: ViqiVitalKey;
  state: ViqiVitalState;
  value?: number | string | boolean;
  displayValue?: string;
  confidence: number;
  provenance?: ViqiProvenance;
  approximate?: boolean;
  convertedFrom?: string;
  source?: string;
}

export interface ViqiTurn {
  id: string;
  text: string;
  captured: ViqiVitalKey[];
  createdAt: string;
}

export interface ViqiSession {
  version: 2;
  path: ViqiPath;
  pathDetected: boolean;
  mode: ViqiMode;
  status: ViqiSessionStatus;
  vitals: Partial<Record<ViqiVitalKey, ViqiVital>>;
  turns: ViqiTurn[];
  promptAttempts: Partial<Record<ViqiVitalKey, number>>;
  softPrompted: ViqiVitalKey[];
  noSpeechCount: number;
  startedAt: string;
  endedReason?: "complete" | "explicit_stop" | "manual_stop" | "hard_ceiling" | "no_speech";
  message: string;
  pathChangeMessage?: string;
}

export interface ViqiConfig {
  baseSilenceMs: number;
  extendedSilenceMs: number;
  postPromptSilenceMs: number;
  hardSessionMs: number;
  confidenceThreshold: number;
}

export const VIQI_CONFIG: ViqiConfig = {
  baseSilenceMs: 2500,
  extendedSilenceMs: 4000,
  postPromptSilenceMs: 6000,
  hardSessionMs: 360000,
  confidenceThreshold: 0.78,
};

export const VIQI_LABELS: Record<ViqiVitalKey, string> = {
  occupancy: "Occupancy / loan path",
  liquid_funds: "Funds available",
  monthly_income: "Monthly qualifying income",
  monthly_liabilities: "Monthly liabilities",
  fico: "Credit score",
  state: "Property state",
  property_type: "Property type",
  citizenship_status: "Citizenship status",
  coverage: "DSCR coverage",
  dscr: "Stated / solved DSCR",
  monthly_rent: "Monthly rent",
  annual_taxes: "Annual property taxes",
  annual_insurance: "Annual hazard insurance",
  monthly_hoa: "Monthly HOA",
  annual_flood: "Annual flood insurance",
  rental_type: "Rental type",
  units: "Units",
  first_time_investor: "First-time investor",
};

export const PATH_VITALS: Record<ViqiPath, { required: ViqiVitalKey[]; soft: ViqiVitalKey[] }> = {
  consumer: {
    required: ["occupancy", "monthly_income", "liquid_funds", "monthly_liabilities"],
    soft: ["state", "property_type"],
  },
  investor: {
    required: ["occupancy", "liquid_funds"],
    soft: ["coverage", "monthly_hoa", "annual_flood", "rental_type", "state", "property_type", "units", "first_time_investor"],
  },
  foreign: {
    required: ["occupancy", "citizenship_status", "monthly_income", "liquid_funds", "monthly_liabilities"],
    soft: ["state", "property_type"],
  },
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000,
};

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const SATISFIED = new Set<ViqiVitalState>(["captured", "confirmed", "manual"]);
const APPROX = /\b(?:about|around|roughly|approximately|give or take|ballpark|north of|a little over)\b/i;
const SKIP = /\b(?:i don'?t know|not sure|hasn'?t told me|haven'?t told me|we'?ll get that|unknown)\b/i;
const NO_RATIO = /\b(?:no[ -]ratio|no dscr|doesn'?t cash flow|does not cash flow|negative coverage|sub[ -]one|under one)\b/i;
const TRAILING_INCOMPLETE = /(?:\b(?:um|uh|let me see|hold on|one sec|and|with|plus|at|around)|\b(?:hundred|thousand|million)\s+and)\s*[,.…-]*$/i;
const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function clean(text: string): string {
  return text.toLowerCase().replace(/[–—]/g, "-").replace(/\bi tend\b/g, "itin").replace(/\s+/g, " ").trim();
}

function includesAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function detectPath(text: string, current: ViqiPath = "consumer"): { path: ViqiPath; detected: boolean } {
  const normalized = clean(text);
  if (includesAny(normalized, lexicon.foreignPath)) return { path: "foreign", detected: true };
  // Explicit occupancy wins over generic documentation/rental language. A
  // primary or second-home statement can never remain on the investor path.
  if (/\b(?:primary(?: residence)?|owner[ -]occupied|lives? there|second home|vacation home)\b/i.test(normalized)) return { path: "consumer", detected: true };
  if (/\b(?:investment(?: property)?|dscr|non[ -]owner(?: occupied)?|noo|rental property|airbnb|short[ -]term rental)\b/i.test(normalized)) return { path: "investor", detected: true };
  if (includesAny(normalized, lexicon.consumerPath)) return { path: "consumer", detected: true };
  return { path: current, detected: false };
}

function wordsToNumber(input: string): number | undefined {
  const tokens = input.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length) return undefined;
  let total = 0;
  let group = 0;
  let decimal = "";
  let afterPoint = false;
  let saw = false;
  for (const token of tokens) {
    if (token === "and" || token === "a") continue;
    if (token === "half" && group > 0) { group += 0.5; saw = true; continue; }
    if (token === "point") { afterPoint = true; continue; }
    const value = NUMBER_WORDS[token];
    if (value === undefined) return undefined;
    saw = true;
    if (afterPoint) { decimal += String(value); continue; }
    if (value === 100) group = Math.max(1, group) * 100;
    else if (value >= 1000) { total += Math.max(1, group) * value; group = 0; }
    else group += value;
  }
  const result = total + group + (decimal ? Number(`0.${decimal}`) : 0);
  return saw ? result : undefined;
}

export function normalizeNumber(raw: string, key: ViqiVitalKey): { value?: number; ambiguous: boolean; approximate: boolean } {
  let source = raw.toLowerCase().replace(/[$,]/g, "").trim();
  const approximate = APPROX.test(source);
  source = source.replace(APPROX, "").trim();
  let multiplier = 1;
  if (/(?:\d|\b)(?:k\b|grand\b)/.test(source)) multiplier = 1000;
  if (/\bmillion\b/.test(source)) multiplier = 1000000;
  source = source.replace(/k\b|\b(?:grand|million|dollars?|bucks?)\b/g, "").trim();
  let numeric = Number(source.replace(/\s+/g, ""));
  if (!Number.isFinite(numeric)) {
    const compressed = source.match(/^(one|two|three|four|five|six|seven|eight|nine)\s+(ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|\d{2})$/);
    if (compressed) {
      const first = NUMBER_WORDS[compressed[1] ?? ""] ?? 0;
      const second = NUMBER_WORDS[compressed[2] ?? ""] ?? Number(compressed[2]);
      numeric = first * 100 + second;
    } else numeric = wordsToNumber(source) ?? Number.NaN;
  }
  if (!Number.isFinite(numeric)) return { ambiguous: true, approximate };
  let value = numeric * multiplier;
  if (key === "dscr" || key === "coverage") {
    if (value >= 30 && value <= 300) value /= 100;
    const ambiguous = value < 0.3 || value > 3;
    return { value, ambiguous, approximate };
  }
  if (multiplier === 1 && value >= 100 && value < 1000 && key === "liquid_funds") value *= 1000;
  if (multiplier === 1 && value >= 100 && value < 1000 && (key === "monthly_income" || key === "monthly_rent")) {
    if (value < 300) value *= 1000;
  }
  const bands: Partial<Record<ViqiVitalKey, [number, number]>> = {
    liquid_funds: [1000, 10000000], monthly_income: [1000, 200000], monthly_liabilities: [0, 50000],
    monthly_rent: [300, 50000], fico: [300, 850], annual_taxes: [200, 200000],
    annual_insurance: [200, 50000], monthly_hoa: [0, 3000], annual_flood: [0, 50000],
  };
  const band = bands[key];
  return { value, ambiguous: band ? value < band[0] || value > band[1] : false, approximate };
}

const NUMBER_SOURCE = "(?:\\$?[0-9][0-9,]*(?:\\.[0-9]+)?\\s*(?:k|grand|million)?|\\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|point|and|half|a)(?:[ -]+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|point|and|half|a))*\\b)";

function amountNear(text: string, phrases: readonly string[], valueFirst = false): string | undefined {
  const labels = [...phrases].sort((a, b) => b.length - a.length).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = valueFirst
    ? new RegExp(`(${NUMBER_SOURCE})\\s*(?:per month|monthly|a month|per year|annually|a year)?\\s*(?:in|of|for|on)?\\s*\\b(?:${labels})\\b`, "i")
    : new RegExp(`\\b(?:${labels})\\b(?:\\s+(?:is|are|of|at|about|around|roughly|approximately|equals?|has|with|for))*\\s*(${NUMBER_SOURCE})`, "i");
  return text.match(pattern)?.[1];
}

function extractAmount(text: string, key: ViqiVitalKey, phrases: readonly string[]): ViqiVital | undefined {
  const candidates = [amountNear(text, phrases), amountNear(text, phrases, true)].filter((candidate): candidate is string => Boolean(candidate));
  for (const raw of candidates) {
    const normalized = normalizeNumber(raw, key);
    if (normalized.value === undefined) continue;
    let value = normalized.value;
    let convertedFrom: string | undefined;
    if (key === "monthly_income" && /\b(?:per year|a year|annually|annual|on (?:his|her|the) (?:w2|taxes|returns))\b/i.test(text)) {
      convertedFrom = `${MONEY.format(value)} annually`;
      value /= 12;
    }
    if (key === "monthly_income" && /\b(?:an hour|hourly|per hour)\b/i.test(text) && !/\b\d+\s*hours?\b/i.test(text)) {
      return { key, state: "heard_ambiguous", value, displayValue: `${MONEY.format(value)}/hour`, confidence: 0.6, provenance: "spoken", source: raw };
    }
    const state: ViqiVitalState = normalized.ambiguous ? "heard_ambiguous" : "captured";
    return { key, state, value, displayValue: MONEY.format(value), confidence: state === "captured" ? 0.9 : 0.55, provenance: "spoken", approximate: normalized.approximate, convertedFrom, source: raw };
  }
  return undefined;
}

function extractFico(text: string): ViqiVital | undefined {
  let raw = amountNear(text, lexicon.fico) ?? amountNear(text, lexicon.fico, true);
  if (!raw) {
    if (/\blow sixes\b/.test(text)) raw = "620";
    else if (/\bhigh sixes\b/.test(text)) raw = "680";
    else if (/\bsevens\b/.test(text)) raw = "700";
  }
  if (!raw) return undefined;
  const n = normalizeNumber(raw, "fico");
  if (n.value === undefined) return undefined;
  return { key: "fico", state: n.ambiguous ? "heard_ambiguous" : "captured", value: n.value, displayValue: String(Math.round(n.value)), confidence: n.ambiguous ? 0.5 : 0.95, provenance: "spoken", source: raw };
}

function extractDscr(text: string): ViqiVital | undefined {
  if (NO_RATIO.test(text)) return { key: "dscr", state: "captured", value: "no_ratio", displayValue: "No ratio", confidence: 0.98, provenance: "spoken", source: "no-ratio statement" };
  let raw = amountNear(text, lexicon.dscr) ?? amountNear(text, lexicon.dscr, true);
  if (!raw && /\b(?:breaks even|break-even|at par)\b/.test(text)) raw = "1.0";
  if (!raw) return undefined;
  const n = normalizeNumber(raw, "dscr");
  if (n.value === undefined) return undefined;
  return { key: "dscr", state: n.ambiguous ? "heard_ambiguous" : "captured", value: n.value, displayValue: n.value.toFixed(2), confidence: n.ambiguous ? 0.5 : 0.94, provenance: "spoken", source: raw };
}

function occupancy(text: string, path: ViqiPath): ViqiVital | undefined {
  let value: string | undefined;
  if (/\b(?:second home|vacation home)\b/.test(text)) value = "Second home";
  else if (/\b(?:primary(?: residence)?|owner occupied|owner-occupied|lives there)\b/.test(text)) value = "Primary";
  else if (/\b(?:investment(?: property)?|rental property|investor|dscr|non-owner|noo|airbnb)\b/.test(text)) value = "Investment";
  else if (path === "foreign" && /\b(?:foreign national|itin)\b/.test(text)) return undefined;
  return value ? { key: "occupancy", state: "captured", value, displayValue: value, confidence: 0.97, provenance: "spoken", source: value } : undefined;
}

function simpleTextVital(key: ViqiVitalKey, value: string | number | boolean, source: string): ViqiVital {
  return { key, state: "captured", value, displayValue: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value), confidence: 0.95, provenance: "spoken", source };
}

function markSkipped(text: string, key: ViqiVitalKey): ViqiVital | undefined {
  return SKIP.test(text) ? { key, state: "skipped", confidence: 1, provenance: "skipped", source: text } : undefined;
}

export function solveCoverage(vitals: Partial<Record<ViqiVitalKey, ViqiVital>>): ViqiVital | undefined {
  const stated = vitals.dscr;
  if (stated && SATISFIED.has(stated.state)) return { ...stated, key: "coverage" };
  const rent = Number(vitals.monthly_rent?.value);
  const taxes = Number(vitals.annual_taxes?.value);
  const insurance = Number(vitals.annual_insurance?.value);
  if (![rent, taxes, insurance].every(Number.isFinite) || rent <= 0) return undefined;
  const hoa = Number(vitals.monthly_hoa?.value ?? 0);
  const flood = Number(vitals.annual_flood?.value ?? 0);
  const carrying = taxes / 12 + insurance / 12 + flood / 12 + hoa;
  const ratio = carrying > 0 ? rent / carrying : 3;
  return { key: "coverage", state: "captured", value: ratio, displayValue: `${ratio.toFixed(2)} solved`, confidence: 0.9, provenance: "spoken", source: "rent + carrying costs" };
}

export function coverageBand(value: number | string | boolean | undefined): "best" | "broad" | "reduced" | "restricted" | undefined {
  if (value === "no_ratio") return "restricted";
  if (typeof value !== "number") return undefined;
  if (value >= 1.25) return "best";
  if (value >= 1) return "broad";
  if (value >= 0.75) return "reduced";
  return "restricted";
}

export function extractViqiVitals(transcript: string, currentPath: ViqiPath = "consumer"): { path: ViqiPath; pathDetected: boolean; vitals: ViqiVital[] } {
  const text = clean(transcript);
  const detection = detectPath(text, currentPath);
  const path = detection.path;
  const vitals: ViqiVital[] = [];
  const push = (vital: ViqiVital | undefined) => { if (vital) vitals.push(vital); };
  push(occupancy(text, path));
  push(extractAmount(text, "liquid_funds", lexicon.funds));
  push(extractAmount(text, "monthly_income", lexicon.income));
  push(extractAmount(text, "monthly_liabilities", lexicon.liabilities));
  push(extractAmount(text, "monthly_rent", lexicon.rent));
  push(extractDscr(text));
  push(extractAmount(text, "annual_taxes", lexicon.taxes));
  push(extractAmount(text, "annual_insurance", lexicon.insurance));
  push(extractAmount(text, "monthly_hoa", lexicon.hoa));
  push(extractAmount(text, "annual_flood", lexicon.flood));
  if (/\b(?:short term|short-term|str|airbnb|nightly)\b/.test(text)) push(simpleTextVital("rental_type", "Short-term", "short-term rental phrase"));
  else if (/\b(?:long term|long-term|annual lease|12 month lease)\b/.test(text)) push(simpleTextVital("rental_type", "Long-term", "long-term rental phrase"));
  if (/\b(?:foreign national|itin|nonresident alien|non-resident alien)\b/.test(text)) push(simpleTextVital("citizenship_status", text.includes("itin") ? "ITIN" : "Foreign national", "citizenship phrase"));
  if (/\b(?:first time investor|first-time investor|first rental|first investment property)\b/.test(text)) push(simpleTextVital("first_time_investor", true, "first-time investor phrase"));
  const units = text.match(/\b([2-4])\s*(?:unit|units|plex)\b/);
  if (units?.[1]) push(simpleTextVital("units", Number(units[1]), units[0]));
  const property = text.match(/\b(single family|sfr|condo(?:minium)?|townhome|townhouse|duplex|triplex|fourplex)\b/);
  if (property?.[1]) push(simpleTextVital("property_type", property[1].toUpperCase() === "SFR" ? "SFR" : property[1], property[0]));
  for (const [name, code] of Object.entries(STATES)) {
    if (new RegExp(`\\b${name.replace(" ", "\\s+")}\\b`, "i").test(text)) { push(simpleTextVital("state", code, name)); break; }
  }
  return { path, pathDetected: detection.detected, vitals };
}

export function createViqiSession(now = new Date()): ViqiSession {
  return { version: 2, path: "consumer", pathDetected: false, mode: "express", status: "idle", vitals: {}, turns: [], promptAttempts: {}, softPrompted: [], noSpeechCount: 0, startedAt: now.toISOString(), message: "Tell me the scenario in one go, or I’ll guide you one vital at a time." };
}

export function requiredKeys(session: Pick<ViqiSession, "path">): ViqiVitalKey[] {
  return PATH_VITALS[session.path].required;
}

export function isVitalSatisfied(vital?: ViqiVital): boolean {
  return Boolean(vital && SATISFIED.has(vital.state));
}

export function missingRequired(session: ViqiSession): ViqiVitalKey[] {
  return requiredKeys(session).filter((key) => !isVitalSatisfied(session.vitals[key]));
}

export function isComplete(session: ViqiSession): boolean {
  return missingRequired(session).length === 0;
}

export function promptFor(key: ViqiVitalKey, attempt = 0, path: ViqiPath = "consumer"): string {
  const first: Record<ViqiVitalKey, string> = {
    occupancy: "Is this a primary, second home, or investment property?",
    liquid_funds: "How much do they have available for the transaction?",
    monthly_income: "What’s the monthly qualifying income?",
    monthly_liabilities: "What are the monthly liabilities?",
    fico: "What’s the credit score?",
    state: "What state is the property in?", property_type: "What type of property is it?",
    citizenship_status: "Is the borrower a foreign national, ITIN borrower, or U.S. resident?",
    coverage: "What’s the rent, or do you already have the DSCR?",
    dscr: "What DSCR are you using?", monthly_rent: "What is the monthly rent?",
    annual_taxes: "What are the annual property taxes?", annual_insurance: "What is the annual hazard insurance?",
    monthly_hoa: "Is there a monthly HOA?", annual_flood: "Is there annual flood insurance?",
    rental_type: "Is the rent long-term or short-term?", units: "How many units?",
    first_time_investor: "Is this their first investment property?",
  };
  if (attempt === 0) return first[key];
  if (attempt === 1) return key === "coverage" && path === "investor" ? "Rent amount or DSCR ratio?" : `Just the ${VIQI_LABELS[key].toLowerCase()}, please.`;
  return `You can also type the ${VIQI_LABELS[key].toLowerCase()} in the checklist.`;
}

export function processViqiTurn(session: ViqiSession, transcript: string, now = new Date()): ViqiSession {
  const text = transcript.trim();
  if (!text) return registerNoSpeech(session);
  const normalized = clean(text);
  const explicitStop = includesAny(normalized, lexicon.stop);
  const extracted = extractViqiVitals(text, session.path);
  const next: ViqiSession = {
    ...session,
    path: extracted.path,
    pathDetected: session.pathDetected || extracted.pathDetected,
    pathChangeMessage: undefined,
    status: "thinking",
    noSpeechCount: 0,
    vitals: { ...session.vitals },
    turns: [...session.turns, { id: `${now.getTime()}-${session.turns.length}`, text, captured: extracted.vitals.map((v) => v.key), createdAt: now.toISOString() }],
  };
  if (extracted.path !== session.path) next.pathChangeMessage = extracted.path === "investor" ? "Got it — investment property, so I’ll use rent or DSCR instead of borrower income." : extracted.path === "foreign" ? "Got it — foreign national / ITIN path. U.S. FICO is optional." : "Got it — borrower-income path, so I’ll use monthly income and liabilities.";
  for (const vital of extracted.vitals) next.vitals[vital.key] = vital;
  if (next.path === "investor") {
    const coverage = solveCoverage(next.vitals);
    if (coverage) next.vitals.coverage = coverage;
  }
  const capturedThisTurn = extracted.vitals.filter((v) => SATISFIED.has(v.state)).length;
  next.mode = capturedThisTurn >= 2 ? "express" : (next.turns.length >= 2 ? "guided" : session.mode);
  if (explicitStop) {
    next.status = "ended";
    next.endedReason = "explicit_stop";
    const missing = missingRequired(next);
    next.message = missing.length ? `Running with what I have. ${missing.map((k) => VIQI_LABELS[k]).join(", ")} ${missing.length === 1 ? "is" : "are"} missing, so the result is a range.` : buildReadback(next);
    return next;
  }
  if (isComplete(next)) {
    next.status = "ended";
    next.endedReason = "complete";
    next.message = buildReadback(next);
    return next;
  }
  const missing = missingRequired(next);
  const key = missing[0];
  if (key) {
    const attempts = next.promptAttempts[key] ?? 0;
    next.promptAttempts = { ...next.promptAttempts, [key]: attempts + 1 };
    next.status = "listening";
    next.message = promptFor(key, Math.min(attempts, 2), next.path);
  }
  return next;
}

export function setManualVital(session: ViqiSession, key: ViqiVitalKey, raw: string): ViqiSession {
  const next = { ...session, vitals: { ...session.vitals }, status: "thinking" as ViqiSessionStatus };
  const trimmed = raw.trim();
  if (!trimmed) { delete next.vitals[key]; return next; }
  let value: number | string | boolean = trimmed;
  if (["liquid_funds", "monthly_income", "monthly_liabilities", "fico", "dscr", "monthly_rent", "annual_taxes", "annual_insurance", "monthly_hoa", "annual_flood", "units"].includes(key)) {
    const parsed = normalizeNumber(trimmed, key);
    if (parsed.value === undefined) return { ...session, message: `Enter a valid value for ${VIQI_LABELS[key].toLowerCase()}.` };
    value = parsed.value;
  }
  next.vitals[key] = { key, state: "manual", value, displayValue: typeof value === "number" && key !== "fico" && key !== "dscr" && key !== "units" ? MONEY.format(value) : String(value), confidence: 1, provenance: "manual", source: "manual entry" };
  if (key === "dscr") next.vitals.coverage = { ...next.vitals[key], key: "coverage" };
  if (next.path === "investor") {
    const coverage = solveCoverage(next.vitals);
    if (coverage) next.vitals.coverage = coverage;
  }
  if (isComplete(next)) { next.status = "ended"; next.endedReason = "complete"; next.message = buildReadback(next); }
  else { const missing = missingRequired(next)[0]; next.status = "listening"; next.message = missing ? promptFor(missing, 0, next.path) : "Ready."; }
  return next;
}

export function registerNoSpeech(session: ViqiSession): ViqiSession {
  const count = session.noSpeechCount + 1;
  if (count >= 3) return { ...session, noSpeechCount: count, status: "ended", endedReason: "no_speech", message: "I’ll stop here and keep everything captured. You can resume or type the missing vitals anytime." };
  const missing = missingRequired(session)[0];
  return { ...session, noSpeechCount: count, status: "listening", mode: "guided", message: count === 2 ? "Still there?" : (missing ? promptFor(missing, 1, session.path) : "Whenever you’re ready.") };
}

export function endSession(session: ViqiSession, reason: "manual_stop" | "hard_ceiling" = "manual_stop"): ViqiSession {
  const missing = missingRequired(session);
  return { ...session, status: "ended", endedReason: reason, message: missing.length ? `Stopped with ${missing.map((key) => VIQI_LABELS[key]).join(", ")} missing. The current answer is a range; add them to narrow it down.` : buildReadback(session) };
}

export function resumeSession(session: ViqiSession): ViqiSession {
  const missing = missingRequired(session);
  return { ...session, status: "listening", endedReason: undefined, message: missing.length ? `Welcome back. I kept your entries. ${promptFor(missing[0]!, 0, session.path)}` : "Everything is captured. Say a correction or run it." };
}

export function shouldUseExtendedSilence(transcript: string): boolean {
  return TRAILING_INCOMPLETE.test(clean(transcript));
}

export function silenceThreshold(transcript: string, afterPrompt = false, config = VIQI_CONFIG): number {
  if (afterPrompt) return config.postPromptSilenceMs;
  return shouldUseExtendedSilence(transcript) ? config.extendedSilenceMs : config.baseSilenceMs;
}

function spoken(vital?: ViqiVital): string | undefined {
  if (!vital) return undefined;
  if (vital.state === "skipped") return `no ${VIQI_LABELS[vital.key].toLowerCase()} yet`;
  const approximate = vital.approximate ? "about " : "";
  const converted = vital.convertedFrom ? `${vital.convertedFrom}, so ` : "";
  return `${converted}${approximate}${vital.displayValue ?? String(vital.value)}`;
}

export function buildReadback(session: ViqiSession): string {
  const keys = session.path === "investor" ? ["monthly_rent", "coverage", "liquid_funds", "occupancy", "state"] as ViqiVitalKey[] : ["monthly_income", "monthly_liabilities", "liquid_funds", "occupancy", "state"] as ViqiVitalKey[];
  const values = keys.map((key) => spoken(session.vitals[key])).filter(Boolean);
  return `${values.join(", ")}. Running it.`;
}

export function manualStopAllowed(): true { return true; }
