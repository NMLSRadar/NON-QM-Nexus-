import { getCurrentOrganizationId, getRepository, getLenderAccessInfo } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { LenderDirectory, type DirectoryLender } from "./lender-directory";

export const dynamic = "force-dynamic";

export default async function LendersPage() {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [allLenders, programs, access] = await Promise.all([repo.listAllLenders(org), repo.listPrograms(org), getLenderAccessInfo()]);

  // listAllLenders is intentionally NOT tier-filtered (every real lender is
  // always visible); listPrograms IS still tier-filtered server-side, so a
  // locked lender's guideline/program data is never sent to the browser at
  // all — the lock is real, not just a CSS overlay. Sample/demo lenders are
  // excluded here — this production directory only ever lists real,
  // verified lender records.
  const byLender = (tierLevel: number): DirectoryLender[] =>
    allLenders
      .filter((l) => l.tierLevel === tierLevel && l.active && !l.isSampleData)
      .map((lender) => ({ lender, programs: programs.filter((p) => p.lenderId === lender.id && p.active) }));

  return (
    <div className="space-y-5">
      <PageHeader title="Lenders" />
      <LenderDirectory tier1={byLender(1)} tier2={byLender(2)} tier3={byLender(3)} userTierLevel={access.tierLevel} />
    </div>
  );
}
