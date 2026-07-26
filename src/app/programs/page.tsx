import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { Card, SampleDataBadge, fmtPct, fmtUsd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [lenders, programs, rules] = await Promise.all([
    repo.listLenders(org),
    repo.listPrograms(org),
    repo.listRules(org),
  ]);
  const lenderName = new Map(lenders.map((l) => [l.id, l.name]));

  return (
    <div className="gold-theme -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-6 sm:p-8">
        <div className="gold-ambient" />
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Programs</h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400">
            Demonstration program matrix. Each program&apos;s structured rules are versioned and human-verified before they
            can run; AI-extracted rules never activate automatically.
          </p>
        </div>
      </div>
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
                  <td className="py-2 pr-4 text-slate-300">{fmtPct(p.baseMaxLtv, 1)}</td>
                  <td className="py-2 pr-4 text-slate-300">{p.minFico > 0 ? p.minFico : "—"}</td>
                  <td className="py-2 pr-4 text-slate-300">
                    {p.maxDti != null ? `DTI ≤ ${p.maxDti}%` : p.minDscr != null ? `DSCR ≥ ${p.minDscr}` : "—"}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-300">
                    {fmtUsd(p.minLoanAmount)}–{fmtUsd(p.maxLoanAmount)}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{p.minReservesMonths} mo</td>
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
    </div>
  );
}
