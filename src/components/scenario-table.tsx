import Link from "next/link";
import { FileText, Mic } from "lucide-react";
import { StatusBadge, fmtUsd, IconBadge, Pill } from "@/components/ui";
import type { Scenario } from "@/domain/types/scenario";
import type { MatchStatus } from "@/domain/types/enums";
import type { ProgramEvaluation } from "@/domain/types/results";

export interface ScenarioRowData {
  scenario: Scenario;
  best?: ProgramEvaluation;
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Modern SaaS scenario table — shared by the Dashboard's "Recent Scenarios"
 * card and the full Scenarios list page, so both stay visually identical.
 * Collapses to stacked cards below `sm` so nothing scrolls horizontally on
 * mobile (see the redesign brief's responsive requirement). */
export function ScenarioTable({ rows }: { rows: ScenarioRowData[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-secondary">
        No scenarios yet — start a Voice Scenario or create one manually to see it here.
      </p>
    );
  }

  return (
    <div>
      {/* Desktop / tablet: real table */}
      <table className="hidden sm:table w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary uppercase tracking-wide">
            <th className="pb-2 font-medium">Scenario</th>
            <th className="pb-2 font-medium">Purpose</th>
            <th className="pb-2 font-medium">Loan amount</th>
            <th className="pb-2 font-medium">State</th>
            <th className="pb-2 font-medium">Best result</th>
            <th className="pb-2 font-medium">Updated</th>
            <th className="pb-2 font-medium sr-only">Open</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {rows.map(({ scenario, best }) => (
            <tr key={scenario.id} className="group transition-colors hover:bg-brand-50/40 rounded-tablecell">
              <td className="py-3 pr-4">
                <Link href={`/scenarios/${scenario.id}`} className="flex items-center gap-3">
                  <IconBadge size="sm">
                    {scenario.name.toLowerCase().startsWith("voice") ? <Mic className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </IconBadge>
                  <div className="min-w-0">
                    <p className="font-medium text-ink-primary group-hover:text-brand-700 transition-colors truncate">{scenario.name}</p>
                    <p className="text-xs text-ink-secondary truncate">{scenario.borrowerReference ?? "—"}</p>
                  </div>
                </Link>
              </td>
              <td className="py-3 pr-4">
                {scenario.loanPurpose ? <Pill tone="neutral">{scenario.loanPurpose.replace(/_/g, " ")}</Pill> : <span className="text-ink-secondary">—</span>}
              </td>
              <td className="py-3 pr-4 font-medium tabular-nums">{fmtUsd(scenario.requestedLoanAmount)}</td>
              <td className="py-3 pr-4 text-ink-secondary">{scenario.state ?? "—"}</td>
              <td className="py-3 pr-4">{best ? <StatusBadge status={best.status as MatchStatus} /> : <span className="text-ink-secondary">—</span>}</td>
              <td className="py-3 pr-4 text-ink-secondary whitespace-nowrap">{timeAgo(scenario.updatedAt)}</td>
              <td className="py-3 text-right">
                <Link href={`/scenarios/${scenario.id}`} className="text-xs font-medium text-brand-700 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: stacked cards, no horizontal scroll */}
      <ul className="sm:hidden space-y-3">
        {rows.map(({ scenario, best }) => (
          <li key={scenario.id}>
            <Link
              href={`/scenarios/${scenario.id}`}
              className="block rounded-control border border-surface-border p-3 hover:border-brand-500 transition-colors"
            >
              <div className="flex items-start gap-3">
                <IconBadge size="sm">
                  {scenario.name.toLowerCase().startsWith("voice") ? <Mic className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </IconBadge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-primary truncate">{scenario.name}</p>
                  <p className="text-xs text-ink-secondary">{scenario.borrowerReference ?? "—"} · {scenario.state ?? "—"}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-medium tabular-nums text-sm">{fmtUsd(scenario.requestedLoanAmount)}</span>
                    {best ? <StatusBadge status={best.status as MatchStatus} /> : null}
                  </div>
                  <p className="mt-1 text-[11px] text-ink-secondary">{timeAgo(scenario.updatedAt)}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
