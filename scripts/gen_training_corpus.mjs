// Combinatorial Non-QM voice-scenario generator for extractor training.
// Produces N realistic, non-templated-feeling transcripts by composing
// randomized: opener style, info order, doc type, property type, occupancy,
// citizenship, vesting, financial figures, and speech quirks (hesitation,
// self-correction, approximation words, spoken numbers).
//
// Scope note: only exercises loan purposes/doc types this platform's schema
// actually models (purchase, rate/term refi, cash-out refi; bank statement,
// DSCR, full doc, P&L, 1099, asset depletion, WVOE, ITIN/foreign
// national/non-permanent resident). Bridge, ground-up construction, fix and
// flip, and delayed financing are NOT modeled in IncomeDocType/LoanPurpose —
// generating scenarios for them would silently invent data the schema can't
// represent, so they are intentionally excluded pending a real product
// decision to add those loan types.

function seedRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rand = seedRandom(20260727);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const roundK = (n) => Math.round(n / 5000) * 5000;

const OPENERS = [
  "Good afternoon.", "Hey, quick question.", "I've got a scenario for you.",
  "Can you help me with this one?", "Good morning.", "Hi there.",
  "I need help placing this loan.", "So here's what I'm working with.",
  "Alright, let me walk you through this.", "", "", "Quick one for you.",
  "I'm not sure where to place this one.", "Let's see if this works.",
];
const SPEAKER_PREFIX = [
  "I've got a borrower", "I have somebody", "My client", "The borrower",
  "I'm working with a borrower", "I have a client", "So my borrower",
  "There's a borrower I'm working with", "I've got a customer",
];

const STATES = ["Texas","Florida","Georgia","California","Arizona","North Carolina","Tennessee","Ohio","Colorado","Nevada","South Carolina","Virginia","Utah","Washington","Oregon"];

const DOC_TEMPLATES = {
  bank_statement: (months, kind) => pick([
    `qualifying off ${months}-month ${kind} bank statements`,
    `using ${kind} bank statements, ${months} months' worth`,
    `they're self-employed, so we're doing ${months} months of ${kind} bank statements`,
    `bank statement program, ${kind}, ${months} months`,
    `${months} months of ${kind} deposits for income`,
  ]),
  dscr: () => pick([
    "using the rental income to qualify — DSCR",
    "no personal income needed, straight DSCR off the lease",
    "this is a DSCR deal, cash flow loan",
    "qualifying off the property's cash flow, DSCR",
    "no ratio, well actually DSCR based on the rents",
  ]),
  pnl_only: () => pick([
    "just a CPA-prepared P&L, no tax returns",
    "P&L only program, the P&L statement is the income doc",
    "qualifying off a profit and loss statement",
    "CPA letter and P&L, that's it",
  ]),
  "1099": () => pick([
    "they're a 1099 contractor",
    "independent contractor income, 1099 only",
    "using 1099s to qualify, no W-2",
  ]),
  asset_depletion: () => pick([
    "qualifying off their assets, asset depletion",
    "no income at all, just using their investment accounts",
    "asset utilization, they're retired with a big portfolio",
  ]),
  full_doc: () => pick([
    "full doc, W-2 and tax returns",
    "traditional income documentation, full doc",
    "standard W-2 employee, full doc",
  ]),
  wvoe_only: () => pick([
    "just a written verification of employment, no paystubs",
    "WVOE only, employer letter",
  ]),
};

const PROPERTY_PHRASES = {
  single_family: ["a single-family home", "a detached house", "an SFR", "a single-family residence"],
  condo: ["a condo", "a condominium", "a condo unit"],
  non_warrantable_condo: ["a non-warrantable condo", "a non-warrantable condominium"],
  townhome: ["a townhome", "a townhouse"],
  "2_4_unit": ["a duplex", "a triplex", "a fourplex", "a 2-4 unit"],
  pud: ["a PUD", "a planned unit development"],
  manufactured: ["a manufactured home", "a mobile home"],
  rural: ["a rural property", "a farm property"],
  condotel: ["a condotel"],
};

const OCC_PHRASES = {
  primary: ["their primary residence", "owner-occupied", "they'll live in it"],
  second_home: ["a second home", "a vacation home"],
  investment: ["an investment property", "a rental", "non-owner occupied"],
};

const CITIZENSHIP_PHRASES = {
  us_citizen: ["a U.S. citizen", "an American citizen", "a citizen"],
  permanent_resident: ["a permanent resident", "a green card holder", "a lawful permanent resident"],
  non_permanent_resident: ["a non-permanent resident with a work visa", "on an EAD", "a non-permanent resident"],
  itin: ["an ITIN borrower", "on an ITIN, no social security number", "using their I-T-I-N"],
  foreign_national: ["a foreign national", "an international buyer", "a non-U.S. citizen"],
};

const VESTING_PHRASES = {
  individual: ["individually", "in their own name"],
  llc: ["in an LLC"],
  corporation: ["in a corporation"],
  trust: ["in a trust", "in a revocable trust"],
};

const APPROX = ["about", "roughly", "around", "give or take", "approximately", ""];
const HESITATION = ["", "um, ", "so, ", "and, uh, ", "let's see, ", "okay so "];

function moneyPhrase(n) {
  const approx = pick(APPROX);
  const forms = [
    `$${n.toLocaleString("en-US")}`,
    `${Math.round(n / 1000)}k`,
    `${Math.round(n / 1000)} thousand`,
  ];
  return `${approx ? approx + " " : ""}${pick(forms)}`;
}

