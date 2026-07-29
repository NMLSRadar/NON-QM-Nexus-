import Link from "next/link";
import { FileText, Mic, Upload, Sparkles, CheckCircle2, AlertTriangle, XCircle, Star } from "lucide-react";
import { StatusBadge, fmtUsd, IconBadge, Pill } from "@/components/ui";
import { ScenarioRowActions } from "@/components/scenario-row-actions";
import type { Scenario } from "@/domain/types/scenario";
import type { LoanPurpose, MatchStatus } from "@/domain/types/enums";
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

/** Which of the 4 built-in intake channels a scenario came from — drives the
 * dark-variant's premium circular icon (mic / document / upload / spark).
 * "Voice scenario" is the only channel the app currently auto-names that
 * way; anything AI-extracted-from-a-document is surfaced elsewhere as an
 * import, everything else (the manual New Scenario form) is a document. */
function channelIcon(name: string) {
  const n = name.toLowerCase();
  if (n.startsWith("voice")) return Mic;
  if (n.includes("import")) return Upload;
  if (n.includes("ai")) return Sparkles;
  return FileText;
}

/** Dark-variant purpose badge — outlined pill, color-coded by loan purpose. */
const PURPOSE_BADGE: Record<LoanPurpose, { label: string; className: string }> = {
  purchase: { label: "Purchase", className: "border-amber-400/50 text-amber-300 bg-amber-400/5" },
  rate_term_refinance: { label: "Refinance", className: "border-sky-400/50 text-sky-300 bg-sky-400/5" },
  cash_out_refinance: { label: "Cash-Out", className: "border-purple-400/50 text-purple-300 bg-purple-400/5" },
  heloc: { label: "HELOC", className: "border-emerald-400/50 text-emerald-300 bg-emerald-400/5" },
  second_lien: { label: "Second Lien", className: "border-rose-400/50 text-rose-300 bg-rose-400/5" },
};

function DarkPurposeBadge({ purpose }: { purpose: LoanPurpose | undefined }) {
  if (!purpose) return <span className="text-slate-500">—</span>;
  const b = PURPOSE_BADGE[purpose];
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${b.className}`}>
      {b.label}
    </span>
  );
}

/** Dark-variant "Best Result" badge — colored glow/border + icon per status,
 * matching the mockup's Strong Match / Eligible w/ Restructuring / Needs
 * Review / Ineligible treatment across all 6 real MatchStatus values. */
const DARK_STATUS: Record<MatchStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  strong_match: { label: "Strong match", className: "border-emerald-400/60 text-emerald-300 bg-emerald-400/10 shadow-[0_0_14px_-4px_rgba(52,211,153,0.6)]", Icon: CheckCircle2 },
  eligible: { label: "Eligible", className: "border-emerald-400/50 text-emerald-300 bg-emerald-400/5 shadow-[0_0_10px_-6px_rgba(52,211,153,0.5)]", Icon: CheckCircle2 },
  eligible_with_restructuring: { label: "Eligible w/ restructuring", className: "border-amber-400/60 text-amber-300 bg-amber-400/10 shadow-[0_0_14px_-4px_rgba(212,175,55,0.6)]", Icon: Star },
  conditional: { label: "Needs review", className: "border-orange-400/60 text-orange-300 bg-orange-400/10 shadow-[0_0_14px_-4px_rgba(251,146,60,0.6)]", Icon: AlertTriangle },
  manual_review: { label: "Needs review", className: "border-orange-400/60 text-orange-300 bg-orange-400/10 shadow-[0_0_14px_-4px_rgba(251,146,60,0.6)]", Icon: AlertTriangle },
  ineligible: { label: "Ineligible", className: "border-rose-500/60 text-rose-400 bg-rose-500/10 shadow-[0_0_14px_-4px_rgba(244,63,94,0.6)]", Icon: XCircle },
};

function DarkStatusBadge({ status }: { status: MatchStatus }) {
  const s = DARK_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold whitespace-nowrap ${s.className}`}>
      <s.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {s.label}
    </span>
  );
}

/** Modern SaaS scenario table — shared by the Dashboard's "Recent Scenarios"
 * card and the full Scenarios list page, so both stay visually identical.
 * `variant="dark"` renders the premium black/gold card-row redesign (used
 * only on the Dashboard); the default `variant="light"` is byte-for-byte
 * the original light-theme table the /scenarios list page already relies
 * on — nothing about that call site changes. Collapses to stacked cards
 * below `sm` so nothing scrolls horizontally on mobile either way. */
