import { ClipboardCheck } from "lucide-react";
import { generateNeedsList } from "@/domain/matching/needsList";
import type { Scenario } from "@/domain/types/scenario";
import { DocumentChecklistCard } from "./checklist-card";

export const dynamic = "force-static";

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

const SECTIONS: Array<{
  title: string;
  description: string;
  purchase: Scenario;
  refinance: Scenario;
}> = [
  {
    title: "Bank Statement",
    description: "Income qualified from personal or business bank deposits — no tax returns required.",
    purchase: synthetic({ incomeDocType: "bank_statement", bankStatement: { personalOrBusiness: "business", months: 12 } }),
    refinance: synthetic({ loanPurpose: "rate_term_refinance", incomeDocType: "bank_statement", bankStatement: { personalOrBusiness: "business", months: 12 } }),
  },
  {
    title: "Profit & Loss (P&L) Only",
    description: "Income qualified from a CPA/EA-prepared Profit & Loss statement — tax returns not required.",
    purchase: synthetic({ incomeDocType: "pnl_only" }),
    refinance: synthetic({ loanPurpose: "rate_term_refinance", incomeDocType: "pnl_only" }),
  },
  {
    title: "Foreign National",
    description: "Borrower resides outside the U.S. and does not have a Social Security number or U.S. credit history.",
    purchase: synthetic({ citizenship: "foreign_national", incomeDocType: "dscr" }),
    refinance: synthetic({ loanPurpose: "rate_term_refinance", citizenship: "foreign_national", incomeDocType: "dscr" }),
  },
  {
    title: "ITIN",
    description: "Borrower files taxes with an Individual Taxpayer Identification Number instead of a Social Security number.",
    purchase: synthetic({ citizenship: "itin", incomeDocType: "bank_statement", bankStatement: { personalOrBusiness: "business", months: 12 } }),
    refinance: synthetic({ loanPurpose: "rate_term_refinance", citizenship: "itin", incomeDocType: "bank_statement", bankStatement: { personalOrBusiness: "business", months: 12 } }),
  },
  {
    title: "Full Documentation",
    description: "Traditional W-2/tax-return-based income documentation.",
    purchase: synthetic({ incomeDocType: "full_doc" }),
    refinance: synthetic({ loanPurpose: "rate_term_refinance", incomeDocType: "full_doc" }),
  },
];

export default function DocumentChecklistsPage() {
  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <div className="gold-scenarios-panel relative overflow-hidden p-6 sm:p-8">
        <div className="gold-ambient" />
        <div className="relative z-10">
          <div className="flex items-start gap-4">
            <span className="gold-header-icon relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
              <ClipboardCheck className="h-6 w-6 text-amber-300" />
            </span>
            <div>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight text-white">Document Checklists</h1>
              <p className="mt-1 text-sm sm:text-base text-slate-400 max-w-2xl">
                A quick, standing reference for what to have ready by <span className="font-semibold text-amber-300">loan type</span> — generated
                from the exact same rules the platform uses per scenario, so it never drifts out of sync. Any specific
                scenario&apos;s own document list (in Best Lender Matches) always reflects that borrower&apos;s real details;
                this page is the general starting-point checklist.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <DocumentChecklistCard
            key={section.title}
            title={section.title}
            description={section.description}
            purchaseItems={generateNeedsList(section.purchase)}
            refinanceItems={generateNeedsList(section.refinance)}
          />
        ))}
      </div>
    </div>
  );
}
