import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { LenderDirectory, type DirectoryLender } from "./lender-directory";

export const dynamic = "force-dynamic";

export default async function LendersPage() {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [lenders, programs] = await Promise.all([repo.listLenders(org), repo.listPrograms(org)]);

  const byLender = (tierLevel: number): DirectoryLender[] =>
    lenders
      .filter((l) => l.tierLevel === tierLevel && l.active)
      .map((lender) => ({ lender, programs: programs.filter((p) => p.lenderId === lender.id && p.active) }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lenders"
        subtitle="All lenders below are fictional demonstration entries. Administrators replace them with verified lender records and guideline versions before production use."
      />
      <LenderDirectory tier1={byLender(1)} tier2={byLender(2)} tier3={byLender(3)} />
    </div>
  );
}
