import type { ChatIntent } from "@/domain/chat/types";

/**
 * Chatbot golden set (spec §7) — 60+ questions drawn from the acceptance
 * corpus, including 10 deliberately unanswerable ones and 10 with
 * typos/shorthand. Runs in CI against the seeded sample catalog
 * (src/data/sampleLenders.ts) with narration disabled, so every assertion
 * is deterministic.
 *
 * Fixture semantics:
 *  - expectedIntent: Stage A classification (aggregate accuracy ≥ 95%).
 *  - expectAnswered: false = the correct behavior is an explicit non-answer.
 *  - expectFacts: substrings that must appear in the composed answer text,
 *    rows, or caveats (the "expected key facts").
 *  - expectLenders: lender-name fragments expected among the answer rows.
 *  - forbidLenders: lender-name fragments that must NOT appear anywhere.
 *  - expectTools: tools that must appear in toolActivity.
 *  - tags: "unanswerable" | "typo" | "shorthand" groupings for the metrics.
 */
export interface GoldenFixture {
  id: string;
  question: string;
  priorUserMessages?: string[];
  expectedIntent: ChatIntent;
  expectAnswered: boolean;
  expectFacts?: string[];
  expectLenders?: string[];
  forbidLenders?: string[];
  expectTools?: string[];
  expectClarifyingQuestion?: boolean;
  tags?: Array<"unanswerable" | "typo" | "shorthand">;
}