function generateScenario(i) {
  const purpose = pick(["purchase", "rate_term_refinance", "cash_out_refinance"]);
  const doc = pick(["bank_statement", "dscr", "pnl_only", "1099", "asset_depletion", "full_doc", "wvoe_only"]);
  const propType = pick(Object.keys(PROPERTY_PHRASES));
  // DSCR realistically ALWAYS implies investment occupancy — qualifying
  // off rental cash flow only makes sense on a non-owner-occupied
  // property. Forcing this (not just for purchase) avoids generating a
  // self-contradictory "DSCR primary residence" scenario, whose "using
  // the rental income to qualify" phrasing is itself a legitimate
  // investment-occupancy signal the real extractor is right to pick up on.
  const occ = doc === "dscr" ? "investment" : pick(Object.keys(OCC_PHRASES));
  const citizenship = pick(Object.keys(CITIZENSHIP_PHRASES));
  const vesting = chance(0.4) ? pick(Object.keys(VESTING_PHRASES)) : null;
  const state = chance(0.5) ? pick(STATES) : null;
  const fico = int(600, 800);
  const value = roundK(int(250_000, 2_200_000));
  let ltv, loanAmount, lien, cashOut;
  if (purpose === "purchase") {
    ltv = pick([65, 70, 75, 80, 85, 90]);
    loanAmount = Math.round(value * (ltv / 100));
  } else if (purpose === "rate_term_refinance") {
    lien = roundK(value * (int(40, 70) / 100));
    ltv = pick([50, 55, 60, 65, 70, 75]);
    loanAmount = Math.round(value * (ltv / 100));
  } else {
    lien = roundK(value * (int(20, 50) / 100));
    cashOut = roundK(int(50_000, 350_000));
    loanAmount = lien + cashOut;
  }

  const opener = pick(OPENERS);
  const subj = pick(SPEAKER_PREFIX);
  const hesitate = pick(HESITATION);
  const docPhrase = DOC_TEMPLATES[doc](pick([12, 24]), pick(["personal", "business"]));
  const propPhrase = pick(PROPERTY_PHRASES[propType]);
  const occPhrase = pick(OCC_PHRASES[occ]);
  const citPhrase = pick(CITIZENSHIP_PHRASES[citizenship]);
  const vestPhrase = vesting ? `, vested ${pick(VESTING_PHRASES[vesting])}` : "";
  const statePhrase = state ? ` in ${state}` : "";

  const purposeLine =
    purpose === "purchase"
      ? `looking to purchase ${propPhrase}${statePhrase}, ${occPhrase}`
      : purpose === "rate_term_refinance"
        ? `looking to refinance ${propPhrase}${statePhrase}, ${occPhrase}, rate and term`
        : `looking to do a cash-out refinance on ${propPhrase}${statePhrase}, ${occPhrase}`;

  const valueLine =
    purpose === "purchase"
      ? `${chance(0.5) ? "purchase price is" : "the property's worth"} ${moneyPhrase(value)}`
      : `${chance(0.5) ? "the property's worth" : "current value is"} ${moneyPhrase(value)}`;

  const lienLine =
    lien !== undefined
      ? pick([
          `they currently owe ${moneyPhrase(lien)}`,
          `existing balance is ${moneyPhrase(lien)}`,
          `payoff on the current loan is ${moneyPhrase(lien)}`,
          `there's ${moneyPhrase(lien)} remaining on the mortgage`,
        ])
      : null;

  const cashOutLine = cashOut !== undefined ? `they want to receive ${moneyPhrase(cashOut)} in cash` : null;
  // Deliberately ONLY speaks the LTV/down-payment PERCENTAGE here, never a
  // separately-restated dollar loan amount — restating the derived loan
  // amount through moneyPhrase()'s lossy "k"-rounding (e.g. $536,250 ->
  // "536k" -> re-parsed as $536,000) would create a genuine, self-inflicted
  // contradiction against the precise LTV-derived figure, which the real
  // extractor would (correctly) flag as a conflict — not a bug to fix, but
  // not what this batch is testing either.
  const loanLine =
    purpose !== "cash_out_refinance" ? pick([`${ltv}% LTV`, purpose === "purchase" ? `they're putting ${100 - ltv}% down` : `${ltv} percent loan to value`]) : null;

  const ficoLine = pick([
    `credit score is ${fico}`,
    `FICO is ${fico}`,
    `they're sitting at a ${fico}`,
    `credit came back at ${fico}`,
  ]);

  const parts = [subj, purposeLine, ".", hesitate, valueLine, "."];
  if (lienLine) parts.push(lienLine, ".");
  if (cashOutLine) parts.push(cashOutLine, ".");
  if (loanLine) parts.push(loanLine, ".");
  parts.push(docPhrase, ".", ficoLine, `${vestPhrase}.`, `They're ${citPhrase}.`);

  // Occasional mid-sentence self-correction on the FICO figure only (kept
  // isolated so the expected-value check below stays deterministic).
  let text = `${opener} ${parts.join(" ")}`.replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
  if (chance(0.15)) {
    const wrongFico = fico + pick([-30, 20, -15, 25]);
    text = text.replace(`${fico}`, `${wrongFico}, actually, ${fico}`);
  }

  return {
    i, text,
    expected: { purpose, doc, propType, occ, citizenship, vesting, state, fico, value, loanAmount, lien, cashOut },
  };
}

export function generateCorpus(n) {
  return Array.from({ length: n }, (_, i) => generateScenario(i));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] || 100);
  const corpus = generateCorpus(n);
  console.log(JSON.stringify(corpus, null, 0));
}
