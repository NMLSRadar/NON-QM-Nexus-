import { ClipboardCheck } from "lucide-react";
import { buildDocumentChecklistSections } from "./sections";
import { DocumentChecklistCard } from "./checklist-card";

// Matches every other page in this app: force-dynamic, never force-static.
// The root layout renders auth-aware nav (Supabase-backed) on every page,
// so attempting to statically prerender ANY page at build time tries to
// create a Supabase client with no credentials available in that build
// environment — this is exactly what broke CI (see the "Should I be
// concerned?" chat thread, 2026-07-28): GitHub Actions' bare `next build`
// has no Supabase secrets, unlike the local dev shell (.env.local) or the
// real Vercel deploy target (configured project env vars), so the
// production site was never actually affected — only CI's own build step.
export const dynamic = "force-dynamic";

export default function DocumentChecklistsPage() {
  const sections = buildDocumentChecklistSections();
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
        {sections.map((section) => (
          <DocumentChecklistCard
            key={section.title}
            title={section.title}
            description={section.description}
            purchaseItems={section.purchase}
            refinanceItems={section.refinance}
            conditionalTitle={section.conditionalTitle}
            conditionalPurchaseItems={section.conditionalPurchase}
            conditionalRefinanceItems={section.conditionalRefinance}
          />
        ))}
      </div>
    </div>
  );
}