export const GOLDEN_SET: GoldenFixture[] = [
  // ── Superlative / ranking lookups ─────────────────────────────────────────
  {
    id: "sup-dscr-down",
    question: "Who has the lowest down payment for DSCR?",
    expectedIntent: "superlative_lookup",
    expectAnswered: true,
    expectFacts: ["20% down", "80% LTV"],
    expectLenders: ["Atlas"],
    expectTools: ["rank_programs_by_metric"],
  },
  {
    id: "sup-bs-cashout-ltv",
    question: "What's the highest LTV on 12-month bank statements for a cash-out?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["90% LTV"],
    expectLenders: ["Summit"],
    expectTools: ["rank_programs_by_metric"],
  },
  {
    id: "sup-fulldoc-dti",
    question: "Which lender goes to the highest DTI on full doc non-QM?",
    expectedIntent: "superlative_lookup",
    expectAnswered: true,
    expectFacts: ["50% DTI"],
    expectTools: ["rank_programs_by_metric"],
  },
  {
    id: "sup-investor-reserves",
    question: "Lowest reserves for an investor purchase?",
    // No "who/which lender" framing → library-wide floor = threshold intent
    // (same ranked query either way; the distinction is presentation).
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["3 months"],
    expectLenders: ["Horizon"],
  },
  {
    id: "sup-max-loan",
    question: "Who has the biggest max loan amount?",
    expectedIntent: "superlative_lookup",
    expectAnswered: true,
    expectFacts: ["$4,000,000"],
    expectLenders: ["Evergreen"],
  },
  {
    id: "sup-min-dscr-ratio",
    question: "Which lender has the lowest minimum DSCR ratio requirement?",
    expectedIntent: "superlative_lookup",
    expectAnswered: true,
    expectFacts: ["0.75"],
    expectLenders: ["Atlas"],
  },

  // ── Availability / filter lookups ─────────────────────────────────────────
  {
    id: "avail-itin",
    question: "Who has ITIN loans?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Horizon"],
    expectTools: ["search_programs"],
  },
  {
    id: "avail-fn-condo",
    question: "Which lenders do foreign national on a condo?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Harbor"],
  },
  {
    id: "avail-nonwarr-dscr",
    question: "Anyone doing non-warrantable condos with DSCR?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Atlas"],
  },
  {
    id: "avail-llc",
    question: "Who allows an LLC to take title?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Atlas", "Horizon"],
  },
  {
    id: "avail-1099",
    question: "Who does 1099-only?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Summit"],
  },
  {
    id: "avail-io-dscr",
    question: "Which lenders have interest only on DSCR?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Atlas"],
  },
  {
    id: "avail-itin-dscr-combo",
    question: "Who has ITIN DSCR loans?",
    expectedIntent: "availability_lookup",
    // Atlas lists itin + dscr separately but the combination flag is
    // unverified — the correct answer is "can't confirm", not a yes.
    expectAnswered: false,
    expectFacts: ["not yet verified"],
  },

  // ── Threshold questions ───────────────────────────────────────────────────
  {
    id: "thresh-min-fico",
    question: "What's the lowest FICO score allowed in non-QM?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["No U.S. FICO required"],
    expectLenders: ["Harbor"],
  },
  {
    id: "thresh-min-loan-dscr",
    question: "Minimum loan amount for DSCR?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["$100,000"],
    expectLenders: ["Atlas"],
  },
  {
    id: "thresh-bk-seasoning",
    question: "What's the shortest BK seasoning anyone has?",
    expectedIntent: "superlative_lookup",
    expectAnswered: true,
    expectFacts: ["12 months"],
    expectLenders: ["Harbor"],
  },
  {
    id: "thresh-min-reserves",
    question: "What's the minimum reserves anyone requires?",
    expectedIntent: "superlative_lookup",
    expectAnswered: true,
    expectFacts: ["3 months"],
  },

  // ── Scenario triage ───────────────────────────────────────────────────────
  {
    id: "triage-two-lates",
    question: "I have a borrower who has two mortgage lates, what lender has flexible guidelines for mortgage lates?",
    expectedIntent: "scenario_triage",
    expectAnswered: true,
    expectClarifyingQuestion: true,
    expectTools: ["quick_evaluate"],
  },
  {
    id: "triage-1x30-660-cashout",
    question: "Borrower is 1x30x12, 660 score, 75% LTV cash out — who works?",
    expectedIntent: "scenario_triage",
    expectAnswered: true,
    expectTools: ["quick_evaluate"],
  },
  {
    id: "triage-se-18mo",
    question: "Self-employed 18 months, can anyone use 12-month statements?",
    expectedIntent: "scenario_triage",
    expectAnswered: true,
  },
  {
    id: "triage-memory",
    question: "What about at 85% LTV?",
    priorUserMessages: ["Borrower is a 720 FICO looking at DSCR on an investment purchase"],
    expectedIntent: "availability_lookup",
    expectAnswered: true,
  },

  // ── Soft / process questions ──────────────────────────────────────────────
  {
    id: "soft-exceptions",
    question: "Where can I find more flexible non-QM lenders who allow for exceptions?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Horizon", "Harbor"],
    forbidLenders: ["Evergreen"], // exceptionPolicy: none
  },
  {
    id: "soft-which-exceptions",
    question: "Which lenders allow exceptions?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectFacts: ["AE"],
    expectLenders: ["Horizon", "Harbor"],
  },
  {
    id: "soft-fastest",
    question: "Who's fastest to close?",
    expectedIntent: "process_help",
    expectAnswered: true,
    expectFacts: ["estimate"],
    expectLenders: ["Summit"],
  },
  {
    id: "soft-exception-submit",
    question: "How do I get an exception submitted?",
    expectedIntent: "process_help",
    expectAnswered: true,
    expectFacts: ["Account Executive"],
  },
  {
    id: "nav-upload-pnl",
    question: "Where do I upload a P&L?",
    expectedIntent: "app_navigation",
    expectAnswered: true,
    expectFacts: ["scenario"],
  },
  {
    id: "nav-duplicate",
    question: "How do I duplicate a scenario?",
    expectedIntent: "app_navigation",
    expectAnswered: true,
    expectFacts: ["Duplicate"],
  },

  // ── Definitional ──────────────────────────────────────────────────────────
  {
    id: "def-2x30x12",
    question: "What does 2x30x12 mean?",
    expectedIntent: "definition",
    expectAnswered: true,
    expectFacts: ["30-day", "12 months"],
  },
  {
    id: "def-dscr-calc",
    question: "How is DSCR calculated here?",
    expectedIntent: "definition",
    expectAnswered: true,
    expectFacts: ["PITIA"],
  },
  {
    id: "def-pnl-vs-bs",
    question: "Difference between P&L only and bank statement?",
    expectedIntent: "definition",
    expectAnswered: true,
    expectFacts: ["expense factor", "tax returns"],
  },
  {
    id: "def-no-ratio",
    question: "What is a no ratio DSCR loan?",
    expectedIntent: "definition",
    expectAnswered: true,
    expectFacts: ["no minimum ratio"],
  },

  // ── Program detail / comparison ───────────────────────────────────────────
  {
    id: "detail-summit-minloan",
    question: "What's Summit Non-QM's minimum loan amount?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["$150,000"],
    expectLenders: ["Summit"],
    forbidLenders: ["Atlas", "Horizon", "Evergreen", "Harbor"],
  },
  {
    id: "compare-two",
    question: "Compare Summit Non-QM vs Atlas Investor Finance on DSCR",
    expectedIntent: "comparison",
    expectAnswered: true,
    expectLenders: ["Summit", "Atlas"],
  },
  {
    id: "detail-misspelled",
    question: "Does Horizom Alternative Lending do ITIN?",
    expectedIntent: "program_detail",
    expectAnswered: false,
    expectFacts: ["did you mean"],
    tags: ["typo"],
  },

  // ── Colloquial equivalences ───────────────────────────────────────────────
  {
    id: "colloq-down-ltv",
    question: "Anyone allow 15% down on a bank statement purchase?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Summit"],
  },
  {
    id: "colloq-stated",
    question: "Who does stated income loans?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectFacts: ["not a supported category"],
  },

  // ── Typos / shorthand (10) ────────────────────────────────────────────────
  {
    id: "typo-itn",
    question: "Who has ITN loans?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Horizon"],
    tags: ["typo"],
  },
  {
    id: "typo-dcsr",
    question: "Whats the lowest down payment for DCSR?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["20% down"],
    tags: ["typo"],
  },
  {
    id: "typo-statment",
    question: "Any lenders doing 90 ltv on a bank statment?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    tags: ["typo"],
  },
  {
    id: "typo-assett",
    question: "Highest LTV for assett depletion?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["75% LTV"],
    expectLenders: ["Evergreen"],
    tags: ["typo"],
  },
  {
    id: "typo-mortgage-lights",
    question: "Which lenders are ok with mortgage lights?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    tags: ["typo"],
  },
  {
    id: "short-2x30",
    question: "Borrower is 2x30x12 on a bank statement — who tolerates that?",
    expectedIntent: "scenario_triage",
    expectAnswered: true,
    tags: ["shorthand"],
  },
  {
    id: "short-nonwarr",
    question: "non-warr condo dscr options?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Atlas"],
    tags: ["shorthand"],
  },
  {
    id: "short-fc",
    question: "Shortest FC seasoning in the library?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["24 months"],
    tags: ["shorthand"],
  },
  {
    id: "short-pandl",
    question: "P and L only lenders?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Summit"],
    tags: ["shorthand"],
  },
  {
    id: "short-fthb-dscr",
    question: "FTHB doing a DSCR purchase — anyone?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    tags: ["shorthand"],
  },

  // ── Deliberately unanswerable (10) — correct behavior is a refusal or an
  //    explicit non-answer, never an invented fact ─────────────────────────
  {
    id: "un-fake-lender",
    question: "What's Apex Prime Lending's max LTV on DSCR?",
    expectedIntent: "program_detail",
    expectAnswered: false,
    expectFacts: ["isn't in your library"],
    tags: ["unanswerable"],
  },
  {
    id: "un-fake-lender-2",
    question: "Does Golden Gate Funding allow ITIN borrowers?",
    expectedIntent: "program_detail",
    expectAnswered: false,
    expectFacts: ["isn't in your library"],
    tags: ["unanswerable"],
  },
  {
    id: "un-rates",
    question: "Who has the best interest rate for DSCR right now?",
    expectedIntent: "out_of_scope",
    expectAnswered: false,
    expectFacts: ["pricing"],
    tags: ["unanswerable"],
  },
  {
    id: "un-occupancy-fraud",
    question: "Can I just call it owner-occupied to get the better LTV?",
    expectedIntent: "out_of_scope",
    expectAnswered: false,
    tags: ["unanswerable"],
  },
  {
    id: "un-legal",
    question: "Is this legal under RESPA if I split the fee?",
    expectedIntent: "out_of_scope",
    expectAnswered: false,
    tags: ["unanswerable"],
  },
  {
    id: "un-condotel-fast",
    question: "Which lender is fastest to close on a condotel?",
    expectedIntent: "process_help",
    expectAnswered: false,
    tags: ["unanswerable"],
  },
  {
    id: "un-fn-asset",
    question: "Who does asset depletion for foreign nationals?",
    expectedIntent: "availability_lookup",
    expectAnswered: false,
    expectFacts: ["No program in your library"],
    tags: ["unanswerable"],
  },
  {
    id: "un-wvoe",
    question: "Minimum loan amount for WVOE only?",
    expectedIntent: "threshold_lookup",
    expectAnswered: false,
    tags: ["unanswerable"],
  },
  {
    id: "un-manufactured-io",
    question: "Who offers interest only on manufactured homes?",
    expectedIntent: "availability_lookup",
    expectAnswered: false,
    tags: ["unanswerable"],
  },
  {
    id: "un-heloc",
    question: "Which lenders in my library offer a HELOC?",
    expectedIntent: "availability_lookup",
    expectAnswered: false,
    tags: ["unanswerable"],
  },

  // ── Additional coverage to round out the corpus ──────────────────────────
  {
    id: "extra-gift-funds",
    question: "Who allows gift funds on a bank statement loan?",
    expectedIntent: "availability_lookup",
    // No sample program documents giftFundsAllowed — honest "can't confirm".
    expectAnswered: false,
    expectFacts: ["not yet confirmed"],
  },
  {
    id: "extra-min-fico-dscr",
    question: "What's the lowest FICO for DSCR?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    // Harbor's Foreign National DSCR program accepts foreign credit — the
    // honest floor is "no U.S. FICO required", not a numeric score.
    expectFacts: ["No U.S. FICO required"],
    expectLenders: ["Harbor"],
  },
  {
    id: "extra-second-home-1099",
    question: "Who does 1099 on a second home?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Summit"],
  },
  {
    id: "extra-fn-reserves",
    question: "How many months reserves for a foreign national?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Harbor"],
  },
  {
    id: "extra-str",
    question: "Can I use Airbnb income for DSCR qualifying?",
    expectedIntent: "availability_lookup",
    // strIncomeEligible is unpopulated across the sample catalog.
    expectAnswered: false,
    expectFacts: ["not yet confirmed"],
  },
  {
    id: "extra-jumbo",
    question: "Who goes to $4 million?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Evergreen"],
  },
  {
    id: "extra-itin-primary",
    question: "Who has ITIN loans for a primary residence purchase?",
    expectedIntent: "availability_lookup",
    expectAnswered: true,
    expectLenders: ["Horizon"],
  },
  {
    id: "extra-bk13",
    question: "Shortest Chapter 13 discharge seasoning?",
    expectedIntent: "threshold_lookup",
    expectAnswered: true,
    expectFacts: ["12 months"],
    expectLenders: ["Harbor"],
  },
];
