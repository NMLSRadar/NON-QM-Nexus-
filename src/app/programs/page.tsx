import Link from "next/link";
import { Database, LockKeyhole, ShieldCheck } from "lucide-react";
import { getCurrentOrganizationId, getLenderAccessInfo, getRepository } from "@/lib/session";
import { recordPageView } from "@/lib/activity";
import { Card } from "@/components/ui";
import { ProgramDirectory } from "./program-directory";
import { canonicalizePrograms } from "./program-directory-utils";
import { PremiumPageHero } from "@/components/premium-ui";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  await recordPageView("programs");
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [lenders, programs, access] = await Promise.all([
    repo.listLenders(org),
    repo.listPrograms(org),
    getLenderAccessInfo(),
  ]);
  const canonicalProgramCount = canonicalizePrograms(programs).length;

  return (
    <div className="nexus-workspace nexus-programs-page gold-theme gold-page -mx-4 -my-6 space-y-5 rounded-b-3xl bg-[#050505] px-4 py-6 sm:px-6 sm:py-8">
      <PremiumPageHero
        icon={Database}
        eyebrow={<><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Human-verified directory</>}
        title={<>Non-QM <span className="nexus-title-gold">Programs</span></>}
        description={<>Explore hundreds of verified Non-QM programs across the Nexus lender network.</>}
        aside={programs.length > 0 ? (
            <div className="nexus-directory-size flex shrink-0 items-center gap-3 rounded-xl border border-amber-500/20 bg-black/35 px-4 py-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                <Database className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Directory size</p>
                <p className="text-lg font-bold tabular-nums text-white">{canonicalProgramCount.toLocaleString("en-US")} programs</p>
              </div>
            </div>
          ) : null}
      />

      {programs.length === 0 && access.tierLevel === 0 ? (
        <Card dark>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/30 bg-gradient-to-br from-amber-300/20 via-amber-500/15 to-amber-700/10 text-amber-300 shadow-[0_0_30px_-12px_rgba(245,158,11,0.8)]">
              <LockKeyhole className="h-7 w-7" aria-hidden />
            </span>
            <p className="font-semibold text-white">The program directory is locked for this account.</p>
            <p className="max-w-md text-sm text-slate-400">
              Activate your Non-QM Nexus membership to browse verified lender programs and complete guideline details.
            </p>
            <Link href="/pricing" className="gold-cta-glow inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-amber-600 px-5 py-2.5 text-sm font-semibold text-black shadow-md transition-shadow hover:shadow-lg">
              <ShieldCheck className="h-4 w-4" aria-hidden /> View membership
            </Link>
          </div>
        </Card>
      ) : (
        <ProgramDirectory lenders={lenders} programs={programs} />
      )}
    </div>
  );
}