export function ScenarioTable({ rows, variant = "light" }: { rows: ScenarioRowData[]; variant?: "light" | "dark" }) {
  if (rows.length === 0) {
    return (
      <p className={`py-8 text-center text-sm ${variant === "dark" ? "text-slate-400" : "text-ink-secondary"}`}>
        No scenarios yet — start a Voice Scenario or create one manually to see it here.
      </p>
    );
  }

  if (variant === "dark") return <DarkScenarioTable rows={rows} />;

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
                    <p className="text-xs text-ink-secondary truncate">{scenario.borrowerReference ? `Ref: ${scenario.borrowerReference}` : "—"}</p>
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
                  <p className="text-xs text-ink-secondary">{scenario.borrowerReference ? `Ref: ${scenario.borrowerReference}` : "—"} · {scenario.state ?? "—"}</p>
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

/** A human-readable purpose subtitle line under the scenario name, e.g.
 * "Purchase scenario" / "Cash-Out Refinance" — matches the mockup's
 * left-column secondary line exactly. */
function purposeSubtitle(purpose: LoanPurpose | undefined): string {
  if (!purpose) return "Scenario";
  if (purpose === "purchase") return "Purchase scenario";
  if (purpose === "cash_out_refinance") return "Cash-Out Refinance";
  if (purpose === "heloc") return "HELOC";
  if (purpose === "second_lien") return "Second Lien";
  return "Refinancing Scenario";
}

function DarkScenarioTable({ rows }: { rows: ScenarioRowData[] }) {
  return (
    <div>
      {/* Desktop / tablet: premium card-rows */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-[minmax(0,2.1fr)_120px_140px_70px_200px_100px_40px] items-center gap-4 px-2 pb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500">
          <span>Scenario</span>
          <span>Purpose</span>
          <span>Loan amount</span>
          <span>State</span>
          <span>Best result</span>
          <span>Updated</span>
          <span className="sr-only">Actions</span>
        </div>
        <ul className="space-y-2.5">
          {rows.map(({ scenario, best }, i) => {
            const Icon = channelIcon(scenario.name);
            return (
              <li
                key={scenario.id}
                className="gold-scenario-card gold-fade-up grid grid-cols-[minmax(0,2.1fr)_120px_140px_70px_200px_100px_40px] items-center gap-4 rounded-2xl border px-4 py-4 min-h-[84px]"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <Link href={`/scenarios/${scenario.id}`} className="flex min-w-0 items-center gap-3">
                  <span className="gold-icon-badge relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
                    <Icon className="h-5 w-5 text-amber-300" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[19px] font-bold leading-tight text-white">{scenario.name}</p>
                    <p className="mt-0.5 truncate text-[15px] text-slate-400">{purposeSubtitle(scenario.loanPurpose)}</p>
                  </div>
                </Link>
                <DarkPurposeBadge purpose={scenario.loanPurpose} />
                <span className="text-[20px] font-bold tabular-nums text-white">{fmtUsd(scenario.requestedLoanAmount)}</span>
                <span className="text-[15px] text-slate-400">{scenario.state ?? "—"}</span>
                <span>{best ? <DarkStatusBadge status={best.status as MatchStatus} /> : <span className="text-slate-500">—</span>}</span>
                <span className="text-[15px] text-slate-400 whitespace-nowrap">{timeAgo(scenario.updatedAt)}</span>
                <ScenarioRowActions scenarioId={scenario.id} />
              </li>
            );
          })}
        </ul>
      </div>

      {/* Mobile: stacked premium cards */}
      <ul className="sm:hidden space-y-3">
        {rows.map(({ scenario, best }) => {
          const Icon = channelIcon(scenario.name);
          return (
            <li key={scenario.id} className="gold-scenario-card gold-fade-up rounded-2xl border p-4">
              <div className="flex items-start gap-3">
                <Link href={`/scenarios/${scenario.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="gold-icon-badge relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                    <Icon className="h-4.5 w-4.5 text-amber-300" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[18px] font-bold leading-tight text-white">{scenario.name}</p>
                    <p className="mt-0.5 text-[14px] text-slate-400">{purposeSubtitle(scenario.loanPurpose)}</p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <DarkPurposeBadge purpose={scenario.loanPurpose} />
                      <span className="text-[18px] font-bold tabular-nums text-white">{fmtUsd(scenario.requestedLoanAmount)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      {best ? <DarkStatusBadge status={best.status as MatchStatus} /> : <span className="text-slate-500 text-sm">—</span>}
                      <span className="text-[13px] text-slate-500">{timeAgo(scenario.updatedAt)}</span>
                    </div>
                  </div>
                </Link>
                <ScenarioRowActions scenarioId={scenario.id} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
