"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { setBetaTester } from "./actions";
import { formatRelative, formatAbsolute, formatDay } from "@/lib/relativeTime";
import type { ActivityUserRow, ActivityStatus } from "./types";
import { STATUS_LABELS, ACTIVITY_LABELS, type ActivityEventType } from "./types";

const STATUS_TONE: Record<
  ActivityStatus,
  { ring: string; text: string; bg: string }
> = {
  cancelled: { text: "text-rose-300", bg: "bg-rose-500/10", ring: "ring-rose-500/25" },
  trial_expired: { text: "text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-500/25" },
  trial_expiring: { text: "text-amber-200", bg: "bg-amber-400/10", ring: "ring-amber-400/30" },
  trial: { text: "text-sky-300", bg: "bg-sky-500/10", ring: "ring-sky-500/25" },
  paid: { text: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/25" },
  never_logged_in: { text: "text-slate-400", bg: "bg-slate-500/10", ring: "ring-slate-500/25" },
  inactive: { text: "text-slate-400", bg: "bg-slate-600/10", ring: "ring-slate-600/25" },
  no_plan: { text: "text-slate-300", bg: "bg-slate-500/10", ring: "ring-slate-500/25" },
};

interface Props {
  rows: ActivityUserRow[];
  emptyMessage: string;
}

export function ActivityTable({ rows, emptyMessage }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleBeta(id: string, beta: boolean) {
    setBusy(true);
    try {
      const result = await setBetaTester(id, beta);
      if (result?.error) {
        console.error("Failed to update beta flag:", result.error);
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-amber-500/15 bg-white/[0.02] p-10 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-amber-500/15 bg-white/[0.02]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-amber-500/15 bg-black/30">
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Last Activity</th>
              <th className="px-4 py-3 text-right">Logins</th>
              <th className="px-4 py-3 text-right">Scenarios</th>
              <th className="px-4 py-3">Top Feature</th>
              <th className="px-4 py-3 text-right">Beta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((u) => {
              const isOpen = expanded.has(u.id);
              return (
                <ActivityRow
                  key={u.id}
                  u={u}
                  isOpen={isOpen}
                  onToggle={() => toggle(u.id)}
                  onToggleBeta={(beta) => toggleBeta(u.id, beta)}
                  betaBusy={busy}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivityRow({
  u,
  isOpen,
  onToggle,
  onToggleBeta,
  betaBusy,
}: {
  u: ActivityUserRow;
  isOpen: boolean;
  onToggle: () => void;
  onToggleBeta: (beta: boolean) => void;
  betaBusy: boolean;
}) {
  const tone = STATUS_TONE[u.status];
  const name = u.displayName?.trim();
  const featureCounts = [
    { key: "lender_list", count: u.lenderList },
    { key: "programs", count: u.programs },
    { key: "doc_needs", count: u.docNeeds },
    { key: "products", count: u.products },
    { key: "voice_scenario", count: u.voiceScenarios },
    { key: "ai_assistant", count: u.aiAssistant },
  ]
    .filter((f) => f.count > 0)
    .map((f) => ({ key: f.key as ActivityEventType, count: f.count }));

  return (
    <>
      <tr
        className="cursor-pointer align-top transition-colors hover:bg-white/[0.03] focus:outline-none focus-visible:bg-white/[0.04]"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        aria-label={`${name ?? u.email} details`}
      >
        <td className="px-4 py-3 pr-6">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-slate-600" aria-hidden>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              {name ? <div className="truncate font-medium text-slate-100">{name}</div> : null}
              <div className="truncate text-xs text-slate-400">{u.email}</div>
              {u.nmlsId ? <div className="text-[11px] text-slate-600">NMLS {u.nmlsId}</div> : null}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border ${tone.bg} ${tone.ring} px-2 py-0.5 text-[11px] font-medium ${tone.text}`}
            >
              {STATUS_LABELS[u.status]}
            </span>
            {u.isBeta ? (
              <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                Beta
              </span>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-3 text-slate-300">{u.planName ?? "—"}</td>
        <td className="px-4 py-3">
          <span className="text-slate-300" title={formatAbsolute(u.lastActivity)}>
            {formatRelative(u.lastActivity)}
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-slate-300">{u.logins}</td>
        <td className="px-4 py-3 text-right tabular-nums text-slate-300">{u.scenarios}</td>
        <td className="px-4 py-3 text-slate-300">{u.topFeature ?? "—"}</td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            role="switch"
            aria-checked={u.isBeta}
            aria-label={`Beta tester: ${u.email}`}
            disabled={betaBusy}
            onClick={(e) => {
              e.stopPropagation();
              onToggleBeta(!u.isBeta);
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 ${
              u.isBeta ? "bg-amber-500" : "bg-white/15"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                u.isBeta ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </td>
      </tr>
      {isOpen ? (
        <tr className="bg-black/20">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Key dates */}
              <div>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
                  Dates
                </h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <DateEntry label="Created" value={u.createdAt} />
                  <DateEntry label="Last login" value={u.lastLogin} />
                  <DateEntry label="Trial start" value={u.trialActivatedAt} />
                  <DateEntry label="Trial end" value={u.trialExpiresAt} />
                  <DateEntry label="Subscription start" value={u.subscriptionStartedAt} />
                  <DateEntry label="Beta since" value={u.betaGrantedAt} />
                </dl>
              </div>

              {/* Feature usage */}
              <div>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
                  Feature usage
                </h4>
                {featureCounts.length === 0 ? (
                  <p className="text-xs text-slate-500">No feature events recorded yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {featureCounts.map((f) => (
                      <span
                        key={f.key}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300"
                      >
                        <span className="font-semibold tabular-nums text-amber-300">{f.count}</span>
                        {ACTIVITY_LABELS[f.key] ?? f.key}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="lg:col-span-2">
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
                  Activity timeline · last {u.timeline.length} events
                </h4>
                {u.timeline.length === 0 ? (
                  <p className="text-xs text-slate-500">No activity recorded yet.</p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto pr-2 text-xs">
                    {u.timeline.map((ev, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-4 border-b border-white/5 py-1">
                        <span className="text-slate-300">
                          <span className="mr-1.5 text-slate-600">{formatDay(ev.occurredAt)}</span>
                          {ACTIVITY_LABELS[ev.eventType as ActivityEventType] ?? ev.eventType}
                        </span>
                        <span className="shrink-0 text-slate-500" title={formatAbsolute(ev.occurredAt)}>
                          {formatRelative(ev.occurredAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DateEntry({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-300" title={formatAbsolute(value)}>
        {formatDay(value)}
      </dd>
    </div>
  );
}