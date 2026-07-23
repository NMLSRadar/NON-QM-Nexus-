import Link from "next/link";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { Card, StatusBadge, fmtUsd } from "@/components/ui";
import type { MatchStatus } from "@/domain/types/enums";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [scenarios, catalog] = await Promise.all([repo.listScenarios(org), repo.getCatalog(org)]);

  const rows = scenarios.map((s) => {
    const analysis = analyzeScenario(s, catalog);
    return { s, best: analysis.evaluations[0] };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scenarios</h1>
        <div className="flex items-center gap-2">
          <Link href="/scenarios/voice" className="rounded-md border border-brand-600 text-brand-700 text-sm font-medium px-4 py-2 hover:bg-brand-50">
            🎤 Voice Scenario
          </Link>
          <Link href="/scenarios/new" className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700">
            + New Scenario
          </Link>
        </div>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4">Scenario</th>
                <th className="py-2 pr-4">Borrower</th>
                <th className="py-2 pr-4">Purpose</th>
                <th className="py-2 pr-4">Doc type</th>
                <th className="py-2 pr-4">Loan amount</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2">Best result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ s, best }) => (
                <tr key={s.id}>
                  <td className="py-2 pr-4">
                    <Link href={`/scenarios/${s.id}`} className="font-medium text-brand-700 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{s.borrowerReference ?? "—"}</td>
                  <td className="py-2 pr-4">{s.loanPurpose?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="py-2 pr-4">{s.incomeDocType ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">{fmtUsd(s.requestedLoanAmount)}</td>
                  <td className="py-2 pr-4">{s.state ?? "—"}</td>
                  <td className="py-2">{best ? <StatusBadge status={best.status as MatchStatus} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
