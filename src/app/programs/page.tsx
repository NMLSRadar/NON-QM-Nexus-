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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Programs</h1>
      <p className="text-sm text-slate-500">
        Demonstration program matrix. Each program&apos;s structured rules are versioned and human-verified before they can
        run; AI-extracted rules never activate automatically.
      </p>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-100">
              {programs.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4">
                    <p className="font-medium">{p.name}</p>
                    {p.isSampleData ? <SampleDataBadge /> : null}
                  </td>
                  <td className="py-2 pr-4">{lenderName.get(p.lenderId)}</td>
                  <td className="py-2 pr-4">{p.incomeDocTypes.join(", ")}</td>
                  <td className="py-2 pr-4">{fmtPct(p.baseMaxLtv, 1)}</td>
                  <td className="py-2 pr-4">{p.minFico > 0 ? p.minFico : "—"}</td>
                  <td className="py-2 pr-4">
                    {p.maxDti != null ? `DTI ≤ ${p.maxDti}%` : p.minDscr != null ? `DSCR ≥ ${p.minDscr}` : "—"}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {fmtUsd(p.minLoanAmount)}–{fmtUsd(p.maxLoanAmount)}
                  </td>
                  <td className="py-2 pr-4">{p.minReservesMonths} mo</td>
                  <td className="py-2 pr-4 tabular-nums">{rules.filter((r) => r.programId === p.id).length}</td>
                  <td className="py-2 text-xs text-slate-500">
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
