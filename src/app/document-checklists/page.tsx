import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { buildDocumentChecklistSections } from "./sections";
import { DocumentChecklistCard } from "./checklist-card";
import { pageMetadata } from "@/lib/seo";
import { recordPageView } from "@/lib/activity";
import { PremiumPageHero } from "@/components/premium-ui";

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

export const metadata: Metadata = pageMetadata({
  title: "Non-QM Document Checklists — DSCR, Bank Statement, ITIN",
  description:
    "Reference checklists for every Non-QM loan type: DSCR, Bank Statement, P&L Only, Asset Depletion, ITIN, and Foreign National document requirements.",
  path: "/document-checklists",
});

export default async function DocumentChecklistsPage() {
  await recordPageView("doc_needs");
  const sections = buildDocumentChecklistSections();
  return (
    <div className="nexus-workspace nexus-checklists-page gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <PremiumPageHero
        icon={ClipboardCheck}
        title={<>Document <span className="nexus-title-gold">Checklists</span></>}
        description={<>A quick, standing reference for what to have ready by <span className="font-semibold text-amber-300">loan type</span> — generated from the same rules NON-QM Nexus uses for every scenario.</>}
      />

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
