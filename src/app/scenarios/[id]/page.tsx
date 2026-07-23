import Link from "next/link";
import { notFound } from "next/navigation";
import { analyzeScenario } from "@/domain/analyze";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { Card, Stat, fmtNum, fmtPct, fmtUsd } from "@/components/ui";
import type { CalcResult } from "@/domain/types/results";
import { CompareSection } from "./compare";

export const dynamic = "force-dynamic";

function CalcTrace({ calc }: { calc: CalcResult }) {
  return (
    <details className="text-xs text-slate-500">
      <summary className="cursor-pointer hover:text-slate-700">How was this calculated?</summary>
      <div className="mt-1 space-y-1 pl-3 border-l-2 border-slate-200">
        <p className="font-mono">{calc.formula}</p>
        <ul>
          {Object.entries(calc.inputs).map(([k, v]) => (
            <li key={k}>
              {k}: <span className="font-mono">{String(v ?? "—")}</span>
            </li>
          ))}
        </ul>
        {calc.notes?.map((n) => (
          <p key={n} className="text-amber-700">⚠ {n}</p>
        ))}
      </div>
    </details>
  );
}

function fmtCalc(calc: CalcResult): string {
  if (calc.value == null) return "—";
  switch (calc.unit) {
    case "percent":
      return fmtPct(calc.value);
    case "usd":
      return fmtUsd(calc.value);
    case "months":
      return `${calc.value} mo`;
    default:
      return fmtNum(calc.value);
  }
}

export default async function ScenarioResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const scenario = await repo.getScenario(org, id);
  if (!scenario) notFound();
  const catalog = await repo.getCatalog(org);
  const analysis = analyzeScenario(scenario, catalog);

  const grouped = {
    eligible: analysis.evaluations.filter((e) => e.status === "strong_match" || e.status === "eligible"),
    conditional: analysis.evaluations.filter((e) => e.status === "conditional" || e.status === "eligible_with_restructuring"),
    manual: analysis.evaluations.filter((e) => e.status === "manual_review"),
    ineligible: analysis.evaluations.filter((e) => e.status === "ineligible"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{scenario.name}</h1>
          <p className="text-sm text-slate-500">
            {scenario.borrowerReference} · {scenario.loanPurpose?.replace(/_/g, " ")} · {scenario.occupancy} ·{" "}
            {scenario.propertyType?.replace(/_/g, " ")} · {scenario.state}
          </p>
        </div>
        <Link href="/scenarios" className="text-sm text-brand-700 hover:underline">← All scenarios</Link>
      </div>

      {/* 1. Scenario snapshot */}
      <Card title="Scenario snapshot">
        <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3">
          <Stat label="Purchase price" value={fmtUsd(scenario.purchasePrice)} />
          <Stat label="Estimated value" value={fmtUsd(scenario.estimatedValue)} />
          <Stat label="Loan amount" value={fmtUsd(scenario.requestedLoanAmount)} />
          <Stat label="FICO" value={scenario.fico ?? "—"} />
          <Stat label="Citizenship" value={scenario.citizenship?.replace(/_/g, " ") ?? "—"} />
          <Stat label="Income doc" value={scenario.incomeDocType ?? "—"} />
          <Stat label="Housing payment" value={fmtUsd(scenario.monthlyHousingPayment)} />
          <Stat label="Other liabilities" value={fmtUsd(scenario.monthlyLiabilities)} />
          <Stat label="Liquid assets" value={fmtUsd(scenario.liquidAssets)} />
          <Stat label="Vesting" value={scenario.vesting ?? "—"} />
          <Stat label="Cash out" value={fmtUsd(scenario.requestedCashOut)} />
          <Stat label="Interest-only" value={scenario.interestOnlyRequested ? "Requested" : "No"} />
        </dl>
      </Card>

      {/* 2. Calculation summary */}
      <Card title="Calculation summary">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {analysis.calculation.results.map((c) => (
            <div key={c.key} className="border border-slate-100 rounded-md p-3">
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className="text-xl font-semibold tabular-nums">{fmtCalc(c)}</p>
              <CalcTrace calc={c} />
            </div>
          ))}
        </div>
      </Card>

      {/* 3-4. Matches + comparison */}
      <CompareSection grouped={grouped} />

      {/* 7. Restructuring recommendations */}
      <Card title="How to make this work — restructuring options">
        {analysis.restructuring.length === 0 ? (
          <p className="text-sm text-slate-500">No restructuring options identified that would unlock additional programs.</p>
        ) : (
          <div className="space-y-4">
            {analysis.restructuring.map((o, i) => (
              <div key={i} className="border border-slate-200 rounded-md p-3">
                <p className="text-sm font-medium">{o.changedVariable}</p>
                <p className="text-sm text-slate-600">
                  <span className="line-through">{o.currentValue}</span> → <span className="font-medium">{o.suggestedValue}</span>
                </p>
                <p className="text-sm text-slate-600 mt-1">{o.rationale}</p>
                <p className="text-xs text-emerald-700 mt-1">Potentially unlocks: {o.programsPotentiallyUnlocked.join("; ")}</p>
                {o.remainingConcerns.length > 0 && (
                  <p className="text-xs text-amber-700 mt-1">Remaining concerns: {o.remainingConcerns.join(" · ")}</p>
                )}
                <p className="text-xs text-slate-500 mt-1">Required verification: {o.requiredVerification.join(" · ")}</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Restructuring options are honest structural changes only. Never misrepresent occupancy, income, assets,
          employment, ownership, citizenship, property use, or loan purpose.
        </p>
      </Card>

      {/* 6. Needs list */}
      <Card title="Document needs list">
        <ul className="divide-y divide-slate-100">
          {analysis.needsList.map((n, i) => (
            <li key={i} className="py-2 flex items-start gap-3 text-sm">
              <span
                className={`mt-0.5 inline-block rounded px-1.5 text-[11px] font-medium ${
                  n.required ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {n.required ? "Required" : "If applicable"}
              </span>
              <div>
                <p className="font-medium text-slate-800">{n.label}</p>
                <p className="text-xs text-slate-500">{n.reason}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-slate-500 border-t border-slate-200 pt-4">{analysis.disclaimer}</p>
    </div>
  );
}
