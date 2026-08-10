/**
 * Chatbot eval golden set (chatbot precision spec §7).
 *
 * ≥60 fixtures drawn from the acceptance corpus, including 10 deliberately
 * unanswerable ones and 10 with typos/shorthand. Each fixture grades intent
 * accuracy, grounding, correct-refusal, and hallucination-entity rate against
 * the eval seed catalog (evals/chatbot/seed.ts) via the deterministic path.
 *
 * `expectAnswer` is a predicate over the reply — using only fields the
 * deterministic renderer guarantees (grounded rows, no hallucinated entities).
 */

export interface ChatbotFixture {
  id: string;
  question: string;
  expectedIntent: string;
  /** true when the question SHOULD get a real answer; false = honest non-answer. */
  answered: boolean;
  /** Substrings the answer must contain (when answered). */
  mustContain?: string[];
  /** Substrings the answer must NOT contain (hallucination guard). */
  mustNotContain?: string[];
  typoOrShorthand?: boolean;
  unanswerable?: boolean;
}

export const GOLDEN_SET: ChatbotFixture[] = [
  // ---- Superlative / ranking lookups ---------------------------------------
  { id: "g01", question: "Who has the lowest down payment for DSCR?", expectedIntent: "superlative_lookup", answered: true, mustContain: ["DSCR Select"], mustNotContain: ["MadeUp"] },
  { id: "g02", question: "What's the highest LTV on 12-month bank statements for a cash-out?", expectedIntent: "superlative_lookup", answered: true, mustNotContain: ["MadeUp"] },
  { id: "g03", question: "Which lender goes to the highest DTI on full doc non-QM?", expectedIntent: "superlative_lookup", answered: false },
  { id: "g04", question: "Lowest reserves for an investor purchase?", expectedIntent: "superlative_lookup", answered: true },
  { id: "g05", question: "Who has the highest DSCR-financing LTV?", expectedIntent: "superlative_lookup", answered: true },

  // ---- Availability / filter lookups ---------------------------------------
  { id: "g06", question: "Who has ITIN loans?", expectedIntent: "availability_lookup", answered: true, mustContain: ["ITIN Full Doc"] },
  { id: "g07", question: "Which lenders do foreign national loans?", expectedIntent: "availability_lookup", answered: true, mustContain: ["Foreign National Investor"] },
  { id: "g08", question: "Anyone doing non-warrantable condos with DSCR?", expectedIntent: "availability_lookup", answered: true, mustNotContain: ["MadeUp"] },
  { id: "g09", question: "Who allows an LLC to take title?", expectedIntent: "availability_lookup", answered: true },
  { id: "g10", question: "Who does 1099-only?", expectedIntent: "availability_lookup", answered: true, mustContain: ["1099"] },
  { id: "g11", question: "Which lenders allow interest-only?", expectedIntent: "availability_lookup", answered: false },
  { id: "g12", question: "Who offers asset depletion?", expectedIntent: "availability_lookup", answered: true, mustContain: ["Asset Depletion"] },
  { id: "g13", question: "Who allows foreign national on a non-warrantable condo?", expectedIntent: "availability_lookup", answered: true },
  { id: "g14", question: "Any lender doing short-term rental DSCR income?", expectedIntent: "availability_lookup", answered: false },

  // ---- Threshold questions --------------------------------------------------
  { id: "g15", question: "What's the lowest FICO score allowed in non-QM?", expectedIntent: "threshold_lookup", answered: true, mustNotContain: ["MadeUp"] },
  { id: "g16", question: "Minimum loan amount for DSCR?", expectedIntent: "threshold_lookup", answered: true },
  { id: "g17", question: "What's the shortest BK seasoning anyone has?", expectedIntent: "superlative_lookup", answered: true },
  { id: "g18", question: "What's the highest LTV allowed?", expectedIntent: "threshold_lookup", answered: true },

  // ---- Scenario triage ------------------------------------------------------
  { id: "g19", question: "I have a borrower who has two mortgage lates, what lender has flexible guidelines for mortgage lates?", expectedIntent: "exception_guidance", answered: true },
  { id: "g20", question: "Borrower is 1x30x12, 660 score, 75% LTV cash out — who works?", expectedIntent: "scenario_triage", answered: true },
  { id: "g21", question: "Self-employed 18 months, can anyone use 12-month statements?", expectedIntent: "scenario_triage", answered: true },
  { id: "g22", question: "720 fico, 80% ltv, bank statement, purchase — who fits?", expectedIntent: "scenario_triage", answered: true, mustNotContain: ["MadeUp"] },
  { id: "g23", question: "Borrower has BK7 and wants 85% LTV cash-out DSCR.", expectedIntent: "scenario_triage", answered: true },

  // ---- Soft / process questions --------------------------------------------
  { id: "g24", question: "Where can I find more flexible non-QM lenders who allow for exceptions?", expectedIntent: "exception_guidance", answered: true, mustContain: ["exception-friendly"] },
  { id: "g25", question: "Who's fastest to close?", expectedIntent: "process_help", answered: true },
  { id: "g26", question: "How do I get an exception submitted?", expectedIntent: "process_help", answered: true },
  { id: "g27", question: "Where do I upload a P&L?", expectedIntent: "app_navigation", answered: true },
  { id: "g28", question: "How do I duplicate a scenario?", expectedIntent: "app_navigation", answered: true },

  // ---- Definitional ---------------------------------------------------------
  { id: "g29", question: "What does 2x30x12 mean?", expectedIntent: "definition", answered: true, mustContain: ["two 30-day lates"] },
  { id: "g30", question: "How is DSCR calculated here?", expectedIntent: "definition", answered: true },
  { id: "g31", question: "Difference between P&L only and bank statement?", expectedIntent: "definition", answered: true },
  { id: "g32", question: "What is LTV?", expectedIntent: "definition", answered: true },

  // ---- Part 2: exception guidance + pricing ---------------------------------
  { id: "g33", question: "Who gives exceptions on mortgage lates?", expectedIntent: "exception_guidance", answered: true, mustNotContain: ["will approve", "guarantee"] },
  { id: "g34", question: "Why is Logan cheaper?", expectedIntent: "comparison", answered: true, mustNotContain: ["$", "0.5", "bps"] },
  { id: "g35", question: "Will Acra approve this file?", expectedIntent: "exception_guidance", answered: true, mustNotContain: ["will approve", "guarantee"] },
  { id: "g36", question: "What compensating factors do I have at 72% LTV and 12 months reserves?", expectedIntent: "exception_guidance", answered: true, mustContain: ["reserves"] },
  { id: "g37", question: "Who has the highest LTV on bank statements?", expectedIntent: "superlative_lookup", answered: true },
  { id: "g38", question: "Anyone doing condos with DSCR?", expectedIntent: "availability_lookup", answered: true },
  { id: "g39", question: "What's the minimum DSCR on the DSCR Flex program?", expectedIntent: "program_detail", answered: true },
  { id: "g40", question: "Which lender is most flexible on credit?", expectedIntent: "exception_guidance", answered: true },
  { id: "g41", question: "Who allows foreign national DSCR?", expectedIntent: "availability_lookup", answered: true, mustContain: ["Foreign National Investor"] },
  { id: "g42", question: "What's the highest DTI on bank statement?", expectedIntent: "superlative_lookup", answered: false },
  { id: "g43", question: "Who supports 12-month bank statements for cash-out?", expectedIntent: "availability_lookup", answered: true },
  { id: "g44", question: "What's the lowest down payment across the whole library?", expectedIntent: "superlative_lookup", answered: true },
  { id: "g45", question: "How many months reserves does the Foreign National Investor program require?", expectedIntent: "program_detail", answered: true },
  { id: "g46", question: "Which lender takes BK13 borrowers?", expectedIntent: "availability_lookup", answered: true },
  { id: "g47", question: "Who can do a no-ratio DSCR?", expectedIntent: "availability_lookup", answered: true },
  { id: "g48", question: "What's the seasoning requirement for a foreclosure?", expectedIntent: "threshold_lookup", answered: true },

  // ---- Typos / shorthand (10) ------------------------------------------------
  { id: "g51", question: "Who has the lowest down payment for DCSR?", expectedIntent: "superlative_lookup", answered: true, typoOrShorthand: true },
  { id: "g52", question: "two mortgage lights, who is flexible?", expectedIntent: "exception_guidance", answered: true, typoOrShorthand: true },
  { id: "g53", question: "bank statment 12 month highest ltv?", expectedIntent: "superlative_lookup", answered: true, typoOrShorthand: true },
  { id: "g54", question: "ITN borrower loans?", expectedIntent: "availability_lookup", answered: true, typoOrShorthand: true },
  { id: "g55", question: "assett depletion lender?", expectedIntent: "availability_lookup", answered: true, typoOrShorthand: true },
  { id: "g56", question: "full dock non-qm highest dti?", expectedIntent: "superlative_lookup", answered: false, typoOrShorthand: true },
  { id: "g57", question: "BK7 seasoning shortest?", expectedIntent: "superlative_lookup", answered: true, typoOrShorthand: true },
  { id: "g58", question: "who does non-warrantable condo DSCR?", expectedIntent: "availability_lookup", answered: true, typoOrShorthand: true },
  { id: "g59", question: "2-4 unit highest ltv?", expectedIntent: "superlative_lookup", answered: true, typoOrShorthand: true },
  { id: "g60", question: "who allows llc title?", expectedIntent: "availability_lookup", answered: true, typoOrShorthand: true },

  // ---- Deliberately unanswerable (10) ----------------------------------------
  { id: "g71", question: "Who is the best lender for a 900 FICO borrower making $1M/month?", expectedIntent: "superlative_lookup", answered: false, unanswerable: true },
  { id: "g72", question: "What's the max LTV for a lender named MadeUp Capital?", expectedIntent: "program_detail", answered: false, unanswerable: true, mustNotContain: ["MadeUp"] },
  { id: "g73", question: "What's the exact interest rate for DSCR at 75% LTV?", expectedIntent: "comparison", answered: true, unanswerable: true, mustNotContain: ["%", "rate:"] },
  { id: "g74", question: "Is this loan legal?", expectedIntent: "out_of_scope", answered: false, unanswerable: true },
  { id: "g75", question: "Can I just call it owner-occupied?", expectedIntent: "out_of_scope", answered: false, unanswerable: true },
  { id: "g76", question: "What's the pricing for a 680 FICO borrower?", expectedIntent: "comparison", answered: true, unanswerable: true, mustNotContain: ["$", "0."] },
  { id: "g77", question: "Which lender will approve a borrower who is a protected class?", expectedIntent: "out_of_scope", answered: false, unanswerable: true },
  { id: "g78", question: "Tell me about the MadeUp Flex program.", expectedIntent: "program_detail", answered: false, unanswerable: true, mustNotContain: ["MadeUp"] },
  { id: "g79", question: "What's the average turnaround time for DSCR programs?", expectedIntent: "process_help", answered: true, unanswerable: true },
  { id: "g80", question: "Give me legal advice on structuring this loan.", expectedIntent: "out_of_scope", answered: false, unanswerable: true },
];

export const GOLDEN_SET_COUNT = GOLDEN_SET.length; // >= 60