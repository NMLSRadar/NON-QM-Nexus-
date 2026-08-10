/**
 * Curated product-help corpus + industry glossary for the chatbot's
 * process_help / app_navigation / definition intents. Version-controlled
 * data — the assistant answers these from here, never from model memory,
 * so a route rename is a one-line edit with a test, not a hallucination.
 */

export interface HelpEntry {
  id: string;
  title: string;
  keywords: string[];
  steps: string[];
  route?: string;
}

export const HELP_CORPUS: HelpEntry[] = [
  {
    id: "upload_pnl",
    title: "Upload a P&L or other income document",
    keywords: ["upload", "pnl", "p&l", "profit", "loss", "document", "bank statement", "attach"],
    steps: [
      "Open the scenario (Scenarios → select the scenario).",
      "Use the Document Needs panel on the scenario page to see what's required.",
      "Attach documents from the scenario's document checklist section.",
    ],
    route: "/scenarios",
  },
  {
    id: "duplicate_scenario",
    title: "Duplicate a scenario",
    keywords: ["duplicate", "copy", "clone", "scenario", "re-run", "rerun"],
    steps: [
      "Open Scenarios and find the scenario row.",
      "Use the row actions menu (⋯) and choose Duplicate.",
      "The copy opens in the scenario builder with all facts prefilled — adjust and re-run.",
    ],
    route: "/scenarios",
  },
  {
    id: "new_scenario",
    title: "Run a full scenario analysis",
    keywords: ["run", "scenario", "full", "analysis", "matcher", "new", "start"],
    steps: [
      "Go to Scenarios → New Scenario (or use Voice intake).",
      "Enter the borrower vitals — the more complete, the more precise the match.",
      "Run analysis to get ranked, cited program matches with a needs list.",
    ],
    route: "/scenarios/new",
  },
  {
    id: "exception_process",
    title: "Get an exception submitted",
    keywords: ["exception", "submit", "submitted", "request", "manual review", "compensating"],
    steps: [
      "Exceptions are lender decisions — they run through the lender's Account Executive, not through this platform's matrix.",
      "Check the program's exception policy on its detail page (where captured) to see if a documented exception path exists.",
      "Contact the lender's AE (AE directory) with the file's compensating factors: FICO, LTV, reserves, housing history, income strength.",
    ],
    route: "/ae",
  },
  {
    id: "turn_times",
    title: "Compare lender turn times",
    keywords: ["fastest", "close", "turn", "time", "speed", "ctc", "clear"],
    steps: [
      "Turn-time estimates, where captured, appear on the program detail page with their last-updated date.",
      "They are estimates, not commitments — actual speed depends on file completeness and current lender volume.",
    ],
  },
  {
    id: "voice_intake",
    title: "Use voice intake",
    keywords: ["voice", "speak", "dictate", "intake", "talk"],
    steps: ["Go to Scenarios → Voice and describe the borrower out loud; the extractor fills the vitals for you."],
    route: "/scenarios/voice",
  },
];

export interface GlossaryEntry {
  id: string;
  term: string;
  keywords: string[];
  definition: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "late_pattern",
    term: "NxDDxM housing-late shorthand (e.g. 2x30x12)",
    keywords: ["x30x", "x60x", "x90x", "late pattern", "mortgage lates", "housing history"],
    definition:
      "Count × severity × lookback: \"2x30x12\" means two 30-day mortgage lates in the trailing 12 months; \"1x60x24\" means one 60-day late in the trailing 24 months; \"0x30x12\" means a clean 12-month housing history is required.",
  },
  {
    id: "dscr_calc",
    term: "DSCR (Debt Service Coverage Ratio)",
    keywords: ["dscr", "calculated", "debt service", "coverage ratio", "pitia"],
    definition:
      "DSCR = gross monthly rent ÷ PITIA (principal, interest, taxes, insurance, HOA). This platform computes it deterministically in the scenario engine from the lease/market rent and the full housing payment; a ratio ≥ the program's minimum (often 1.00) qualifies on rental cash flow with no personal income documentation.",
  },
  {
    id: "pnl_vs_bs",
    term: "P&L only vs. bank statement",
    keywords: ["pnl", "p&l", "bank statement", "difference", "versus"],
    definition:
      "Bank statement programs derive qualifying income from 12 or 24 months of actual deposits minus an expense factor. P&L-only programs qualify from a prepared profit-and-loss statement (often CPA/EA-prepared) — the P&L itself is the income document and tax returns are not required; some lenders ask for a few months of statements only to support the P&L at higher LTVs.",
  },
  {
    id: "no_ratio",
    term: "No-ratio DSCR",
    keywords: ["no ratio", "no_ratio"],
    definition:
      "A DSCR-family program with no minimum ratio requirement — the property's cash flow is documented but not required to cover the payment. Leverage is typically lower than a standard DSCR loan.",
  },
  {
    id: "non_warrantable",
    term: "Non-warrantable condo",
    keywords: ["non_warrantable", "warrantable", "condo"],
    definition:
      "A condo project that fails agency (Fannie/Freddie) warranty criteria — e.g. high investor concentration, single-entity ownership, pending litigation, or insufficient reserves. Non-QM lenders that accept them usually cap LTV below the warrantable-condo ceiling.",
  },
  {
    id: "itin",
    term: "ITIN borrower",
    keywords: ["itin", "individual taxpayer"],
    definition:
      "A borrower who files U.S. taxes with an Individual Taxpayer Identification Number instead of a Social Security number. ITIN eligibility is program-specific and separate from Foreign National (who lives and works abroad).",
  },
  {
    id: "ppp",
    term: "Prepayment penalty (PPP)",
    keywords: ["ppp", "prepayment", "penalty", "stepdown"],
    definition:
      "A fee for paying off an investment-property loan early, common on DSCR loans (e.g. a 3- or 5-year stepdown). Owner-occupied loans generally cannot carry one.",
  },
  {
    id: "seasoning",
    term: "Credit-event seasoning",
    keywords: ["seasoning", "bk", "bankruptcy", "foreclosure", "waiting period"],
    definition:
      "The required time since a credit event (bankruptcy discharge, foreclosure, short sale, deed-in-lieu) before a program will lend, measured in months. Non-QM seasoning is program-specific and often much shorter than agency waiting periods.",
  },
];
