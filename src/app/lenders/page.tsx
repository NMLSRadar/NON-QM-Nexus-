import { getCurrentOrganizationId, getRepository, getLenderAccessInfo } from "@/lib/session";
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
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-6 sm:p-8">
        <div className="gold-ambient" />
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Lenders</h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-slate-400">
            Compare and access guidelines from the industry&apos;s top NON-QM lenders.
          </p>
        </div>
      </div>
      <LenderDirectory tier1={byLender(1)} tier2={byLender(2)} tier3={byLender(3)} userTierLevel={access.tierLevel} />
    </div>
  );
}
