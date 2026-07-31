import { Card } from "@/components/ui";
import { EnterpriseForm } from "./enterprise-form";
import { MAX_BULK_SEATS } from "@/lib/bulkMembership";

export const metadata = {
  title: "Bulk Membership — NON-QM Nexus",
};

/** Public, no-auth lead-capture page — no pricing shown anywhere on it,
 * since every Bulk Membership deal is negotiated per company
 * (docs/bulk-membership.md). Fully separate from /pricing's self-serve
 * Essential/Professional/Enterprise tiers, which this page never touches. */
export default function EnterprisePage() {
  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-10 sm:px-6 bg-[#050505] rounded-b-3xl min-h-[70vh]">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-semibold text-white">Bulk Membership</h1>
          <p className="text-sm text-slate-400">
            One system for a whole brokerage — from a handful of loan officers up to {MAX_BULK_SEATS}, on one
            negotiated plan and one bill. Tell us about your team and we&apos;ll work out a custom rate.
          </p>
        </div>
        <Card dark>
          <EnterpriseForm />
        </Card>
      </div>
    </div>
  );
}
