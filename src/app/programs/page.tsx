import Link from "next/link";
import { getCurrentOrganizationId, getLenderAccessInfo, getRepository } from "@/lib/session";
import { Card, SampleDataBadge, fmtPct, fmtUsd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [lenders, programs, rules, access] = await Promise.all([
    repo.listLenders(org),
    repo.listPrograms(org),
    repo.listRules(org),
    getLenderAccessInfo(),
  ]);
  const lenderName = new Map(lenders.map((l) => [l.id, l.name]));

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-6 sm:p-8">
        <div className="gold-ambient" />
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Programs</h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400">
            The real, human-verified lender program matrix — every program&apos;s structured rules are versioned and
            reviewed before they can run; AI-extracted rules never activate automatically.
          </p>
        </div>
      </div>

      {programs.length === 0 && access.tierLevel === 0 ? (
        <Card dark>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-full text-3xl bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 ring-4 ring-black shadow-lg"
            >
              🔒
            </span>
            <p className="font-semibold text-white">No active subscription — the program matrix is locked for this account.</p>
            <p className="max-w-md text-sm text-slate-400">
              Subscribe to any plan to see the real, human-verified lender programs your tier unlocks.
            </p>
            <Link href="/pricing" className="gold-cta-glow inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-black bg-gradient-to-r from-amber-300 to-amber-600 shadow-md hover:shadow-lg transition-shadow">
              👑 View plans &amp; subscribe
            </Link>
          </div>
        </Card>
      ) : (
        <Card dark>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-amber-500/20">
                  <th className="py-2 pr-4">Program</th>
                  <th className="py-2 pr-4">Lender</th>
                  <th className="py-2 pr-4">Doc types</th>
                  <th className="py-2 pr-4">Max LTV</th>
                  <th className="py-2 pr-4">Min FICO</th>
                  <th className="py-2 pr-4">Max DTI / Min DSCR</th>
                  <th className="py-2 pr-4">Loan range</th>
                  <th className="py-2 pr-4">Reserves</th>
                  <th className="py-2 pr-4">Rules</th>
                  <th className="py-2">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-500/10">
                {programs.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4">
                      <p className="font-medium text-white">{p.name}</p>
                      {p.isSampleData ? <SampleDataBadge /> : null}
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{lenderName.get(p.lenderId)}</td>
                    <td className="py-2 pr-4 text-slate-300">{p.incomeDocTypes.join(", ")}</td>
                    <td className="py-2 pr-4 text-slate-300">{p.matrixConfirmationRequired && p.baseMaxLtv === 0 ? "Confirm matrix" : fmtPct(p.baseMaxLtv, 1)}</td>
                    <td className="py-2 pr-4 text-slate-300">{p.matrixConfirmationRequired && p.minFico === 0 ? "Confirm matrix" : p.minFico > 0 ? p.minFico : "—"}</td>
                    <td className="py-2 pr-4 text-slate-300">
                      {p.maxDti != null ? `DTI ≤ ${p.maxDti}%` : p.minDscr != null ? `DSCR ≥ ${p.minDscr}` : "—"}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-300">
                      {p.matrixConfirmationRequired && p.minLoanAmount === 0 && p.maxLoanAmount === 0 ? "Confirm matrix" : <>{fmtUsd(p.minLoanAmount)}–{fmtUsd(p.maxLoanAmount)}</>}
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{p.matrixConfirmationRequired && p.minReservesMonths === 0 ? "Confirm matrix" : `${p.minReservesMonths} mo`}</td>
                    <td className="py-2 pr-4 tabular-nums text-slate-300">{rules.filter((r) => r.programId === p.id).length}</td>
                    <td className="py-2 text-xs text-slate-400">
                      {p.guidelineVersionLabel} · eff. {p.effectiveDate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
