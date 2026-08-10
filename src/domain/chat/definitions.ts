/**
 * Definition dictionary + non-answer builders for the chatbot.
 *
 * Definitions are deterministic, curated text (no LLM, no tool grounding needed
 * — they explain industry terminology, not lender facts). Non-answers follow
 * the spec's three-way honesty contract: "no program allows this" vs "we don't
 * capture this field" vs "varies by lender / handled as an exception".
 */

export interface Definition {
  key: string;
  term: string;
  definition: string;
}

export const DEFINITIONS: Definition[] = [
  {
    key: "late_pattern",
    term: "2x30x12",
    definition:
      "A shorthand for mortgage/housing payment history: the count of 30-day lates, lookback, and the period — 2x30x12 means two 30-day lates within the trailing 12 months. 1x60x24 means one 60-day late within 24 months. 0x30x12 means a clean 12-month housing history.",
  },
  {
    key: "dscr",
    term: "DSCR",
    definition:
      "Debt Service Coverage Ratio — the property's gross rental income divided by its total monthly debt service (PITIA). A DSCR of 1.00 means income exactly covers the payment; most DSCR lenders require 1.00+ unless they offer a no-ratio program. A higher LTV lowers the ratio, which is why advertised max LTV and actual qualification can differ.",
  },
  {
    key: "ltv",
    term: "LTV",
    definition: "Loan-to-Value — the loan amount as a percentage of the property's applicable value. 80% LTV is the same as a 20% down payment.",
  },
  {
    key: "dti",
    term: "DTI",
    definition: "Debt-to-Income — total monthly obligations divided by gross monthly income. Full-doc non-QM programs cap it; DSCR and no-ratio programs typically don't use DTI.",
  },
  {
    key: "pnl_vs_bank_statement",
    term: "P&L only vs bank statement",
    definition:
      "P&L only qualifies from the borrower's profit-and-loss statement (the P&L itself is the income document; tax returns are not required, and a CPA attestation only confirms tax filing). Bank statement qualifies from 12 or 24 months of deposits, usually with an expense factor applied to derive income. P&L only is typically capped lower (commonly ~80% LTV) than bank statement (commonly up to 90%).",
  },
  {
    key: "reserves",
    term: "Reserves",
    definition: "Liquid funds the borrower must retain after closing — expressed in months of the proposed PITIA. E.g. 6 months of reserves is 6x the monthly payment held in liquid assets.",
  },
  {
    key: "seasoning",
    term: "Seasoning",
    definition: "The time that must elapse since a credit event (bankruptcy, foreclosure, short sale, deed-in-lieu) before a lender will consider the borrower. Shorter seasoning is riskier and usually meets a smaller lender universe.",
  },
  {
    key: "no_ratio",
    term: "No-ratio (DSCR)",
    definition:
      "A DSCR-family loan with no minimum DSCR ratio requirement — underwritten on rent/asset strength rather than a ratio floor. Not the same as no income verification.",
  },
  {
    key: "non_warrantable",
    term: "Non-warrantable condo",
    definition:
      "A condo that doesn't meet Fannie/Freddie warrantability standards (e.g. high investor concentration, commercial space, litigation). Treated separately by lenders, usually with a lower LTV cap than a warrantable condo.",
  },
];

export function lookupDefinition(normalized: string): Definition | null {
  const text = ` ${normalized} `;
  // "difference between P&L and bank statement" — catch the composite before
  // the individual terms. Handles both "pnl" and the normalized "pnl_only".
  if (
    /\bdifference between\b/.test(text) &&
    /\bpnl\b|\bpnl_only\b|\bprofit/.test(text) &&
    /\bbank ?statement|bank_statement/.test(text)
  ) {
    return DEFINITIONS.find((d) => d.key === "pnl_vs_bank_statement") ?? null;
  }
  // Order by specificity so "pnl vs bank statement" is caught before bare "pnl".
  const order = ["pnl_vs_bank_statement", "late_pattern", "dscr", "no_ratio", "seasoning", "reserves", "non_warrantable", "ltv", "dti"];
  for (const key of order) {
    const def = DEFINITIONS.find((d) => d.key === key);
    if (!def) continue;
    const term = def.term.toLowerCase();
    if (text.includes(term)) return def;
  }
  return null;
}

export interface NonAnswer {
  answered: false;
  answer: string;
  followUps: string[];
  cta?: { label: string; href: string };
}

export function nonAnswerNoProgramAllows(what: string): NonAnswer {
  return {
    answered: false,
    answer: `No program in your library currently allows ${what}, so I can't name a lender for it. That's a library-limits answer, not a market claim — lenders outside your catalog may differ.`,
    followUps: ["Expand the range of guidelines you've loaded", "Open the scenario builder to confirm"],
    cta: { label: "Open scenario builder", href: "/scenarios/new" },
  };
}

export function nonAnswerFieldNotCaptured(what: string): NonAnswer {
  return {
    answered: false,
    answer: `Your library doesn't capture ${what} as a structured field yet, so I can't answer this precisely. Ask an admin to add it — once it's tracked, this question becomes answerable.`,
    followUps: ["Ask an admin to enable this field", "Ask another lender question"],
  };
}

export function nonAnswerVariesByLender(what: string): NonAnswer {
  return {
    answered: false,
    answer: `${what} varies by lender and is usually handled as an exception rather than a published guideline, so I can't give a single number. It's a case-by-case decision discussed with the lender's AE.`,
    followUps: ["Which lenders are exception-friendly?", "View AE contacts"],
    cta: { label: "View AE contacts", href: "/lenders" },
  };
}

export function nonAnswerGuidelinesNotLoaded(lenderName: string): NonAnswer {
  return {
    answered: false,
    answer: `${lenderName} doesn't have a verified guideline version loaded in your library yet, so I can't answer from its actual guidelines. I won't infer their terms from reputation or market norms.`,
    followUps: ["Ask an admin to load this lender's guidelines", "Ask about a lender with loaded guidelines"],
  };
}