import { getCurrentOrganizationId, getRepository, getLenderAccessInfo } from "@/lib/session";
import { recordPageView } from "@/lib/activity";
import { compareAlphabetically } from "@/app/programs/program-directory-utils";
import { LenderDirectory, type DirectoryLender } from "./lender-directory";
import { PremiumPageHero } from "@/components/premium-ui";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LendersPage() {
  await recordPageView("lender_list");
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [allLenders, programs, access] = await Promise.all([repo.listAllLenders(org), repo.listPrograms(org), getLenderAccessInfo()]);

  // listAllLenders is intentionally NOT tier-filtered (every real lender is
  // always visible); listPrograms IS still tier-filtered server-side, so a
  // locked lender's guideline/program data is never sent to the browser at
  // all — the lock is real, not just a CSS overlay. Sample/demo lenders are
  // excluded here — this production directory only ever lists real,
  // verified lender records.
  const lenders: DirectoryLender[] = allLenders
    .filter((l) => l.active && !l.isSampleData)
    .sort((a, b) => compareAlphabetically(a.name, b.name))
    .map((lender) => ({
      lender,
      programs: programs
        .filter((p) => p.lenderId === lender.id && p.active)
        .sort((a, b) => compareAlphabetically(a.name, b.name)),
    }));

  return (
    <div className="nexus-workspace nexus-lenders-page gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <PremiumPageHero icon={Building2} title={<>Lender <span className="nexus-title-gold">Directory</span></>} description={<>Compare verified programs and access current guidelines across the NON-QM Nexus lender network.</>} />
      <LenderDirectory lenders={lenders} isMember={access.tierLevel > 0} />
    </div>
  );
}
