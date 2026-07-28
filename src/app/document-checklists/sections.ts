import { generateNeedsList } from "@/domain/matching/needsList";
import type { Scenario } from "@/domain/types/scenario";
import type { NeedsListItem } from "@/domain/types/results";

/** A representative, synthetic scenario per loan type/purpose — used ONLY
 * to drive the SAME deterministic generateNeedsList() logic the per-
 * scenario results page uses, so this reference page can never drift out
 * of sync with the real rules. No borrower data, no PII — these are
 * placeholder shapes purely to select which document rules fire. */
function synthetic(overrides: Partial<Scenario>): Scenario {
  return {
    id: "reference",
    organizationId: "reference",
    name: "Document checklist reference",
    createdByUserId: "reference",
    loanPurpose: "purchase",
    citizenship: "us_citizen",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as Scenario;
}

/** A PURE income-doc-type section: citizenship fixed to us_citizen so no
 * citizenship-specific overlay items leak in — the section shows exactly
 * what this doc type itself requires, nothing conflated from elsewhere. */
function docTypeSection(overrides: Partial<Scenario>): { purchase: Scenario; refinance: Scenario } {
  return {
    purchase: synthetic({ citizenship: "us_citizen", ...overrides }),
    refinance: synthetic({ citizenship: "us_citizen", loanPurpose: "rate_term_refinance", ...overrides }),
  };
}

/** A PURE citizenship-overlay section: incomeDocType left UNSET so no
 * doc-type-specific items (DSCR's lease/appraisal, Bank Statement's
 * deposit history, etc.) leak into what should only be universal +
 * citizenship-specific items — the exact bug this fixes (Foreign National
 * previously forced incomeDocType: "dscr", pulling DSCR-only documents
 * into the Foreign National section). */
function citizenshipSection(overrides: Partial<Scenario>): { purchase: Scenario; refinance: Scenario } {
  return {
    purchase: synthetic({ ...overrides }),
    refinance: synthetic({ loanPurpose: "rate_term_refinance", ...overrides }),
  };
}

const PROGRAM_DEPENDENT_INCOME_NOTE: NeedsListItem = {
  category: "income",
  label: "Income documentation (Bank Statement, DSCR, Full Doc, P&L, Asset Depletion, or 1099)",
  required: false,
  reason:
    "Depends entirely on which income-qualification method this file actually uses — see that method's own section on this page for the exact required items.",
};

export interface ChecklistSection {
  title: string;
  description: string;
  purchase: NeedsListItem[];
  refinance: NeedsListItem[];
  /** An optional, clearly-separated sub-list for items that only apply
   * "if" a certain condition holds — e.g. ITIN's bank-statement documents,
   * which only apply when the specific ITIN program used happens to be
   * bank-statement-documented (not every ITIN program is). These are
   * REAL required documents for that specific combination, just not
   * universal to every ITIN file, so they're shown separately rather than
   * folded into the main required list. */
  conditionalTitle?: string;
  conditionalPurchase?: NeedsListItem[];
  conditionalRefinance?: NeedsListItem[];
}

/** Builds every document-checklist section shown on /document-checklists.
 * Exported (not inlined in the page) so it can be unit-tested directly —
 * see tests/domain/documentChecklistSections.test.ts, which pins the
 * exact mapping bugs this fixed: DSCR gets its own section and never
 * leaks into Foreign National; ITIN's bank-statement items are never
 * universally required. */
export function buildDocumentChecklistSections(): ChecklistSection[] {
  const bankStatement = docTypeSection({ incomeDocType: "bank_statement", bankStatement: { personalOrBusiness: "business", months: 12 } });
  const pnl = docTypeSection({ incomeDocType: "pnl_only" });
  const dscr = docTypeSection({ incomeDocType: "dscr", occupancy: "investment" });
  const assetDepletion = docTypeSection({ incomeDocType: "asset_depletion" });
  const income1099 = docTypeSection({ incomeDocType: "1099" });
  const fullDoc = docTypeSection({ incomeDocType: "full_doc" });

  const foreignNational = citizenshipSection({ citizenship: "foreign_national" });
  const itinBase = citizenshipSection({ citizenship: "itin" });
  // The "if applicable" bank-statement sub-list: only the items a
  // bank-statement-documented ITIN file would ADD beyond the base ITIN
  // list (never the base ITIN identity items themselves), each shown as
  // not universally required.
  const itinWithBankStatement = docTypeSection({
    citizenship: "itin",
    incomeDocType: "bank_statement",
    bankStatement: { personalOrBusiness: "business", months: 12 },
  });
  const baseLabelsPurchase = new Set(generateNeedsList(itinBase.purchase).map((i) => i.label));
  const baseLabelsRefi = new Set(generateNeedsList(itinBase.refinance).map((i) => i.label));
  const itinConditionalPurchase: NeedsListItem[] = generateNeedsList(itinWithBankStatement.purchase)
    .filter((i) => !baseLabelsPurchase.has(i.label))
    .map((i) => ({ ...i, required: false }));
  const itinConditionalRefinance: NeedsListItem[] = generateNeedsList(itinWithBankStatement.refinance)
    .filter((i) => !baseLabelsRefi.has(i.label))
    .map((i) => ({ ...i, required: false }));

  return [
    {
      title: "Bank Statement",
      description: "Income qualified from personal or business bank deposits — no tax returns required.",
      purchase: generateNeedsList(bankStatement.purchase),
      refinance: generateNeedsList(bankStatement.refinance),
    },
    {
      title: "Profit & Loss (P&L) Only",
      description: "Income qualified from a CPA/EA-prepared Profit & Loss statement — tax returns not required.",
      purchase: generateNeedsList(pnl.purchase),
      refinance: generateNeedsList(pnl.refinance),
    },
    {
      title: "DSCR",
      description: "Investment property qualified by the property's own cash flow — no personal income documentation.",
      purchase: generateNeedsList(dscr.purchase),
      refinance: generateNeedsList(dscr.refinance),
    },
    {
      title: "Asset Depletion",
      description: "Income derived from pooling liquid/retirement assets and dividing by an asset-divisor term.",
      purchase: generateNeedsList(assetDepletion.purchase),
      refinance: generateNeedsList(assetDepletion.refinance),
    },
    {
      title: "1099",
      description: "Income qualified from 1099 earnings for commission/contract-based work.",
      purchase: generateNeedsList(income1099.purchase),
      refinance: generateNeedsList(income1099.refinance),
    },
    {
      title: "Full Documentation",
      description: "Traditional W-2/tax-return-based income documentation.",
      purchase: generateNeedsList(fullDoc.purchase),
      refinance: generateNeedsList(fullDoc.refinance),
    },
    {
      title: "Foreign National",
      description: "Borrower resides outside the U.S. and does not have a Social Security number or U.S. credit history.",
      purchase: [...generateNeedsList(foreignNational.purchase), PROGRAM_DEPENDENT_INCOME_NOTE],
      refinance: [...generateNeedsList(foreignNational.refinance), PROGRAM_DEPENDENT_INCOME_NOTE],
    },
    {
      title: "ITIN",
      description: "Borrower files taxes with an Individual Taxpayer Identification Number instead of a Social Security number.",
      purchase: [...generateNeedsList(itinBase.purchase), PROGRAM_DEPENDENT_INCOME_NOTE],
      refinance: [...generateNeedsList(itinBase.refinance), PROGRAM_DEPENDENT_INCOME_NOTE],
      conditionalTitle: "If applicable — bank-statement-documented ITIN programs",
      conditionalPurchase: itinConditionalPurchase,
      conditionalRefinance: itinConditionalRefinance,
    },
  ];
}
